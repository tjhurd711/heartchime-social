update post_templates
set variables_schema =
  case
    when variables_schema @? '$[*] ? (@.name == "memorial_headstone_flower_design")' then variables_schema
    else variables_schema || jsonb_build_array(jsonb_build_object(
      'name', 'memorial_headstone_flower_design',
      'label', 'Carved flower design (used for headstones)',
      'type', 'text',
      'required', false
    ))
  end
where name = 'Purple Rain (Before / After)';
