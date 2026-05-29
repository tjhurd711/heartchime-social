create table if not exists public.honor_miss_jobs (
  id uuid primary key default gen_random_uuid(),
  mode text not null,
  relation text not null,
  slide_count integer not null,
  loved_one_id uuid,
  persona_name text,
  master_photo_url text,
  anchors jsonb not null default '[]'::jsonb,
  items jsonb not null default '[]'::jsonb,
  slides jsonb not null default '[]'::jsonb,
  intro_caption text,
  closer_caption text,
  status text not null default 'generated',
  created_at timestamptz not null default timezone('utc'::text, now())
);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'honor_miss_jobs_mode_check'
  ) then
    alter table public.honor_miss_jobs
      add constraint honor_miss_jobs_mode_check
      check (mode in ('honor', 'miss'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'honor_miss_jobs_slide_count_check'
  ) then
    alter table public.honor_miss_jobs
      add constraint honor_miss_jobs_slide_count_check
      check (slide_count between 3 and 7);
  end if;
end $$;

create index if not exists honor_miss_jobs_created_at_idx
  on public.honor_miss_jobs (created_at desc);
