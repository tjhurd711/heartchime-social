create table if not exists public.send_to_phone_jobs (
  id uuid primary key default gen_random_uuid(),
  album_name text not null,
  status text not null default 'pending',
  slides jsonb not null default '[]'::jsonb,
  mac_response jsonb,
  error_text text,
  created_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists send_to_phone_jobs_created_at_idx
  on public.send_to_phone_jobs (created_at desc);

create index if not exists send_to_phone_jobs_album_name_idx
  on public.send_to_phone_jobs (album_name);
