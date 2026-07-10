-- Distributed home-PC fetch workers claim jobs from this table.
create table if not exists public.fetch_jobs (
  id uuid primary key default gen_random_uuid(),
  celebrity_slug text not null,
  params jsonb not null default '{}'::jsonb,
  status text not null default 'pending'
    check (status in ('pending', 'claimed', 'done', 'failed')),
  claimed_by text,
  claimed_at timestamptz,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists fetch_jobs_status_created_at_idx
  on public.fetch_jobs (status, created_at asc);

create index if not exists fetch_jobs_celebrity_slug_created_at_idx
  on public.fetch_jobs (celebrity_slug, created_at desc);

comment on table public.fetch_jobs is
  'Queue for home-PC fetch workers (yt-dlp). Service-role only; never expose to anon.';

comment on column public.fetch_jobs.params is
  'Job payload: mode (fetch|replace|add), celebrityName, downloadWindow, manualVideoId, replace slot fields, etc.';

comment on column public.fetch_jobs.claimed_by is
  'Worker hostname that claimed the job.';

alter table public.fetch_jobs enable row level security;

-- No policies for anon/authenticated — service role bypasses RLS.
revoke all on table public.fetch_jobs from anon, authenticated;
grant all on table public.fetch_jobs to service_role;

-- Atomically reclaim stale claims and claim the oldest pending job.
create or replace function public.claim_fetch_job(p_worker_id text)
returns setof public.fetch_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  job public.fetch_jobs;
begin
  if p_worker_id is null or length(trim(p_worker_id)) = 0 then
    raise exception 'p_worker_id is required';
  end if;

  -- Stale claimed jobs (>10 min) revert to pending so another worker can pick them up.
  update public.fetch_jobs
  set
    status = 'pending',
    claimed_by = null,
    claimed_at = null,
    updated_at = now()
  where status = 'claimed'
    and claimed_at is not null
    and claimed_at < now() - interval '10 minutes';

  select *
  into job
  from public.fetch_jobs
  where status = 'pending'
  order by created_at asc
  limit 1
  for update skip locked;

  if not found then
    return;
  end if;

  update public.fetch_jobs
  set
    status = 'claimed',
    claimed_by = trim(p_worker_id),
    claimed_at = now(),
    error = null,
    updated_at = now()
  where id = job.id
  returning * into job;

  return next job;
end;
$$;

revoke all on function public.claim_fetch_job(text) from public, anon, authenticated;
grant execute on function public.claim_fetch_job(text) to service_role;
