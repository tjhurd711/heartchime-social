with inserted as (
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
    'Sailor Song',
    'trend',
    'both',
    5,
    true,
    'Sailor Song - Gigi Perez',
    'https://www.tiktok.com/t/ZT9YxNQt6G4M9-jLHdI/',
    jsonb_build_array(
      jsonb_build_object(
        'order', 1,
        'slide_type', 'ai_generated',
        'photo_source', 'generated',
        'prompt_recipe', 'Authentic candid vertical phone photo of the same small family/friend cast in a natural everyday moment. {subjects_description}. Keep expressions warm and realistic, with imperfect amateur framing and natural light. No text overlays, no watermarks, no AI artifacts.',
        'overlay_style', 'none',
        'motion_hint', 'Subtle natural movement only: one soft blink, tiny head shift, slight breathing. Camera remains still.',
        'motion_style', 'ai_subtle',
        'live_photo_eligible', true,
        'live_photo_default', false,
        'live_photo_output_orientation', 'vertical',
        'live_photo_framing_mode', 'fill',
        'subjects_config', jsonb_build_object(
          'enabled', true,
          'min', 1,
          'max', 3,
          'require_one_deceased', false
        ),
        'note_overlay_variable', 'note_line_1'
      ),
      jsonb_build_object(
        'order', 2,
        'slide_type', 'ai_generated',
        'photo_source', 'reference_anchor',
        'reference_anchor_order', 1,
        'prompt_recipe', 'Using the provided reference image of the same people, place them in this setting/activity: {scene_2}. Keep faces and identities consistent with the reference while changing only the environment/action. Realistic amateur phone photo look, natural light, candid composition, no text overlays, no watermarks, no AI artifacts.',
        'overlay_style', 'none',
        'motion_hint', 'Subtle natural movement only: one blink and tiny posture shift. Camera locked off.',
        'motion_style', 'ai_subtle',
        'live_photo_eligible', true,
        'live_photo_default', false,
        'live_photo_output_orientation', 'vertical',
        'live_photo_framing_mode', 'fill',
        'note_overlay_variable', 'note_line_2'
      ),
      jsonb_build_object(
        'order', 3,
        'slide_type', 'ai_generated',
        'photo_source', 'reference_anchor',
        'reference_anchor_order', 1,
        'prompt_recipe', 'Using the provided reference image of the same people, place them in this setting/activity: {scene_3}. Keep faces and identities consistent with the reference while changing only the environment/action. Realistic amateur phone photo look, natural light, candid composition, no text overlays, no watermarks, no AI artifacts.',
        'overlay_style', 'none',
        'motion_hint', 'Subtle natural movement only: one blink and tiny posture shift. Camera locked off.',
        'motion_style', 'ai_subtle',
        'live_photo_eligible', true,
        'live_photo_default', false,
        'live_photo_output_orientation', 'vertical',
        'live_photo_framing_mode', 'fill',
        'note_overlay_variable', 'note_line_3'
      ),
      jsonb_build_object(
        'order', 4,
        'slide_type', 'ai_generated',
        'photo_source', 'reference_anchor',
        'reference_anchor_order', 1,
        'prompt_recipe', 'Using the provided reference image of the same people, place them in this setting/activity: {scene_4}. Keep faces and identities consistent with the reference while changing only the environment/action. Realistic amateur phone photo look, natural light, candid composition, no text overlays, no watermarks, no AI artifacts.',
        'overlay_style', 'none',
        'motion_hint', 'Subtle natural movement only: one blink and tiny posture shift. Camera locked off.',
        'motion_style', 'ai_subtle',
        'live_photo_eligible', true,
        'live_photo_default', false,
        'live_photo_output_orientation', 'vertical',
        'live_photo_framing_mode', 'fill',
        'note_overlay_variable', 'note_line_4'
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
    array[
      'note_line_1',
      'note_line_2',
      'note_line_3',
      'note_line_4',
      'scene_2',
      'scene_3',
      'scene_4'
    ],
    jsonb_build_array(
      jsonb_build_object(
        'name', 'note_line_1',
        'label', 'Note line 1',
        'type', 'text',
        'required', true
      ),
      jsonb_build_object(
        'name', 'note_line_2',
        'label', 'Note line 2',
        'type', 'text',
        'required', true
      ),
      jsonb_build_object(
        'name', 'note_line_3',
        'label', 'Note line 3',
        'type', 'text',
        'required', true
      ),
      jsonb_build_object(
        'name', 'note_line_4',
        'label', 'Note line 4',
        'type', 'text',
        'required', true
      ),
      jsonb_build_object(
        'name', 'note_line_5',
        'label', 'Note line 5 (optional memorial slide)',
        'type', 'text',
        'required', false
      ),
      jsonb_build_object(
        'name', 'scene_2',
        'label', 'Scene for slide 2',
        'type', 'select_with_custom',
        'required', true,
        'options', jsonb_build_array(
          'Walking on the beach at sunset',
          'Baking together in a cozy kitchen',
          'Sitting on a porch swing',
          'Fishing at a calm lake',
          'Reading on the couch together',
          'Walking through an autumn park',
          'Dancing in the living room',
          'Gardening in the backyard',
          'Picnic in a sunny meadow',
          'Looking through old photo albums',
          'Riding bikes down a quiet street',
          'Sitting by a campfire at night',
          'Watching sunrise on a hilltop',
          'Decorating a Christmas tree',
          'Coffee at the kitchen table'
        )
      ),
      jsonb_build_object(
        'name', 'scene_3',
        'label', 'Scene for slide 3',
        'type', 'select_with_custom',
        'required', true,
        'options', jsonb_build_array(
          'Walking on the beach at sunset',
          'Baking together in a cozy kitchen',
          'Sitting on a porch swing',
          'Fishing at a calm lake',
          'Reading on the couch together',
          'Walking through an autumn park',
          'Dancing in the living room',
          'Gardening in the backyard',
          'Picnic in a sunny meadow',
          'Looking through old photo albums',
          'Riding bikes down a quiet street',
          'Sitting by a campfire at night',
          'Watching sunrise on a hilltop',
          'Decorating a Christmas tree',
          'Coffee at the kitchen table'
        )
      ),
      jsonb_build_object(
        'name', 'scene_4',
        'label', 'Scene for slide 4',
        'type', 'select_with_custom',
        'required', true,
        'options', jsonb_build_array(
          'Walking on the beach at sunset',
          'Baking together in a cozy kitchen',
          'Sitting on a porch swing',
          'Fishing at a calm lake',
          'Reading on the couch together',
          'Walking through an autumn park',
          'Dancing in the living room',
          'Gardening in the backyard',
          'Picnic in a sunny meadow',
          'Looking through old photo albums',
          'Riding bikes down a quiet street',
          'Sitting by a campfire at night',
          'Watching sunrise on a hilltop',
          'Decorating a Christmas tree',
          'Coffee at the kitchen table'
        )
      ),
      jsonb_build_object(
        'name', 'include_memorial_slide',
        'label', 'Include optional memorial slide',
        'type', 'select',
        'required', false,
        'options', jsonb_build_array('no', 'yes')
      ),
      jsonb_build_object(
        'name', 'memorial_scene_type',
        'label', 'Memorial image type',
        'type', 'select',
        'required', false,
        'options', jsonb_build_array(
          'headstone_classic',
          'headstone_rounded',
          'headstone_flat',
          'urn',
          'bouquet'
        )
      ),
      jsonb_build_object(
        'name', 'memorial_location',
        'label', 'Memorial location',
        'type', 'select',
        'required', false,
        'options', jsonb_build_array('cemetery', 'backyard', 'roadside', 'park', 'home_garden', 'shelf')
      ),
      jsonb_build_object(
        'name', 'memorial_camera_angle',
        'label', 'Memorial camera angle',
        'type', 'select',
        'required', false,
        'options', jsonb_build_array('left', 'center left', 'center right', 'right')
      ),
      jsonb_build_object(
        'name', 'memorial_camera_distance',
        'label', 'Memorial camera distance',
        'type', 'select',
        'required', false,
        'options', jsonb_build_array('close', 'medium', 'far', 'very far')
      ),
      jsonb_build_object(
        'name', 'memorial_inscription',
        'label', 'Memorial inscription',
        'type', 'text',
        'required', false
      ),
      jsonb_build_object(
        'name', 'memorial_headstone_flower_design',
        'label', 'Carved flower design (used for headstones)',
        'type', 'text',
        'required', false
      ),
      jsonb_build_object(
        'name', 'memorial_urn_color',
        'label', 'Urn color/material (used for urn option)',
        'type', 'text',
        'required', false
      ),
      jsonb_build_object(
        'name', 'memorial_keepsake',
        'label', 'Personal keepsake (used for headstones and bouquet)',
        'type', 'text',
        'required', false
      ),
      jsonb_build_object(
        'name', 'photo_blur_level',
        'label', 'Photo blur / fuzziness (1 clear - 10 very blurry)',
        'type', 'select',
        'required', false,
        'options', jsonb_build_array('1', '2', '3', '4', '5', '6', '7', '8', '9', '10')
      )
    ),
    'Four generated slides keep the same cast via an anchor reference image from slide 1, with an optional fifth memorial slide.',
    true
  where not exists (
    select 1
    from post_templates
    where name = 'Sailor Song'
  )
  returning id, name
)
select id, name
from inserted;
