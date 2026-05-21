update post_templates
set
  slides = (
    select jsonb_agg(
      case
        when (slide->>'order')::int = 2 then
          (slide - 'photo_variable' - 'photo_variable_name' - 'variable_name') || jsonb_build_object(
            'slide_type', 'ai_generated',
            'photo_source', 'generated',
            'prompt_recipe', 'Respectful vertical memorial/headstone photograph in a cemetery or small roadside memorial. A simple headstone, flowers, candles, and soft natural light. {memorial_attendees_description}. Somber documentary phone-photo feel, realistic environment, shallow depth of field, no readable names or dates, no text overlays, no watermarks, no AI artifacts.',
            'text_overlay', '{cause_of_death}',
            'overlay_style', 'lyric',
            'motion_style', 'ai_subtle',
            'motion_hint', 'Gentle wind moves through trees in background. Candle flames flicker softly. Otherwise everything still. Camera locked off.',
            'live_photo_eligible', true,
            'live_photo_default', false
          )
        else slide
      end
      order by ordinality
    )
    from jsonb_array_elements(slides) with ordinality as expanded(slide, ordinality)
  ),
  variables_needed = array_remove(variables_needed, 'memorial_photo_url'),
  variables_schema = (
    select coalesce(jsonb_agg(field order by ordinality), '[]'::jsonb)
    from jsonb_array_elements(variables_schema) with ordinality as expanded(field, ordinality)
    where field->>'name' <> 'memorial_photo_url'
  ),
  description = 'Two-slide trend. Slide 1 is the deceased while alive with their roles listed. Slide 2 is an AI-generated memorial/headstone image with a stark cause-of-death overlay. Audience hook: the contrast between who they were and what took them.'
where name = 'Purple Rain (Before / After)';
