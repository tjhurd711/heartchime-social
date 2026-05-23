with updated_slides as (
  select
    pt.id,
    jsonb_agg(
      case
        when slide->>'order' = '1' then
          jsonb_set(
            jsonb_set(
              jsonb_set(
                slide,
                '{prompt_recipe}',
                to_jsonb('Authentic vintage photograph from the {era_1}. {subjects_description}. Candid family/personal moment with era-appropriate clothing and styling, realistic expressions, imperfect amateur framing, and natural light. Horizontal landscape composition (wide frame), not vertical portrait. No text overlays, no watermarks, no AI artifacts.'::text),
                true
              ),
              '{live_photo_output_orientation}',
              to_jsonb('horizontal'::text),
              true
            ),
            '{live_photo_framing_mode}',
            to_jsonb('fit'::text),
            true
          )
        when slide->>'order' = '2' then
          jsonb_set(
            jsonb_set(
              jsonb_set(
                slide,
                '{prompt_recipe}',
                to_jsonb('Authentic vintage photograph from the {era_2}. Using the provided reference image, generate the exact same people from the reference image, now {scene_2}. Preserve their exact facial features, age appearance, ethnicity, body type, and overall identity from the reference; only change setting/activity and era styling. Use era-appropriate clothing and realistic period color/film rendering. Realistic amateur photo look, natural light, candid composition. Horizontal landscape composition (wide frame), not vertical portrait. No text overlays, no watermarks, no AI artifacts.'::text),
                true
              ),
              '{live_photo_output_orientation}',
              to_jsonb('horizontal'::text),
              true
            ),
            '{live_photo_framing_mode}',
            to_jsonb('fit'::text),
            true
          )
        when slide->>'order' = '3' then
          jsonb_set(
            jsonb_set(
              jsonb_set(
                slide,
                '{prompt_recipe}',
                to_jsonb('Authentic vintage photograph from the {era_3}. Using the provided reference image, generate the exact same people from the reference image, now {scene_3}. Preserve their exact facial features, age appearance, ethnicity, body type, and overall identity from the reference; only change setting/activity and era styling. Use era-appropriate clothing and realistic period color/film rendering. Realistic amateur photo look, natural light, candid composition. Horizontal landscape composition (wide frame), not vertical portrait. No text overlays, no watermarks, no AI artifacts.'::text),
                true
              ),
              '{live_photo_output_orientation}',
              to_jsonb('horizontal'::text),
              true
            ),
            '{live_photo_framing_mode}',
            to_jsonb('fit'::text),
            true
          )
        when slide->>'order' = '4' then
          jsonb_set(
            jsonb_set(
              jsonb_set(
                slide,
                '{prompt_recipe}',
                to_jsonb('Authentic vintage photograph from the {era_4}. Using the provided reference image, generate the exact same people from the reference image, now {scene_4}. Preserve their exact facial features, age appearance, ethnicity, body type, and overall identity from the reference; only change setting/activity and era styling. Use era-appropriate clothing and realistic period color/film rendering. Realistic amateur photo look, natural light, candid composition. Horizontal landscape composition (wide frame), not vertical portrait. No text overlays, no watermarks, no AI artifacts.'::text),
                true
              ),
              '{live_photo_output_orientation}',
              to_jsonb('horizontal'::text),
              true
            ),
            '{live_photo_framing_mode}',
            to_jsonb('fit'::text),
            true
          )
        when slide->>'order' = '5' then
          jsonb_set(
            slide,
            '{prompt_recipe}',
            to_jsonb('Respectful landscape memorial photograph. Amateur phone-photo framing using the selected camera distance. Photo angle is {memorial_camera_angle}; not a polished straight-on portrait. Follow the camera distance instruction from the memorial scene description exactly. The memorial should be framed at the selected size with surrounding environment visible: grass, walkway or dirt path in the foreground, open space between camera and memorial when distance is far, trees or other background elements softly blurred. Flowers and unlit candles may be visible at the base but should not be close enough to show fine petal or candle detail unless close distance is selected. This should feel like an imperfect phone picture taken by a regular person, not a professional cemetery portrait. Slight tilt, casual framing, imperfect composition, natural phone-camera exposure. Do not crop into the memorial. Show the full memorial and the space around it in a horizontal landscape frame. {memorial_scene_description} {memorial_attendees_description}. Somber documentary phone-photo feel, realistic environment, deep phone-camera focus with the wide scene visible, no text overlays, no watermarks, no AI artifacts.'::text),
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
