import json
import os
import re
from typing import Any, Dict, Optional
from urllib import error, request


_CHILD_JOB_SUFFIX = re.compile(r'^(?P<parent>.+)-c\d+$')


def infer_parent_job_id(job_id: str) -> Optional[str]:
  match = _CHILD_JOB_SUFFIX.match((job_id or '').strip())
  if not match:
    return None
  return match.group('parent')


def insert_social_video_library_row(row: Dict[str, Any]) -> None:
  supabase_url = os.environ.get('SUPABASE_URL', '').strip()
  service_role_key = os.environ.get('SUPABASE_SERVICE_ROLE_KEY', '').strip()
  if not supabase_url or not service_role_key:
    raise RuntimeError('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required')

  endpoint = f"{supabase_url.rstrip('/')}/rest/v1/social_video_library"
  payload = json.dumps(row, separators=(',', ':')).encode('utf-8')
  req = request.Request(
    endpoint,
    data=payload,
    method='POST',
    headers={
      'apikey': service_role_key,
      'Authorization': f'Bearer {service_role_key}',
      'Content-Type': 'application/json',
      'Prefer': 'resolution=merge-duplicates,return=minimal',
    },
  )
  try:
    with request.urlopen(req, timeout=10) as response:
      if response.status not in (200, 201):
        raise RuntimeError(f'social_video_library insert failed with status {response.status}')
  except error.HTTPError as exc:
    detail = exc.read().decode('utf-8', errors='replace')
    raise RuntimeError(f'social_video_library insert failed: {exc.code} {detail}') from exc
