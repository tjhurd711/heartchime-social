create table if not exists public.reference_photo_bank (
  id uuid primary key default gen_random_uuid(),
  source_bucket text not null,
  source_key text not null,
  bank_url text not null,
  tags jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (source_bucket, source_key)
);
