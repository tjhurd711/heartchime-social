alter table social_trends
add column if not exists slide_plan jsonb not null default '[]'::jsonb;

insert into social_trends (
  name,
  explanation,
  sound_name,
  sound_url,
  caption_lines,
  default_slide_count,
  memorial_default,
  slide_plan
)
select
  'Drag Path',
  'Use for handwritten notes or left-behind objects where the viewer feels they found something personal.',
  null,
  null,
  '{}'::text[],
  2,
  false,
  jsonb_build_array(
    jsonb_build_object('type', 'reference', 'live_photo_eligible', true),
    jsonb_build_object('type', 'text_artifact', 'live_photo_eligible', true)
  )
where not exists (
  select 1
  from social_trends
  where name = 'Drag Path'
);

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
  'Creation Engine Drag Path',
  'trend',
  'both',
  2,
  true,
  null,
  null,
  jsonb_build_array(
    jsonb_build_object(
      'order', 1,
      'slide_type', 'ai_generated',
      'photo_source', 'reference_live_pick',
      'prompt_recipe', 'Authentic candid vertical phone photo with awkward-real, non-polished framing. Keep natural blur, imperfect indoor/outdoor lighting, and believable everyday composition. Make this feel like a real personal snapshot (not studio, not stock). {slide_1_extra_detail_clause}',
      'overlay_style', 'none',
      'motion_hint', 'Subtle natural movement only: one soft blink, tiny posture shift, slight breathing. Camera remains still.',
      'motion_style', 'ai_subtle',
      'live_photo_eligible', true,
      'live_photo_default', false,
      'live_photo_output_orientation', 'vertical',
      'live_photo_framing_mode', 'fill',
      'note_overlay_variable', 'note_line_1'
    ),
    jsonb_build_object(
      'order', 2,
      'slide_type', 'text_artifact',
      'photo_source', 'generated',
      'prompt_recipe', '{text_artifact_prompt_2}',
      'overlay_style', 'none',
      'motion_hint', 'Slow gentle zoom across the still image. No generated scene motion.',
      'motion_style', 'kenburns',
      'live_photo_eligible', true,
      'live_photo_default', false,
      'live_photo_output_orientation', 'vertical',
      'live_photo_framing_mode', 'fill',
      'note_overlay_variable', 'note_line_2'
    )
  ),
  '{}'::text[],
  '[]'::jsonb,
  'Creation Engine variant for Drag Path: slide 1 uses S3 style reference via Gemini, slide 2 uses text-only artifact generation.',
  true
where not exists (
  select 1
  from post_templates
  where name = 'Creation Engine Drag Path'
);
