create extension if not exists pgcrypto;

create table if not exists public.tributes (
  id uuid primary key default gen_random_uuid(),
  loved_one_name text not null,
  relationship text not null,
  date_of_birth date,
  date_of_passing date,
  photo_s3_keys text[] not null,
  submitter_email text not null,
  submitter_name text,
  loved_things text,
  ways_honored text,
  things_missed text,
  specific_memory text,
  song text,
  other_details text,
  status text not null default 'new' check (status in ('new', 'reviewing', 'in_progress', 'posted', 'declined')),
  posted_url text,
  reviewer_notes text,
  created_at timestamptz default now()
);

create index if not exists tributes_status_idx on public.tributes(status, created_at desc);
