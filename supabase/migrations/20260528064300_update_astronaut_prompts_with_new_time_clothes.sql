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
        when (slide_item.slide->>'order')::int = 1
          then jsonb_set(
            slide_item.slide,
            '{prompt_recipe}',
            to_jsonb(
              'Authentic candid vertical phone photo with awkward-real, non-polished framing. The people are {race}. Keep natural blur, imperfect indoor/outdoor lighting, and believable everyday composition. Make this feel like a real personal snapshot (not studio, not stock). Because this is a completely new time, they should be wearing different clothes as well. {slide_1_extra_detail_clause}'::text
            ),
            true
          )
        when (slide_item.slide->>'order')::int = 2
          then jsonb_set(
            slide_item.slide,
            '{prompt_recipe}',
            to_jsonb(
              'Show the same exact two people ({relationship}) from the previous photo, now both {age_step} years older than before, doing this activity: {scene_2} ({action_2}). Because this is a completely new time, they should be wearing different clothes as well. Keep amateur realism, era consistency, natural lighting, and candid imperfections.'::text
            ),
            true
          )
        when (slide_item.slide->>'order')::int = 3
          then jsonb_set(
            slide_item.slide,
            '{prompt_recipe}',
            to_jsonb(
              'Show the same exact two people ({relationship}) from the previous photo, now both {age_step} years older than before, doing this activity: {scene_3} ({action_3}). Because this is a completely new time, they should be wearing different clothes as well. Keep amateur realism, era consistency, natural lighting, and candid imperfections.'::text
            ),
            true
          )
        when (slide_item.slide->>'order')::int = 4
          then jsonb_set(
            slide_item.slide,
            '{prompt_recipe}',
            to_jsonb(
              'Show the same exact two people ({relationship}) from the previous photo, now both {age_step} years older than before, doing this activity: {scene_4} ({action_4}). Because this is a completely new time, they should be wearing different clothes as well. Keep amateur realism, era consistency, natural lighting, and candid imperfections.'::text
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
