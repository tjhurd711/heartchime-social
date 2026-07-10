create extension if not exists pgcrypto;

create table if not exists public.celebrity_videos (
  id uuid primary key default gen_random_uuid(),
  celebrity_name text not null,
  video_id text not null,
  source_url text not null,
  phase text not null check (phase in ('intro', 'clip')),
  s3_key text,
  bucket text not null default 'heartbeat-photos-prod',
  status text not null check (status in ('searching', 'downloading', 'ready', 'failed')),
  search_query text,
  title text,
  error text,
  duration_seconds double precision,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists celebrity_videos_video_id_key
  on public.celebrity_videos (video_id);

create index if not exists celebrity_videos_celebrity_name_status_idx
  on public.celebrity_videos (celebrity_name, status);

create index if not exists celebrity_videos_created_at_idx
  on public.celebrity_videos (created_at desc);

comment on table public.celebrity_videos is
  'YouTube clips fetched for celebrity memorial reels (celebrity_clips fetcher).';

comment on column public.celebrity_videos.status is
  'searching = selected from YouTube, not downloaded; downloading = yt-dlp in progress; ready = on S3; failed = download error';
