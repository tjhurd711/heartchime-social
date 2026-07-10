-- Allow soft-removing clips from the reel lineup without deleting S3 objects.
alter table public.celebrity_videos
  drop constraint if exists celebrity_videos_status_check;

alter table public.celebrity_videos
  add constraint celebrity_videos_status_check
  check (status in ('searching', 'downloading', 'ready', 'failed', 'removed'));

comment on column public.celebrity_videos.status is
  'searching = selected from YouTube, not downloaded; downloading = yt-dlp in progress; ready = on S3; failed = download error; removed = soft-deleted from reel lineup (S3 kept)';
