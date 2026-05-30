import json, os, subprocess, boto3, uuid

s3 = boto3.client('s3')
FFMPEG = '/opt/bin/ffmpeg'
W, H, FPS = 1080, 1920, 30
DEFAULT_BUCKET = 'heartbeat-photos-prod'

def _ext(key):
    e = os.path.splitext(key)[1]
    return e if e else '.jpg'

def handler(event, context):
    job_id     = event.get('jobId', str(uuid.uuid4()))
    in_bucket  = event.get('bucket', DEFAULT_BUCKET)
    photo_keys = event['photo_keys']
    spp        = float(event.get('seconds_per_photo', 2))
    music_key  = event.get('music_key')
    out_bucket = event.get('output_bucket', DEFAULT_BUCKET)
    out_key    = f"memorial-slideshow/{job_id}/video.mp4"

    work = f"/tmp/{job_id}"
    os.makedirs(work, exist_ok=True)
    clips = []

    for i, key in enumerate(photo_keys):
        src  = f"{work}/src_{i}{_ext(key)}"
        clip = f"{work}/clip_{i:03d}.mp4"
        s3.download_file(in_bucket, key, src)
        vf = (f"scale={W}:{H}:force_original_aspect_ratio=decrease,"
              f"pad={W}:{H}:(ow-iw)/2:(oh-ih)/2,setsar=1,"
              f"fade=t=in:st=0:d=0.3,fade=t=out:st={spp-0.3}:d=0.3,format=yuv420p")
        subprocess.run([FFMPEG,'-y','-loop','1','-i',src,'-t',str(spp),
                        '-vf',vf,'-r',str(FPS),'-c:v','libx264','-pix_fmt','yuv420p',clip],
                       check=True)
        clips.append(clip)

    listfile = f"{work}/list.txt"
    with open(listfile,'w') as f:
        for c in clips: f.write(f"file '{c}'\n")

    silent = f"{work}/silent.mp4"
    subprocess.run([FFMPEG,'-y','-f','concat','-safe','0','-i',listfile,
                    '-c','copy','-movflags','+faststart',silent],check=True)

    duration = spp * len(photo_keys)
    final = silent
    if music_key:
        music = f"{work}/music{_ext(music_key)}"
        s3.download_file(in_bucket, music_key, music)
        final = f"{work}/final.mp4"
        subprocess.run([FFMPEG,'-y','-i',silent,'-i',music,
                        '-map','0:v','-map','1:a','-c:v','copy','-c:a','aac','-b:a','192k',
                        '-af',f"afade=t=out:st={max(duration-1,0)}:d=1",
                        '-movflags','+faststart','-shortest',final],check=True)

    s3.upload_file(final, out_bucket, out_key, ExtraArgs={'ContentType':'video/mp4'})
    meta = {'jobId':job_id,'key':out_key,'bucket':out_bucket,
            'photoCount':len(photo_keys),'secondsPerPhoto':spp,'duration':duration}
    s3.put_object(Bucket=out_bucket, Key=f"memorial-slideshow/{job_id}/metadata.json",
                  Body=json.dumps(meta), ContentType='application/json')
    url = s3.generate_presigned_url('get_object',
            Params={'Bucket':out_bucket,'Key':out_key}, ExpiresIn=86400)
    return {'statusCode':200,'body':json.dumps({**meta,'url':url})}
