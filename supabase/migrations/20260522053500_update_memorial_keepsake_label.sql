update post_templates
set variables_schema = (
  select jsonb_agg(
    case
      when field->>'name' = 'memorial_keepsake' then
        field || jsonb_build_object(
          'label',
          'Personal keepsake (used for headstones and bouquet)'
        )
      else field
    end
    order by ordinality
  )
  from jsonb_array_elements(variables_schema) with ordinality as expanded(field, ordinality)
)
where name = 'Purple Rain (Before / After)';
