update post_templates
set
  variables_schema =
    case
      when variables_schema @? '$[*] ? (@.name == "memorial_camera_angle")' then variables_schema
      else variables_schema || jsonb_build_array(jsonb_build_object(
        'name', 'memorial_camera_angle',
        'label', 'Memorial camera angle',
        'type', 'select',
        'required', true,
        'options', jsonb_build_array('left', 'right')
      ))
    end,
  variables_needed =
    case
      when 'memorial_camera_angle' = any(variables_needed) then variables_needed
      else variables_needed || array['memorial_camera_angle']
    end,
  slides = (
    select jsonb_agg(
      case
        when (slide->>'order')::int = 2 then
          slide || jsonb_build_object(
            'prompt_recipe',
            'Respectful vertical memorial photograph. Wide amateur phone-photo framing from farther back, camera about 15-25 feet away from the memorial. Photo is taken from a slight {memorial_camera_angle}-side angle instead of straight-on. The memorial is off-center and should appear smaller in the frame, occupying only about 15-25% of the image height, with plenty of surrounding environment visible: grass, walkway or dirt path in the foreground, flowers and unlit candles at the base, trees or other background elements softly blurred. This should feel like an imperfect phone picture taken by a regular person, not a professional cemetery portrait. Slight tilt, casual framing, imperfect composition, natural phone-camera exposure. Do not make this a tight close-up. Do not crop into the memorial. Show the full memorial and the space around it. {memorial_scene_description} {memorial_attendees_description}. Somber documentary phone-photo feel, realistic environment, shallow depth of field, no text overlays, no watermarks, no AI artifacts.'
          )
        else slide
      end
      order by ordinality
    )
    from jsonb_array_elements(slides) with ordinality as expanded(slide, ordinality)
  )
where name = 'Purple Rain (Before / After)';
