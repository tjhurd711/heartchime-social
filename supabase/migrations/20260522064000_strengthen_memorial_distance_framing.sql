update post_templates
set slides = (
  select jsonb_agg(
    case
      when (slide->>'order')::int = 2 then
        slide || jsonb_build_object(
          'prompt_recipe',
          'Respectful vertical memorial photograph. Wide amateur phone-photo framing from far back, camera about 25-35 feet away from the memorial. Photo angle is {memorial_camera_angle}; not a polished straight-on portrait. The memorial should be small in the frame, occupying only about 10-15% of the image height and sitting in the lower third of the image. Most of the image should be surrounding environment: grass, walkway or dirt path in the foreground, open space between camera and memorial, trees or other background elements softly blurred. Flowers and unlit candles may be visible at the base but should not be close enough to show fine petal or candle detail. This should feel like an imperfect phone picture taken by a regular person from across the yard/path/road, not a professional cemetery portrait. Slight tilt, casual framing, imperfect composition, natural phone-camera exposure. Do not make this a close-up. Do not crop into the memorial. Do not show individual flower petals in detail. Show the full memorial and the space around it. {memorial_scene_description} {memorial_attendees_description}. Somber documentary phone-photo feel, realistic environment, deep phone-camera focus with the wide scene visible, no text overlays, no watermarks, no AI artifacts.'
        )
      else slide
    end
    order by ordinality
  )
  from jsonb_array_elements(slides) with ordinality as expanded(slide, ordinality)
)
where name = 'Purple Rain (Before / After)';
