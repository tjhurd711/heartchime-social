with astronaut as (
  select id, slides
  from public.post_templates
  where name = 'Creation Engine Astronaut'
),
rewritten as (
  select
    astronaut.id,
    jsonb_agg(
      case
        when (slide_item.slide->>'order')::int = 2
          then jsonb_set(
            slide_item.slide,
            '{prompt_recipe}',
            to_jsonb(
              'Show the same exact two people ({relationship}) from the previous photo, now both {age_step} years older than before, doing this activity: {scene_2} ({action_2}). Keep amateur realism, era consistency, natural lighting, and candid imperfections.'::text
            ),
            true
          )
        when (slide_item.slide->>'order')::int = 3
          then jsonb_set(
            slide_item.slide,
            '{prompt_recipe}',
            to_jsonb(
              'Show the same exact two people ({relationship}) from the previous photo, now both {age_step} years older than before, doing this activity: {scene_3} ({action_3}). Keep amateur realism, era consistency, natural lighting, and candid imperfections.'::text
            ),
            true
          )
        when (slide_item.slide->>'order')::int = 4
          then jsonb_set(
            slide_item.slide,
            '{prompt_recipe}',
            to_jsonb(
              'Show the same exact two people ({relationship}) from the previous photo, now both {age_step} years older than before, doing this activity: {scene_4} ({action_4}). Keep amateur realism, era consistency, natural lighting, and candid imperfections.'::text
            ),
            true
          )
        else slide_item.slide
      end
      order by slide_item.ord
    ) as slides
  from astronaut
  cross join lateral jsonb_array_elements(astronaut.slides) with ordinality as slide_item(slide, ord)
  group by astronaut.id
)
update public.post_templates as pt
set
  slides = rewritten.slides,
  updated_at = now()
from rewritten
where pt.id = rewritten.id;
