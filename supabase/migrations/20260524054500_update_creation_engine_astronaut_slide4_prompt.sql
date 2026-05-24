with target as (
  select id, slides
  from public.post_templates
  where name = 'Creation Engine Astronaut'
),
rewritten as (
  select
    target.id,
    jsonb_agg(
      case
        when (slide_item.slide->>'order')::int = 4 then
          jsonb_set(
            slide_item.slide,
            '{prompt_recipe}',
            to_jsonb(
              'Show the same exact two people from the previous photo, now both 5 years older than before, in a different setting. Keep amateur phone-photo realism, era consistency, natural lighting, and candid imperfections.'::text
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
