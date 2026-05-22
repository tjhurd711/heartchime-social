update post_templates
set slides = (
  select jsonb_agg(
    case
      when (slide->>'order')::int = 2 then
        slide || jsonb_build_object(
          'prompt_recipe',
          'Respectful vertical memorial/headstone photograph in a cemetery or small roadside memorial. Wide documentary phone-photo framing from a few steps back, camera about 12-18 feet away from the memorial. The headstone should appear smaller in the frame, occupying only about 20-30% of the image height, with plenty of surrounding cemetery environment visible: grass, walkway or dirt path in the foreground, flowers and candles at the base, trees or other headstones softly blurred in the background. Do not make this a tight headstone close-up. Do not crop into the headstone. Show the full headstone and the space around it. A simple stone headstone engraved with exactly this inscription: "Love you forever, Jimmy". The inscription is carved into the stone in an elegant serif script, graceful and memorial-like, not printed or overlaid; it may be smaller because the camera is farther away, but should still be recognizable. Add a subtle carved flower design on the headstone, such as a small rose or lily relief beside the inscription. Fresh flowers, candles, and soft natural light. {memorial_attendees_description}. Somber documentary phone-photo feel, realistic environment, shallow depth of field, no other readable names or dates, no text overlays, no watermarks, no AI artifacts.'
        )
      else slide
    end
    order by ordinality
  )
  from jsonb_array_elements(slides) with ordinality as expanded(slide, ordinality)
)
where name = 'Purple Rain (Before / After)';
