update post_templates
set
  slides = (
    select jsonb_agg(
      case
        when (slide->>'order')::int in (1, 2) then
          (slide - 'text_overlay') || jsonb_build_object(
            'overlay_style', 'none'
          )
        else slide
      end
      order by ordinality
    )
    from jsonb_array_elements(slides) with ordinality as expanded(slide, ordinality)
  ),
  variables_needed = array_remove(array_remove(variables_needed, 'roles_list'), 'cause_of_death'),
  variables_schema = (
    select coalesce(jsonb_agg(field order by ordinality), '[]'::jsonb)
    from jsonb_array_elements(variables_schema) with ordinality as expanded(field, ordinality)
    where field->>'name' not in ('roles_list', 'cause_of_death')
  ),
  description = 'Two-slide trend. Slide 1 is the deceased while alive. Slide 2 is an AI-generated memorial/headstone image. Photos are generated clean without text overlays so copy can be added manually.'
where name = 'Purple Rain (Before / After)';
