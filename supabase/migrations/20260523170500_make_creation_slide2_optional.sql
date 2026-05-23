update post_templates as pt
set slides = updated.updated_slides
from (
  select
    id,
    jsonb_agg(
      case
        when (slide->>'order')::int = 2 then
          jsonb_set(
            slide,
            '{extra_slide_options}',
            jsonb_build_object(
              'enabled_variable', 'include_slide_2',
              'enabled_when_value', 'yes'
            ),
            true
          )
        else slide
      end
      order by (slide->>'order')::int
    ) as updated_slides
  from post_templates,
  jsonb_array_elements(slides) as slide
  where name in ('Creation Engine', 'Creation Engine (Previous Identity)')
  group by id
) as updated
where pt.id = updated.id;
