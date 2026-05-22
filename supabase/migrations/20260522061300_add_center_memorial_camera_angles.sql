update post_templates
set
  variables_schema = (
    select jsonb_agg(
      case
        when field->>'name' = 'memorial_camera_angle' then
          field || jsonb_build_object(
            'options',
            jsonb_build_array('left', 'center left', 'center right', 'right')
          )
        else field
      end
      order by ordinality
    )
    from jsonb_array_elements(variables_schema) with ordinality as expanded(field, ordinality)
  ),
  slides = (
    select jsonb_agg(
      case
        when (slide->>'order')::int = 2 then
          slide || jsonb_build_object(
            'prompt_recipe',
            'Respectful vertical memorial photograph. Wide amateur phone-photo framing from farther back, camera about 20-30 feet away from the memorial. Photo angle is {memorial_camera_angle}; not a polished straight-on portrait. The memorial is off-center and should appear smaller in the frame, occupying only about 10-20% of the image height, with plenty of surrounding environment visible: grass, walkway or dirt path in the foreground, flowers and unlit candles at the base, trees or other background elements softly blurred. This should feel like an imperfect phone picture taken by a regular person, not a professional cemetery portrait. Slight tilt, casual framing, imperfect composition, natural phone-camera exposure. Do not make this a tight close-up. Do not crop into the memorial. Show the full memorial and the space around it. {memorial_scene_description} {memorial_attendees_description}. Somber documentary phone-photo feel, realistic environment, shallow depth of field, no text overlays, no watermarks, no AI artifacts.'
          )
        else slide
      end
      order by ordinality
    )
    from jsonb_array_elements(slides) with ordinality as expanded(slide, ordinality)
  )
where name = 'Purple Rain (Before / After)';
