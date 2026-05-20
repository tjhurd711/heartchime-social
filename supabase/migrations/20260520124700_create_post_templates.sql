create table post_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null check (category in ('evergreen','trend')),
  account_type text not null check (account_type in ('business','persona','both')),
  audio_track_name text,
  audio_track_url text,
  slide_count int not null,
  slides jsonb not null,
  variables_needed text[] not null default '{}',
  description text,
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index idx_post_templates_category on post_templates(category) where is_active = true;

alter table social_posts
  add column if not exists template_id uuid references post_templates(id),
  add column if not exists slides_urls jsonb,
  add column if not exists audio_track_name text,
  add column if not exists audio_track_url text;

insert into post_templates (
  name,
  category,
  account_type,
  slide_count,
  slides,
  variables_needed,
  description,
  is_active
)
select
  'Evergreen (Selfie + HeartChime Card)',
  'evergreen',
  'both',
  2,
  jsonb_build_array(
    jsonb_build_object(
      'order', 1,
      'slide_type', 'selfie',
      'prompt_recipe', $$Authentic vintage photograph from the {era}. Warm faded colors, candid family snapshot feel, and authentic period styling.

A person remembering their {relationship} in an intimate, natural moment that feels pulled from a real family photo box.

CRITICAL STYLE REQUIREMENTS:
- Shot by a family member, NOT a professional photographer
- Amateur framing - slightly off-center, imperfect composition
- NOT everyone looking at camera - someone caught mid-conversation or looking away
- Real environment clutter - cups, plates, random items on table
- Natural imperfect lighting - shadows, slight overexposure acceptable
- Candid moment, NOT a posed portrait
- Some motion blur acceptable
- This should look like a photo pulled from a shoebox, not a stock photo website

No watermarks. No text overlays. No AI artifacts. No perfect symmetry. No professional studio lighting. Should look like a real amateur photo someone would find in a family album or phone camera roll.

Aspect ratio: 4:3 landscape.$$,
      'overlay_style', 'hook'
    ),
    jsonb_build_object(
      'order', 2,
      'slide_type', 'heartchime_card',
      'overlay_style', 'none'
    )
  ),
  array['deceased_name', 'relationship', 'hook', 'era'],
  'Current evergreen 2-slide template (selfie + HeartChime card).',
  true
where not exists (
  select 1
  from post_templates
  where name = 'Evergreen (Selfie + HeartChime Card)'
);
