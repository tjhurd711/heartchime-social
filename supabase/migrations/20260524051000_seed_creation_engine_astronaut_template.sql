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
  'Creation Engine Astronaut',
  'trend',
  'both',
  5,
  true,
  null,
  null,
  jsonb_build_array(
    jsonb_build_object(
      'order', 1,
      'slide_type', 'ai_generated',
      'photo_source', 'upload_transform',
      'prompt_recipe', 'Recreate this exact photo as a completely different person — new face/identity — keeping the same selfie composition, framing, bland lighting, and amateur quality. Keep this as an ordinary candid phone selfie look, including any awkward framing or imperfect lighting. {slide_1_extra_detail_clause}',
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
      'slide_type', 'ai_generated',
      'photo_source', 'reference_previous',
      'prompt_recipe', 'Recreate the person from the reference as a {child_gender} aged {child_age} years old, together with their mother aged {mother_age}. Keep amateur phone-photo realism, same era feel, believable lighting, and natural imperfections.',
      'overlay_style', 'none',
      'motion_hint', 'Subtle natural movement only: one blink and tiny posture shift. Camera locked off.',
      'motion_style', 'ai_subtle',
      'live_photo_eligible', true,
      'live_photo_default', false,
      'live_photo_output_orientation', 'vertical',
      'live_photo_framing_mode', 'fill',
      'note_overlay_variable', 'note_line_2',
      'extra_slide_options', jsonb_build_object(
        'enabled_variable', 'include_slide_2',
        'enabled_when_value', 'yes'
      )
    ),
    jsonb_build_object(
      'order', 3,
      'slide_type', 'ai_generated',
      'photo_source', 'reference_previous',
      'prompt_recipe', 'Show the same exact two people from the previous photo, now both 7 years older than before, in a different setting. Keep amateur phone-photo realism, era consistency, natural lighting, and candid imperfections.',
      'overlay_style', 'none',
      'motion_hint', 'Subtle natural movement only: one blink and tiny posture shift. Camera locked off.',
      'motion_style', 'ai_subtle',
      'live_photo_eligible', true,
      'live_photo_default', false,
      'live_photo_output_orientation', 'vertical',
      'live_photo_framing_mode', 'fill',
      'note_overlay_variable', 'note_line_3',
      'extra_slide_options', jsonb_build_object(
        'enabled_variable', 'include_slide_3',
        'enabled_when_value', 'yes'
      )
    ),
    jsonb_build_object(
      'order', 4,
      'slide_type', 'ai_generated',
      'photo_source', 'reference_previous',
      'prompt_recipe', 'Show the same exact two people from the previous photo, now both 5 years older than before. Keep amateur phone-photo realism, era consistency, natural lighting, and candid imperfections.',
      'overlay_style', 'none',
      'motion_hint', 'Subtle natural movement only: one blink and tiny posture shift. Camera locked off.',
      'motion_style', 'ai_subtle',
      'live_photo_eligible', true,
      'live_photo_default', false,
      'live_photo_output_orientation', 'vertical',
      'live_photo_framing_mode', 'fill',
      'note_overlay_variable', 'note_line_4',
      'extra_slide_options', jsonb_build_object(
        'enabled_variable', 'include_slide_4',
        'enabled_when_value', 'yes'
      )
    ),
    jsonb_build_object(
      'order', 5,
      'slide_type', 'ai_generated',
      'photo_source', 'generated',
      'prompt_recipe', 'Respectful vertical memorial photograph. Amateur phone-photo framing using the selected camera distance. Photo angle is {memorial_camera_angle}; not a polished straight-on portrait. Follow the camera distance instruction from the memorial scene description exactly. The memorial should be framed at the selected size with surrounding environment visible: grass, walkway or dirt path in the foreground, open space between camera and memorial when distance is far, trees or other background elements softly blurred. Flowers and unlit candles may be visible at the base but should not be close enough to show fine petal or candle detail unless close distance is selected. This should feel like an imperfect phone picture taken by a regular person, not a professional cemetery portrait. Slight tilt, casual framing, imperfect composition, natural phone-camera exposure. Do not crop into the memorial. Show the full memorial and the space around it. {memorial_scene_description} {memorial_attendees_description}. Somber documentary phone-photo feel, realistic environment, deep phone-camera focus with the wide scene visible, no text overlays, no watermarks, no AI artifacts.',
      'overlay_style', 'none',
      'motion_hint', 'Slow gentle zoom across the still memorial image. No generated scene motion.',
      'motion_style', 'kenburns',
      'live_photo_eligible', false,
      'live_photo_default', false,
      'note_overlay_variable', 'note_line_5',
      'extra_slide_options', jsonb_build_object(
        'enabled_variable', 'include_memorial_slide',
        'enabled_when_value', 'yes'
      )
    )
  ),
  '{}'::text[],
  '[]'::jsonb,
  'Creation engine variant for I''m an Astronaut: upload-transform first slide and chained age progression.',
  true
where not exists (
  select 1
  from post_templates
  where name = 'Creation Engine Astronaut'
);
