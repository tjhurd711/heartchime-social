with updated_slides as (
  select
    pt.id,
    jsonb_agg(
      case
        when slide->>'order' = '2' then jsonb_set(
          slide,
          '{prompt_recipe}',
          to_jsonb('Using the provided reference image, generate the exact same people from the reference image, now {scene_2}. Preserve their exact facial features, age appearance, ethnicity, body type, and overall identity from the reference; only change setting/activity. Realistic amateur phone photo look, natural light, candid composition, no text overlays, no watermarks, no AI artifacts.'::text),
          true
        )
        when slide->>'order' = '3' then jsonb_set(
          slide,
          '{prompt_recipe}',
          to_jsonb('Using the provided reference image, generate the exact same people from the reference image, now {scene_3}. Preserve their exact facial features, age appearance, ethnicity, body type, and overall identity from the reference; only change setting/activity. Realistic amateur phone photo look, natural light, candid composition, no text overlays, no watermarks, no AI artifacts.'::text),
          true
        )
        when slide->>'order' = '4' then jsonb_set(
          slide,
          '{prompt_recipe}',
          to_jsonb('Using the provided reference image, generate the exact same people from the reference image, now {scene_4}. Preserve their exact facial features, age appearance, ethnicity, body type, and overall identity from the reference; only change setting/activity. Realistic amateur phone photo look, natural light, candid composition, no text overlays, no watermarks, no AI artifacts.'::text),
          true
        )
        else slide
      end
      order by slide_index
    ) as slides
  from post_templates pt
  cross join lateral jsonb_array_elements(pt.slides) with ordinality as slide_entries(slide, slide_index)
  where pt.name = 'Sailor Song'
  group by pt.id
)
update post_templates pt
set slides = updated_slides.slides
from updated_slides
where pt.id = updated_slides.id;
