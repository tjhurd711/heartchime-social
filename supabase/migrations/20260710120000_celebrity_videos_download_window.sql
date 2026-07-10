-- Optional download window metadata for celebrity clip fetches.
alter table public.celebrity_videos
  add column if not exists download_start_seconds double precision,
  add column if not exists download_duration_seconds double precision;

comment on column public.celebrity_videos.download_start_seconds is
  'Source timeline start (seconds) of the downloaded window; 0 = beginning of YouTube video';

comment on column public.celebrity_videos.download_duration_seconds is
  'Length in seconds of the downloaded window (typically <= 120)';
