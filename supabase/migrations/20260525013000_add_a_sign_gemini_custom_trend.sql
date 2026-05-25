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
  'A Sign',
  'Use for a three-step visual progression: style-match from S3, directed GPT edit, then a Gemini custom continuation that can be independent or reference-based.',
  null,
  null,
  '{}'::text[],
  3,
  false,
  jsonb_build_array(
    jsonb_build_object('type', 'reference', 'live_photo_eligible', true),
    jsonb_build_object('type', 'gpt_edit', 'live_photo_eligible', true),
    jsonb_build_object('type', 'gemini_custom', 'live_photo_eligible', true)
  )
where not exists (
  select 1
  from social_trends
  where name = 'A Sign'
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
  'Creation Engine A Sign',
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
    ),
    jsonb_build_object(
      'order', 3,
      'slide_type', 'gemini_custom',
      'photo_source', 'generated',
      'prompt_recipe', '{gemini_custom_prompt_3}',
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
  'Creation Engine variant for A Sign: slide 1 uses S3 style reference via Gemini, slide 2 runs OpenAI gpt-image-2 edits against slide 1 output, slide 3 runs Gemini custom from scratch or as an edit of slide 2 based on per-generation reference_source.',
  true
where not exists (
  select 1
  from post_templates
  where name = 'Creation Engine A Sign'
);
