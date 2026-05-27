import json, os, subprocess, boto3
from social_video_library import insert_social_video_library_row

s3 = boto3.client('s3')
FFMPEG = '/opt/bin/ffmpeg'
DEFAULT_BUCKET = 'heartbeat-photos-prod'
XFADE = 0.7  # seconds of crossfade overlap

def handler(event, context):
    job_id      = event['parentJobId']
    clip_keys   = event['clipKeys']           # ordered list
    voice_key   = event['voiceKey']
    voice_dur   = float(event['voiceDuration'])
    keep_amb    = bool(event.get('keepAmbient', False))
    in_bucket   = event.get('bucket', DEFAULT_BUCKET)
    out_bucket  = event.get('output_bucket', DEFAULT_BUCKET)
    out_key     = f"poem-video/{job_id}/final.mp4"

    work = f"/tmp/{job_id}"
    os.makedirs(work, exist_ok=True)

    # download clips + voice
    local_clips = []
    for i, k in enumerate(clip_keys):
        p = f"{work}/clip_{i:03d}.mp4"
        s3.download_file(in_bucket, k, p)
        local_clips.append(p)
    voice_path = f"{work}/voice.mp3"
    s3.download_file(in_bucket, voice_key, voice_path)

    n = len(local_clips)
    # Build xfade chain. Each Veo clip is 8s. Crossfade = XFADE.
    # offsets for xfade: clip i fades at (i+1)*8 - (i+1)*XFADE
    inputs = []
    for c in local_clips:
        inputs += ['-i', c]
    inputs += ['-i', voice_path]

    # Video xfade chain
    if n == 1:
        v_filter = "[0:v]format=yuv420p[v]"
    else:
        chain = []
        prev = "[0:v]"
        cum = 8.0
        for i in range(1, n):
            offset = cum - XFADE
            out = f"[v{i}]"
            chain.append(f"{prev}[{i}:v]xfade=transition=fade:duration={XFADE}:offset={offset}{out}")
            prev = out
            cum = cum + 8.0 - XFADE
        v_filter = ";".join(chain) + f";{prev}format=yuv420p[v]"

    # Audio: voice always at full. Optional ambient from each clip ducked to 0.15 and concatenated.
    if keep_amb:
        # build ambient track by crossfading clip audios same way (acrossfade)
        if n == 1:
            a_amb = "[0:a]volume=0.15[amb]"
        else:
            chain = []
            prev = "[0:a]"
            for i in range(1, n):
                out = f"[a{i}]"
                chain.append(f"{prev}[{i}:a]acrossfade=d={XFADE}{out}")
                prev = out
            a_amb = ";".join(chain) + f";{prev}volume=0.15[amb]"
        # voice is the last input index = n
        a_filter = f"{a_amb};[{n}:a]volume=1.0[voice];[voice][amb]amix=inputs=2:duration=longest:dropout_transition=0[a]"
    else:
        a_filter = f"[{n}:a]anull[a]"

    final = f"{work}/final.mp4"
    cmd = [FFMPEG, '-y'] + inputs + [
        '-filter_complex', f"{v_filter};{a_filter}",
        '-map', '[v]', '-map', '[a]',
        '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'veryfast',
        '-c:a', 'aac', '-b:a', '192k',
        '-t', str(voice_dur),         # trim final video to exact voice length
        '-movflags', '+faststart',
        final,
    ]
    subprocess.run(cmd, check=True)

    s3.upload_file(final, out_bucket, out_key, ExtraArgs={'ContentType': 'video/mp4'})
    meta = {'parentJobId': job_id, 'key': out_key, 'bucket': out_bucket,
            'clipCount': n, 'voiceDuration': voice_dur, 'keepAmbient': keep_amb}
    s3.put_object(Bucket=out_bucket, Key=f"poem-video/{job_id}/final-metadata.json",
                  Body=json.dumps(meta), ContentType='application/json')
    try:
        insert_social_video_library_row({
            'source': 'poem-final',
            'job_id': job_id,
            'parent_job_id': job_id,
            'clip_count': n,
            'duration_seconds': int(round(voice_dur)),
            's3_key': out_key,
            'bucket': out_bucket,
        })
    except Exception as exc:
        print(f'SOCIAL_VIDEO_LIBRARY_INSERT_FAILED jobId={job_id} msg={exc}')
    return {'statusCode': 200, 'body': json.dumps(meta)}
