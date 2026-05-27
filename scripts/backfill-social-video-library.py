#!/usr/bin/env python3
import json
import os
import re
from typing import Any, Dict, Optional
from urllib import error as urllib_error
from urllib import parse as urllib_parse
from urllib import request as urllib_request

import boto3


BUCKET = 'heartbeat-photos-prod'
PREFIX = 'scenic-video/'
CHILD_CLIP_RE = re.compile(r'^scenic-video/(?P<job_id>.+)/clip-0\.mp4$')


def infer_parent_job_id(job_id: str) -> Optional[str]:
  if '-c' not in job_id:
    return None
  head, sep, tail = job_id.rpartition('-c')
  if not sep or not tail.isdigit():
    return None
  return head or None


def supabase_request(
  method: str,
  path: str,
  service_role_key: str,
  payload: Optional[Dict[str, Any]] = None,
) -> Any:
  supabase_url = os.environ.get('SUPABASE_URL', '').strip()
  if not supabase_url:
    raise RuntimeError('SUPABASE_URL is required')

  endpoint = f"{supabase_url.rstrip('/')}{path}"
  body = None
  headers = {
    'apikey': service_role_key,
    'Authorization': f'Bearer {service_role_key}',
  }
  if payload is not None:
    body = json.dumps(payload, separators=(',', ':')).encode('utf-8')
    headers['Content-Type'] = 'application/json'

  req = urllib_request.Request(endpoint, data=body, method=method, headers=headers)
  try:
    with urllib_request.urlopen(req, timeout=20) as response:
      raw = response.read().decode('utf-8', errors='replace')
      if not raw:
        return None
      return json.loads(raw)
  except urllib_error.HTTPError as exc:
    detail = exc.read().decode('utf-8', errors='replace')
    raise RuntimeError(f'Supabase request failed: {exc.code} {detail}') from exc


def row_exists(service_role_key: str, s3_key: str) -> bool:
  query = urllib_parse.quote(f's3_key.eq.{s3_key}', safe='=.,')
  path = f'/rest/v1/social_video_library?select=id&{query}&limit=1'
  data = supabase_request('GET', path, service_role_key)
  return isinstance(data, list) and len(data) > 0


def insert_row(service_role_key: str, row: Dict[str, Any]) -> None:
  path = '/rest/v1/social_video_library'
  supabase_request('POST', path, service_role_key, row)


def read_duration_seconds(s3_client: Any, key: str) -> int:
  metadata_key = key.replace('/clip-0.mp4', '/metadata.json')
  try:
    result = s3_client.get_object(Bucket=BUCKET, Key=metadata_key)
    raw = result['Body'].read().decode('utf-8', errors='replace')
    parsed = json.loads(raw)
    duration = int(parsed.get('durationSeconds') or 8)
    return duration if duration > 0 else 8
  except Exception:
    return 8


def read_prompt(s3_client: Any, key: str) -> Optional[str]:
  metadata_key = key.replace('/clip-0.mp4', '/metadata.json')
  try:
    result = s3_client.get_object(Bucket=BUCKET, Key=metadata_key)
    raw = result['Body'].read().decode('utf-8', errors='replace')
    parsed = json.loads(raw)
    prompt = str(parsed.get('prompt') or '').strip()
    return prompt or None
  except Exception:
    return None


def main() -> None:
  service_role_key = os.environ.get('SUPABASE_SERVICE_ROLE_KEY', '').strip()
  if not service_role_key:
    raise RuntimeError('SUPABASE_SERVICE_ROLE_KEY is required')

  s3_client = boto3.client('s3')
  continuation_token = None
  scanned = 0
  inserted = 0
  skipped_existing = 0

  while True:
    kwargs: Dict[str, Any] = {'Bucket': BUCKET, 'Prefix': PREFIX, 'MaxKeys': 1000}
    if continuation_token:
      kwargs['ContinuationToken'] = continuation_token
    response = s3_client.list_objects_v2(**kwargs)
    contents = response.get('Contents') or []

    for obj in contents:
      key = str(obj.get('Key') or '')
      match = CHILD_CLIP_RE.match(key)
      if not match:
        continue
      scanned += 1

      if row_exists(service_role_key, key):
        skipped_existing += 1
        continue

      job_id = match.group('job_id')
      row = {
        'source': 'scenic-clip',
        'job_id': job_id,
        'parent_job_id': infer_parent_job_id(job_id),
        'clip_count': 1,
        'duration_seconds': read_duration_seconds(s3_client, key),
        's3_key': key,
        'bucket': BUCKET,
        'prompt': read_prompt(s3_client, key),
      }
      insert_row(service_role_key, row)
      inserted += 1
      if inserted % 50 == 0:
        print(f'Inserted {inserted} rows so far...')

    if not response.get('IsTruncated'):
      break
    continuation_token = response.get('NextContinuationToken')

  print(
    json.dumps(
      {
        'bucket': BUCKET,
        'scanned_clip_keys': scanned,
        'inserted_rows': inserted,
        'skipped_existing_rows': skipped_existing,
      },
      indent=2,
    )
  )


if __name__ == '__main__':
  main()
