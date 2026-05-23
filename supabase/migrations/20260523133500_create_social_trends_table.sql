create table if not exists social_trends (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  explanation text not null,
  sound_name text,
  sound_url text,
  caption_lines text[] not null default '{}'::text[],
  default_slide_count int not null default 4,
  memorial_default boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

insert into social_trends (
  name,
  explanation,
  sound_name
)
select
  'Sailor Song',
  'Use when you want a soft, nostalgic memory sequence with everyday candid scenes.',
  'Sailor Song - Gigi Perez'
where not exists (
  select 1 from social_trends where name = 'Sailor Song'
);

insert into social_trends (
  name,
  explanation,
  sound_name
)
select
  'Purple Rain',
  'Use when you want a dramatic before/after emotional arc with a reflective ending.',
  'Purple Rain - Prince'
where not exists (
  select 1 from social_trends where name = 'Purple Rain'
);

insert into social_trends (
  name,
  explanation,
  sound_name
)
select
  'I''m an Astronaut',
  'Use for imaginative, hopeful storylines with surreal or adventurous scene pivots.',
  'I''m an Astronaut'
where not exists (
  select 1 from social_trends where name = 'I''m an Astronaut'
);
