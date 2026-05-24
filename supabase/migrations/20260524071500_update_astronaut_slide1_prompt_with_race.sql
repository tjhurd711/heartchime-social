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
              'Authentic candid vertical phone photo with awkward-real, non-polished framing. The people are {race}. Keep natural blur, imperfect indoor/outdoor lighting, and believable everyday composition. Make this feel like a real personal snapshot (not studio, not stock). {slide_1_extra_detail_clause}'::text
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
