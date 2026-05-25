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
  'Piano',
  'Use for a three-slide memorial progression: S3 style-reference opener, GPT memorial scene, then a GPT 3-way picker (tattoo, view, or framed photo edit).',
  null,
  null,
  '{}'::text[],
  3,
  false,
  jsonb_build_array(
    jsonb_build_object('type', 'reference', 'live_photo_eligible', true),
    jsonb_build_object('type', 'gpt_memorial', 'live_photo_eligible', false),
    jsonb_build_object('type', 'gpt_slide3', 'live_photo_eligible', true)
  )
where not exists (
  select 1
  from social_trends
  where name = 'Piano'
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
  'Creation Engine Piano',
  'trend',
  'both',
  3,
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
      'slide_type', 'gpt_memorial',
      'photo_source', 'generated',
      'prompt_recipe', '{memorial_scene_description}',
      'overlay_style', 'none',
      'motion_hint', 'none',
      'motion_style', 'static_hold',
      'live_photo_eligible', false,
      'live_photo_default', false,
      'note_overlay_variable', 'note_line_2'
    ),
    jsonb_build_object(
      'order', 3,
      'slide_type', 'gpt_slide3',
      'photo_source', 'generated',
      'prompt_recipe', 'Slide 3 prompt is selected by slide_3_option at generation time.',
      'overlay_style', 'none',
      'motion_hint', 'Slow gentle zoom across the still image. No generated scene motion.',
      'motion_style', 'kenburns',
      'live_photo_eligible', true,
      'live_photo_default', false,
      'live_photo_output_orientation', 'vertical',
      'live_photo_framing_mode', 'fill',
      'note_overlay_variable', 'note_line_3'
    )
  ),
  '{}'::text[],
  '[]'::jsonb,
  'Creation Engine variant for Piano: slide 1 uses S3 style reference via Gemini, slide 2 generates a memorial scene with GPT image generations from memorial controls, and slide 3 routes per generation to tattoo/view generations or framed-photo edit using slide 1 as input.',
  true
where not exists (
  select 1
  from post_templates
  where name = 'Creation Engine Piano'
);
