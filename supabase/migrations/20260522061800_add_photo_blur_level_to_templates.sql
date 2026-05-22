update post_templates
set variables_schema =
  case
    when coalesce(variables_schema, '[]'::jsonb) @? '$[*] ? (@.name == "photo_blur_level")' then variables_schema
    else coalesce(variables_schema, '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
      'name', 'photo_blur_level',
      'label', 'Photo blur / fuzziness (1 clear - 10 very blurry)',
      'type', 'select',
      'required', false,
      'options', jsonb_build_array('1', '2', '3', '4', '5', '6', '7', '8', '9', '10')
    ))
  end;
