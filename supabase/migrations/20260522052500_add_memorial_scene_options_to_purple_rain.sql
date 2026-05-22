update post_templates
set
  slides = (
    select jsonb_agg(
      case
        when (slide->>'order')::int = 2 then
          slide || jsonb_build_object(
            'prompt_recipe',
            'Respectful vertical memorial photograph. Wide documentary phone-photo framing from a few steps back, camera about 12-18 feet away from the memorial. The memorial should appear smaller in the frame, occupying only about 20-30% of the image height, with plenty of surrounding environment visible: grass, walkway or dirt path in the foreground, flowers and candles at the base, trees or other background elements softly blurred. Do not make this a tight close-up. Do not crop into the memorial. Show the full memorial and the space around it. {memorial_scene_description} {memorial_attendees_description}. Somber documentary phone-photo feel, realistic environment, shallow depth of field, no text overlays, no watermarks, no AI artifacts.'
          )
        else slide
      end
      order by ordinality
    )
    from jsonb_array_elements(slides) with ordinality as expanded(slide, ordinality)
  ),
  variables_needed =
    case when 'memorial_scene_type' = any(variables_needed) then variables_needed else variables_needed || array['memorial_scene_type'] end,
  variables_schema = (
    select schema_with_type ||
      case
        when schema_with_type @? '$[*] ? (@.name == "memorial_location")' then '[]'::jsonb
        else jsonb_build_array(jsonb_build_object(
          'name', 'memorial_location',
          'label', 'Memorial location',
          'type', 'select',
          'required', true,
          'options', jsonb_build_array('cemetery', 'backyard', 'roadside', 'park', 'home_garden')
        ))
      end ||
      case
        when schema_with_type @? '$[*] ? (@.name == "memorial_inscription")' then '[]'::jsonb
        else jsonb_build_array(jsonb_build_object(
          'name', 'memorial_inscription',
          'label', 'Memorial inscription',
          'type', 'text',
          'required', false
        ))
      end ||
      case
        when schema_with_type @? '$[*] ? (@.name == "memorial_urn_color")' then '[]'::jsonb
        else jsonb_build_array(jsonb_build_object(
          'name', 'memorial_urn_color',
          'label', 'Urn color/material (used for urn option)',
          'type', 'text',
          'required', false
        ))
      end ||
      case
        when schema_with_type @? '$[*] ? (@.name == "memorial_keepsake")' then '[]'::jsonb
        else jsonb_build_array(jsonb_build_object(
          'name', 'memorial_keepsake',
          'label', 'Keepsake by bouquet (used for bouquet option)',
          'type', 'text',
          'required', false
        ))
      end
    from (
      select variables_schema ||
        case
          when variables_schema @? '$[*] ? (@.name == "memorial_scene_type")' then '[]'::jsonb
          else jsonb_build_array(jsonb_build_object(
            'name', 'memorial_scene_type',
            'label', 'Memorial image type',
            'type', 'select',
            'required', true,
            'options', jsonb_build_array(
              'headstone_classic',
              'headstone_rounded',
              'headstone_flat',
              'urn',
              'bouquet'
            )
          ))
        end as schema_with_type
    ) schema_update
  )
where name = 'Purple Rain (Before / After)';
