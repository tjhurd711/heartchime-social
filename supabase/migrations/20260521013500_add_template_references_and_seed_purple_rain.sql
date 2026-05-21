alter table post_templates
  add column if not exists reference_video_url text,
  add column if not exists reference_photos jsonb not null default '[]'::jsonb;

insert into post_templates (
  name,
  category,
  account_type,
  slide_count,
  live_photo_supported,
  audio_track_name,
  audio_track_url,
  slides,
  variables_needed,
  variables_schema,
  description,
  is_active
)
select
  'Purple Rain (Before / After)',
  'trend',
  'both',
  2,
  true,
  'Purple Rain - Prince',
  'https://www.tiktok.com/t/ZT9YUyqLSc7kE-JxpY7/',
  jsonb_build_array(
    jsonb_build_object(
      'order', 1,
      'slide_type', 'ai_generated',
      'characters', jsonb_build_array('deceased'),
      'photo_source', 'variable_or_generated',
      'photo_variable', 'deceased_photo_url',
      'prompt_recipe', 'Authentic vintage photograph from the {era}. {deceased_description} smiling at the camera, candid family/personal photo. Shot by a family member, amateur framing, natural imperfect lighting, slight motion blur acceptable. Looks like a photo pulled from a shoebox or phone camera roll. No watermarks, no text overlays, no AI artifacts.',
      'text_overlay', '{roles_list}',
      'overlay_style', 'lyric',
      'motion_hint', 'The subject blinks once slowly. Slight head movement. Slight smile shift. Hair drifts gently. Static camera locked off.'
    ),
    jsonb_build_object(
      'order', 2,
      'slide_type', 'photo_upload_display',
      'characters', jsonb_build_array(),
      'photo_source', 'variable',
      'photo_variable', 'memorial_photo_url',
      'prompt_recipe', '',
      'text_overlay', '{cause_of_death}',
      'overlay_style', 'lyric',
      'motion_hint', 'Gentle wind moves through trees in background. Candle flames flicker softly. Otherwise everything still. Camera locked off.'
    )
  ),
  array[
    'deceased_name',
    'deceased_age',
    'deceased_gender',
    'deceased_ethnicity',
    'era',
    'roles_list',
    'cause_of_death',
    'memorial_photo_url'
  ],
  jsonb_build_array(
    jsonb_build_object(
      'name', 'deceased_name',
      'label', 'Name of deceased',
      'type', 'text',
      'required', true
    ),
    jsonb_build_object(
      'name', 'deceased_age',
      'label', 'Age when alive (decade)',
      'type', 'select',
      'required', true,
      'options', jsonb_build_array('20s','30s','40s','50s','60s','70s','80s')
    ),
    jsonb_build_object(
      'name', 'deceased_gender',
      'label', 'Gender',
      'type', 'select',
      'required', true,
      'options', jsonb_build_array('male','female')
    ),
    jsonb_build_object(
      'name', 'deceased_ethnicity',
      'label', 'Ethnicity',
      'type', 'select',
      'required', true,
      'options', jsonb_build_array('white','black','hispanic','asian','middle_eastern','mixed')
    ),
    jsonb_build_object(
      'name', 'era',
      'label', 'Era when photo was taken',
      'type', 'select',
      'required', true,
      'options', jsonb_build_array('1970s','1980s','1990s','2000s','2010s','2020s')
    ),
    jsonb_build_object(
      'name', 'roles_list',
      'label', 'Roles they were (separate with /). Example: father / son / husband / brother / uncle / grandpa',
      'type', 'textarea',
      'required', true
    ),
    jsonb_build_object(
      'name', 'cause_of_death',
      'label', 'How they died (slide 2 caption). Example: ''one snort of that coke''',
      'type', 'text',
      'required', true
    ),
    jsonb_build_object(
      'name', 'deceased_photo_url',
      'label', 'Optional: real photo of deceased (slide 1)',
      'type', 'photo_upload',
      'required', false
    ),
    jsonb_build_object(
      'name', 'memorial_photo_url',
      'label', 'REQUIRED: photo of memorial / funeral setup (slide 2)',
      'type', 'photo_upload',
      'required', true
    )
  ),
  'Two-slide trend. Slide 1 is the deceased while alive with their roles listed. Slide 2 is the memorial with a stark cause-of-death overlay. Audience hook: the contrast between who they were and what took them.',
  true
where not exists (
  select 1
  from post_templates
  where name = 'Purple Rain (Before / After)'
);
