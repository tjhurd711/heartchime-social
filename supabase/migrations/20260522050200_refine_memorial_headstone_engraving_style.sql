update post_templates
set slides = (
  select jsonb_agg(
    case
      when (slide->>'order')::int = 2 then
        slide || jsonb_build_object(
          'prompt_recipe',
          'Respectful vertical memorial/headstone photograph in a cemetery or small roadside memorial. A simple stone headstone engraved with exactly this readable inscription: "Love you forever, Jimmy". The inscription is carved into the stone in an elegant serif script, graceful and memorial-like, not printed or overlaid. Add a subtle carved flower design on the headstone, such as a small rose or lily relief beside the inscription. Fresh flowers, candles, and soft natural light. {memorial_attendees_description}. Somber documentary phone-photo feel, realistic environment, shallow depth of field, no other readable names or dates, no text overlays, no watermarks, no AI artifacts.'
        )
      else slide
    end
    order by ordinality
  )
  from jsonb_array_elements(slides) with ordinality as expanded(slide, ordinality)
)
where name = 'Purple Rain (Before / After)';
