alter table post_templates
  add column if not exists live_photo_supported boolean not null default false;

-- slides is already jsonb; no structural migration required for optional slide.motion_hint.
-- motion_hint can now be included per slide object at seed/update time.

alter table social_posts
  add column if not exists live_photo_urls jsonb,
  add column if not exists is_live_photo boolean not null default false;
