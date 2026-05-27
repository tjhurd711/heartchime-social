create extension if not exists pgcrypto;

create table if not exists public.social_video_library (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('scenic-clip', 'scenic-final', 'poem-clip', 'poem-final')),
  job_id text not null,
  parent_job_id text,
  clip_count integer not null default 1,
  duration_seconds integer not null,
  s3_key text not null,
  bucket text not null default 'heartbeat-photos-prod',
  prompt text,
  memory_thought text,
  created_at timestamptz not null default now()
);

create unique index if not exists social_video_library_s3_key_key
  on public.social_video_library (s3_key);

create index if not exists social_video_library_created_at_idx
  on public.social_video_library (created_at desc);

create index if not exists social_video_library_job_id_idx
  on public.social_video_library (job_id);

create index if not exists social_video_library_parent_job_id_idx
  on public.social_video_library (parent_job_id);
