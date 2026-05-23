with sailor_song as (
  select id, slides
  from public.post_templates
  where name = 'Sailor Song'
),
rewritten as (
  select
    sailor_song.id,
    jsonb_agg(
      case
        when (slide_item.slide->>'order')::int = 1
          then jsonb_set(
            jsonb_set(
              slide_item.slide,
              '{photo_source}',
              '"reference_live_pick"'::jsonb,
              true
            ),
            '{prompt_recipe}',
            to_jsonb(
              'Create a candid phone snapshot with NEW, DIFFERENT people than the reference image. {subjects_description}. Keep the same amateur realism vibe and composition style from the reference: awkward natural pose, slight blur/soft focus, imperfect indoor lighting, and non-stock-photo authenticity. Keep action/composition similar, but change identity details and use a slightly different setting/background. Do not reproduce faces from the reference image.'::text
            ),
            true
          )
        else slide_item.slide
      end
      order by slide_item.ord
    ) as slides
  from sailor_song
  cross join lateral jsonb_array_elements(sailor_song.slides) with ordinality as slide_item(slide, ord)
  group by sailor_song.id
)
update public.post_templates as pt
set
  slides = rewritten.slides,
  updated_at = now()
from rewritten
where pt.id = rewritten.id;
