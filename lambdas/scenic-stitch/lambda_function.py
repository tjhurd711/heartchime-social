import json, os, subprocess, boto3
from social_video_library import insert_social_video_library_row

s3 = boto3.client('s3')
FFMPEG = '/opt/bin/ffmpeg'
DEFAULT_BUCKET = 'heartbeat-photos-prod'

def handler(event, context):
    job_id     = event['parentJobId']
    clip_keys  = event['clipKeys']
    in_bucket  = event.get('bucket', DEFAULT_BUCKET)
    out_bucket = event.get('output_bucket', DEFAULT_BUCKET)
    out_key    = f"scenic-video/{job_id}/final.mp4"

    work = f"/tmp/{job_id}"
    os.makedirs(work, exist_ok=True)
    local_clips = []
    for i, key in enumerate(clip_keys):
        local = f"{work}/clip_{i:03d}.mp4"
        s3.download_file(in_bucket, key, local)
        local_clips.append(local)

    listfile = f"{work}/list.txt"
    with open(listfile, 'w') as f:
        for c in local_clips:
            f.write(f"file '{c}'\n")
    final = f"{work}/final.mp4"
    subprocess.run([FFMPEG, '-y', '-f', 'concat', '-safe', '0', '-i', listfile,
                    '-c', 'copy', '-movflags', '+faststart', final], check=True)

    s3.upload_file(final, out_bucket, out_key, ExtraArgs={'ContentType': 'video/mp4'})
    meta = {'parentJobId': job_id, 'key': out_key, 'bucket': out_bucket,
            'clipCount': len(clip_keys)}
    s3.put_object(Bucket=out_bucket, Key=f"scenic-video/{job_id}/final-metadata.json",
                  Body=json.dumps(meta), ContentType='application/json')
    try:
        insert_social_video_library_row({
            'source': 'scenic-final',
            'job_id': job_id,
            'parent_job_id': job_id,
            'clip_count': len(clip_keys),
            'duration_seconds': 8 * len(clip_keys),
            's3_key': out_key,
            'bucket': out_bucket,
        })
    except Exception as exc:
        print(f'SOCIAL_VIDEO_LIBRARY_INSERT_FAILED jobId={job_id} msg={exc}')
    return {'statusCode': 200, 'body': json.dumps(meta)}
