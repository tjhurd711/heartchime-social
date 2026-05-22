update post_templates
set
  variables_schema =
    case
      when variables_schema @? '$[*] ? (@.name == "memorial_camera_distance")' then variables_schema
      else variables_schema || jsonb_build_array(jsonb_build_object(
        'name', 'memorial_camera_distance',
        'label', 'Memorial camera distance',
        'type', 'select',
        'required', true,
        'options', jsonb_build_array('close', 'medium', 'far', 'very far')
      ))
    end,
  variables_needed =
    case
      when 'memorial_camera_distance' = any(variables_needed) then variables_needed
      else variables_needed || array['memorial_camera_distance']
    end,
  slides = (
    select jsonb_agg(
      case
        when (slide->>'order')::int = 2 then
          slide || jsonb_build_object(
            'prompt_recipe',
            'Respectful vertical memorial photograph. Amateur phone-photo framing using the selected camera distance. Photo angle is {memorial_camera_angle}; not a polished straight-on portrait. Follow the camera distance instruction from the memorial scene description exactly. The memorial should be framed at the selected size with surrounding environment visible: grass, walkway or dirt path in the foreground, open space between camera and memorial when distance is far, trees or other background elements softly blurred. Flowers and unlit candles may be visible at the base but should not be close enough to show fine petal or candle detail unless close distance is selected. This should feel like an imperfect phone picture taken by a regular person, not a professional cemetery portrait. Slight tilt, casual framing, imperfect composition, natural phone-camera exposure. Do not crop into the memorial. Show the full memorial and the space around it. {memorial_scene_description} {memorial_attendees_description}. Somber documentary phone-photo feel, realistic environment, deep phone-camera focus with the wide scene visible, no text overlays, no watermarks, no AI artifacts.'
          )
        else slide
      end
      order by ordinality
    )
    from jsonb_array_elements(slides) with ordinality as expanded(slide, ordinality)
  )
where name = 'Purple Rain (Before / After)';
