update post_templates
set
  slides = (
    select jsonb_agg(
      case
        when (slide->>'order')::int = 1 then
          (slide - 'text_overlay') || jsonb_build_object(
            'overlay_style', 'none',
            'note_overlay_variable', 'roles_list'
          )
        when (slide->>'order')::int = 2 then
          (slide - 'text_overlay') || jsonb_build_object(
            'overlay_style', 'none',
            'note_overlay_variable', 'cause_of_death'
          )
        else slide
      end
      order by ordinality
    )
    from jsonb_array_elements(slides) with ordinality as expanded(slide, ordinality)
  ),
  variables_needed =
    case
      when 'roles_list' = any(variables_needed) then variables_needed
      else variables_needed || array['roles_list']
    end,
  description = 'Two-slide trend. Slide 1 is the deceased while alive. Slide 2 is an AI-generated memorial/headstone image. Photos are generated clean without text overlays; roles and cause of death are carried as Note overlay text for manual posting.'
where name = 'Purple Rain (Before / After)';

update post_templates
set
  variables_needed =
    case
      when 'cause_of_death' = any(variables_needed) then variables_needed
      else variables_needed || array['cause_of_death']
    end,
  variables_schema = (
    select schema_with_roles ||
      case
        when schema_with_roles @? '$[*] ? (@.name == "cause_of_death")' then '[]'::jsonb
        else jsonb_build_array(jsonb_build_object(
          'name', 'cause_of_death',
          'label', 'How they died (slide 2 caption). Example: ''one snort of that coke''',
          'type', 'text',
          'required', true
        ))
      end
    from (
      select variables_schema ||
        case
          when variables_schema @? '$[*] ? (@.name == "roles_list")' then '[]'::jsonb
          else jsonb_build_array(jsonb_build_object(
            'name', 'roles_list',
            'label', 'Roles they were (separate with /). Example: father / son / husband / brother',
            'type', 'textarea',
            'required', true
          ))
        end as schema_with_roles
    ) schema_update
  )
where name = 'Purple Rain (Before / After)';
