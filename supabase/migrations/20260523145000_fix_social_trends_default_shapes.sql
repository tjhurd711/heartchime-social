update social_trends
set
  default_slide_count = 4,
  memorial_default = false,
  caption_lines = '{}'::text[]
where name = 'Sailor Song';

update social_trends
set
  default_slide_count = 2,
  memorial_default = true,
  caption_lines = array[
    'Husband / Father / Brother / Bossman / Friend',
    'Fck Cancer'
  ]::text[]
where name = 'Purple Rain';

update social_trends
set
  default_slide_count = 4,
  memorial_default = true
where name = 'I''m an Astronaut';
