with target as (
  select id, slides
  from public.post_templates
  where name = 'Creation Engine'
),
rewritten as (
  select
    target.id,
    jsonb_agg(
      case
        when (slide_item.slide->>'order')::int = 2 then
          jsonb_set(
            slide_item.slide,
            '{prompt_recipe}',
            to_jsonb(
              'Using the provided reference image of the same people, place them in this setting/activity: {scene_2}. Keep the era and unprofessionalness of the photo the exact same - keep any glare or or imperfectness. Only thing to change is make sure their clothing is different and fits the era or new setting.'::text
            ),
            true
          )
        when (slide_item.slide->>'order')::int = 3 then
          jsonb_set(
            slide_item.slide,
            '{prompt_recipe}',
            to_jsonb(
              'Using the provided reference image of the same people, place them in this setting/activity: {scene_3}. Keep the era and unprofessionalness of the photo the exact same - keep any glare or or imperfectness. Only thing to change is make sure their clothing is different and fits the era or new setting.'::text
            ),
            true
          )
        when (slide_item.slide->>'order')::int = 4 then
          jsonb_set(
            slide_item.slide,
            '{prompt_recipe}',
            to_jsonb(
              'Using the provided reference image of the same people, place them in this setting/activity: {scene_4}. Keep the era and unprofessionalness of the photo the exact same - keep any glare or or imperfectness. Only thing to change is make sure their clothing is different and fits the era or new setting.'::text
            ),
            true
          )
        else slide_item.slide
      end
      order by slide_item.ord
    ) as slides
  from target
  cross join lateral jsonb_array_elements(target.slides) with ordinality as slide_item(slide, ord)
  group by target.id
)
update public.post_templates as pt
set
  slides = rewritten.slides,
  updated_at = now()
from rewritten
where pt.id = rewritten.id;
