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
  'The Winner Takes It All',
  'Use for a two-step emotional pivot: generate a candid base frame first, then rewrite that exact frame with a directed edit prompt.',
  null,
  null,
  '{}'::text[],
  2,
  false,
  jsonb_build_array(
    jsonb_build_object('type', 'reference', 'live_photo_eligible', true),
    jsonb_build_object('type', 'gpt_edit', 'live_photo_eligible', true)
  )
where not exists (
  select 1
  from social_trends
  where name = 'The Winner Takes It All'
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
  'Creation Engine Winner Takes It All',
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
      'slide_type', 'gpt_edit',
      'photo_source', 'reference_previous',
      'prompt_recipe', '{gpt_edit_prompt_2}',
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
  'Creation Engine variant for The Winner Takes It All: slide 1 uses S3 style reference via Gemini, slide 2 runs OpenAI gpt-image-2 edits against slide 1 output.',
  true
where not exists (
  select 1
  from post_templates
  where name = 'Creation Engine Winner Takes It All'
);
