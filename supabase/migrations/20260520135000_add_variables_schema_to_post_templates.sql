alter table post_templates
  add column if not exists variables_schema jsonb;

update post_templates
set variables_schema = jsonb_build_array(
  jsonb_build_object(
    'name', 'deceased_name',
    'label', 'Name of person who passed',
    'type', 'text',
    'required', true
  ),
  jsonb_build_object(
    'name', 'relationship',
    'label', 'Your relationship to them',
    'type', 'select',
    'required', true,
    'options', jsonb_build_array('mother','father','sister','brother','spouse','child','friend','grandparent')
  ),
  jsonb_build_object(
    'name', 'hook',
    'label', 'Hook text shown on slide 1',
    'type', 'textarea',
    'required', true
  ),
  jsonb_build_object(
    'name', 'era',
    'label', 'Era / time period',
    'type', 'select',
    'required', true,
    'options', jsonb_build_array('1960s','1970s','1980s','1990s','2000s','2010s','2020s')
  )
)
where name = 'Evergreen (Selfie + HeartChime Card)'
  and (variables_schema is null or variables_schema = '[]'::jsonb);
