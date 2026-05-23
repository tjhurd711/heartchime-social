with updated_slides as (
  select
    pt.id,
    jsonb_agg(
      case
        when slide->>'order' = '1' then jsonb_set(
          slide,
          '{prompt_recipe}',
          to_jsonb('Authentic vintage photograph from the {era_1}. {subjects_description}. Candid family/personal moment with era-appropriate clothing and styling, realistic expressions, imperfect amateur framing, and natural light. Vertical composition. No text overlays, no watermarks, no AI artifacts.'::text),
          true
        )
        when slide->>'order' = '2' then jsonb_set(
          slide,
          '{prompt_recipe}',
          to_jsonb('Authentic vintage photograph from the {era_2}. Using the provided reference image, generate the exact same people from the reference image, now {scene_2}. Preserve their exact facial features, age appearance, ethnicity, body type, and overall identity from the reference; only change setting/activity and era styling. Use era-appropriate clothing and realistic period color/film rendering. Realistic amateur photo look, natural light, candid composition, no text overlays, no watermarks, no AI artifacts.'::text),
          true
        )
        when slide->>'order' = '3' then jsonb_set(
          slide,
          '{prompt_recipe}',
          to_jsonb('Authentic vintage photograph from the {era_3}. Using the provided reference image, generate the exact same people from the reference image, now {scene_3}. Preserve their exact facial features, age appearance, ethnicity, body type, and overall identity from the reference; only change setting/activity and era styling. Use era-appropriate clothing and realistic period color/film rendering. Realistic amateur photo look, natural light, candid composition, no text overlays, no watermarks, no AI artifacts.'::text),
          true
        )
        when slide->>'order' = '4' then jsonb_set(
          slide,
          '{prompt_recipe}',
          to_jsonb('Authentic vintage photograph from the {era_4}. Using the provided reference image, generate the exact same people from the reference image, now {scene_4}. Preserve their exact facial features, age appearance, ethnicity, body type, and overall identity from the reference; only change setting/activity and era styling. Use era-appropriate clothing and realistic period color/film rendering. Realistic amateur photo look, natural light, candid composition, no text overlays, no watermarks, no AI artifacts.'::text),
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
set
  slides = updated_slides.slides,
  variables_needed = array(
    select distinct item
    from unnest(coalesce(pt.variables_needed, '{}'::text[]) || array['era_1', 'era_2', 'era_3', 'era_4']) as item
  ),
  variables_schema =
    coalesce(pt.variables_schema, '[]'::jsonb) ||
    case
      when coalesce(pt.variables_schema, '[]'::jsonb) @? '$[*] ? (@.name == "era_1")' then '[]'::jsonb
      else jsonb_build_array(
        jsonb_build_object(
          'name', 'era_1',
          'label', 'Era for slide 1',
          'type', 'select',
          'required', true,
          'options', jsonb_build_array('1970s','1980s','1990s','2000s','2010s','2020s')
        )
      )
    end ||
    case
      when coalesce(pt.variables_schema, '[]'::jsonb) @? '$[*] ? (@.name == "era_2")' then '[]'::jsonb
      else jsonb_build_array(
        jsonb_build_object(
          'name', 'era_2',
          'label', 'Era for slide 2',
          'type', 'select',
          'required', true,
          'options', jsonb_build_array('1970s','1980s','1990s','2000s','2010s','2020s')
        )
      )
    end ||
    case
      when coalesce(pt.variables_schema, '[]'::jsonb) @? '$[*] ? (@.name == "era_3")' then '[]'::jsonb
      else jsonb_build_array(
        jsonb_build_object(
          'name', 'era_3',
          'label', 'Era for slide 3',
          'type', 'select',
          'required', true,
          'options', jsonb_build_array('1970s','1980s','1990s','2000s','2010s','2020s')
        )
      )
    end ||
    case
      when coalesce(pt.variables_schema, '[]'::jsonb) @? '$[*] ? (@.name == "era_4")' then '[]'::jsonb
      else jsonb_build_array(
        jsonb_build_object(
          'name', 'era_4',
          'label', 'Era for slide 4',
          'type', 'select',
          'required', true,
          'options', jsonb_build_array('1970s','1980s','1990s','2000s','2010s','2020s')
        )
      )
    end
from updated_slides
where pt.id = updated_slides.id;
