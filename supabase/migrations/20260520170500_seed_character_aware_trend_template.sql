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
  'Trend (Character-Aware Demo)',
  'trend',
  'business',
  2,
  jsonb_build_array(
    jsonb_build_object(
      'order', 1,
      'slide_type', 'ai_generated',
      'characters', jsonb_build_array('alive'),
      'prompt_recipe', 'A candid social trend photo of {alive_description}, natural lighting, modern scene, high detail.',
      'overlay_style', 'none'
    ),
    jsonb_build_object(
      'order', 2,
      'slide_type', 'heartchime_card',
      'photo_source', 'variable',
      'photo_variable', 'deceased_photo_url',
      'prompt_recipe', 'Remembering with love.',
      'overlay_style', 'none'
    )
  ),
  array['hook', 'deceased_photo_url'],
  'Demo trend template showing character-aware prompts and variable photo source.',
  true
where not exists (
  select 1
  from post_templates
  where name = 'Trend (Character-Aware Demo)'
);
