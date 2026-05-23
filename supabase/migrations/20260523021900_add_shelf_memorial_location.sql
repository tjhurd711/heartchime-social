update post_templates
set variables_schema = (
  select jsonb_agg(
    case
      when field->>'name' = 'memorial_location' then
        jsonb_set(
          field,
          '{options}',
          case
            when coalesce(field->'options', '[]'::jsonb) ? 'shelf' then coalesce(field->'options', '[]'::jsonb)
            else coalesce(field->'options', '[]'::jsonb) || jsonb_build_array('shelf')
          end
        )
      else field
    end
    order by ordinality
  )
  from jsonb_array_elements(variables_schema) with ordinality as expanded(field, ordinality)
)
where name = 'Purple Rain (Before / After)'
  and variables_schema @? '$[*] ? (@.name == "memorial_location")';
