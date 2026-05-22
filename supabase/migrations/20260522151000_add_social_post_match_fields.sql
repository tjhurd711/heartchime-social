alter table social_posts
  add column if not exists published_url text,
  add column if not exists platform_post_id text;
