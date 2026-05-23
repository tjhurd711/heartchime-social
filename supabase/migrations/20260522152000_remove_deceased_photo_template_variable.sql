update post_templates
set
  variables_needed = array_remove(variables_needed, 'deceased_photo_url'),
  variables_schema = coalesce(
    (
      select jsonb_agg(field order by ord)
      from jsonb_array_elements(coalesce(variables_schema, '[]'::jsonb)) with ordinality as fields(field, ord)
      where field->>'name' <> 'deceased_photo_url'
    ),
    '[]'::jsonb
  )
where
  'deceased_photo_url' = any(variables_needed)
  or coalesce(variables_schema, '[]'::jsonb) @> '[{"name":"deceased_photo_url"}]'::jsonb;

update post_templates
set slides = coalesce(
  (
    select jsonb_agg(
      case
        when slide->>'photo_variable' = 'deceased_photo_url'
          or slide->>'photo_variable_name' = 'deceased_photo_url'
          or slide->>'variable_name' = 'deceased_photo_url'
        then (slide - 'photo_variable' - 'photo_variable_name' - 'variable_name') || jsonb_build_object('photo_source', 'generated')
        else slide
      end
      order by ord
    )
    from jsonb_array_elements(slides) with ordinality as slide_items(slide, ord)
  ),
  slides
)
where slides::text like '%deceased_photo_url%';
