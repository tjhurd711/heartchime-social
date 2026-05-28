import json
import os
import time
from datetime import datetime, timezone

import boto3
from google import genai
from google.genai import types
from social_video_library import infer_parent_job_id, insert_social_video_library_row

MODEL_NAME = 'veo-3.1-lite-generate-preview'
OUTPUT_BUCKET = 'heartbeat-photos-prod'
DEFAULT_DURATION_SECONDS = 8
VALID_DURATIONS = {4, 6, 8}
POLL_INTERVAL_SECONDS = 10

s3_client = boto3.client('s3')


def _parse_duration(raw_value) -> int:
  try:
    duration = int(raw_value)
  except (TypeError, ValueError):
    return DEFAULT_DURATION_SECONDS
  return duration if duration in VALID_DURATIONS else DEFAULT_DURATION_SECONDS


def _extract_video_from_operation(operation):
  result = getattr(operation, 'result', None)
  if result and getattr(result, 'generated_videos', None):
    generated = result.generated_videos
    if generated:
      return generated[0].video

  response = getattr(operation, 'response', None)
  if response and getattr(response, 'generated_videos', None):
    generated = response.generated_videos
    if generated:
      return generated[0].video

  return None


def _write_error_marker(job_id: str, error_text: str):
  if not job_id:
    return

  error_key = f'scenic-video/{job_id}/error.json'
  payload = {
    'jobId': job_id,
    'error': error_text or 'no_video_output',
    'failedAt': datetime.now(timezone.utc).isoformat(),
  }
  try:
    s3_client.put_object(
      Bucket=OUTPUT_BUCKET,
      Key=error_key,
      Body=json.dumps(payload, separators=(',', ':')).encode('utf-8'),
      ContentType='application/json',
    )
  except Exception as marker_exc:
    print(f'ERROR_MARKER_WRITE_FAILED jobId={job_id} msg={marker_exc}')


def handler(event, context):
  job_id = str((event or {}).get('jobId') or '').strip()
  prompt = str((event or {}).get('prompt') or '').strip()
  print(f'INVOKE jobId={job_id} promptStart={prompt[:80]}')

  try:
    payload = event or {}
    api_key = os.environ.get('GEMINI_API_KEY', '').strip()
    if not api_key:
      raise ValueError('GEMINI_API_KEY is not configured')

    job_id = str(payload.get('jobId') or '').strip()
    prompt = str(payload.get('prompt') or '').strip()
    duration_seconds = _parse_duration(payload.get('durationSeconds'))

    if not job_id:
      raise ValueError('jobId is required')
    if not prompt:
      raise ValueError('prompt is required')

    clip_key = f'scenic-video/{job_id}/clip-0.mp4'
    metadata_key = f'scenic-video/{job_id}/metadata.json'
    aws_region = os.environ.get('AWS_REGION', 'us-east-2')
    s3_url = f'https://{OUTPUT_BUCKET}.s3.{aws_region}.amazonaws.com/{clip_key}'

    client = genai.Client(api_key=api_key)

    operation = client.models.generate_videos(
      model=MODEL_NAME,
      prompt=prompt,
      config=types.GenerateVideosConfig(
        number_of_videos=1,
        duration_seconds=duration_seconds,
        aspect_ratio='9:16',
        resolution='720p',
      ),
    )

    while not operation.done:
      time.sleep(POLL_INTERVAL_SECONDS)
      operation = client.operations.get(operation=operation)

    video = _extract_video_from_operation(operation)
    if video is None:
      exc = RuntimeError('Video generation completed without video output')
      print(f'NO_VIDEO_OUTPUT jobId={job_id} likely_safety_block operation_done={operation.done}')
      _write_error_marker(job_id, str(exc) or 'no_video_output')
      raise exc

    video_bytes = client.files.download(file=video)
    if not video_bytes and getattr(video, 'video_bytes', None):
      video_bytes = video.video_bytes
    if not video_bytes:
      raise RuntimeError('Failed to download generated video bytes')

    s3_client.put_object(
      Bucket=OUTPUT_BUCKET,
      Key=clip_key,
      Body=video_bytes,
      ContentType='video/mp4',
    )

    metadata = {
      'jobId': job_id,
      'prompt': prompt,
      'durationSeconds': duration_seconds,
      'model': MODEL_NAME,
      'generateAudio': False,
      'bucket': OUTPUT_BUCKET,
      'key': clip_key,
      'url': s3_url,
      'videoUri': getattr(video, 'uri', None),
      'completedAt': datetime.now(timezone.utc).isoformat(),
    }
    s3_client.put_object(
      Bucket=OUTPUT_BUCKET,
      Key=metadata_key,
      Body=json.dumps(metadata, separators=(',', ':')).encode('utf-8'),
      ContentType='application/json',
    )

    insert_social_video_library_row(
      {
        'source': 'scenic-clip',
        'job_id': job_id,
        'parent_job_id': infer_parent_job_id(job_id),
        'clip_count': 1,
        'duration_seconds': duration_seconds,
        's3_key': clip_key,
        'bucket': OUTPUT_BUCKET,
        'prompt': prompt,
      }
    )

    return {
      'statusCode': 200,
      'body': json.dumps(
        {
          'jobId': job_id,
          'key': clip_key,
          'url': s3_url,
          'durationSeconds': duration_seconds,
        }
      ),
    }
  except Exception as exc:
    print(f'HANDLER_ERROR jobId={job_id} type={type(exc).__name__} msg={exc}')
    _write_error_marker(job_id, str(exc) or 'no_video_output')
    return {
      'statusCode': 500,
      'body': json.dumps({'error': str(exc)}),
    }
