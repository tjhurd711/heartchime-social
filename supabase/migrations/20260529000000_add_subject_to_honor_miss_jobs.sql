-- Add optional tribute-subject fields to honor_miss_jobs.
-- Used by third-person tribute mode where the framed/polaroid memory slides
-- render the deceased subject (subject_master_photo_url) rather than the
-- narrating persona. Both columns are nullable so existing first-person jobs
-- and inserts remain valid.

alter table public.honor_miss_jobs
  add column if not exists subject_name text;

alter table public.honor_miss_jobs
  add column if not exists subject_master_photo_url text;
