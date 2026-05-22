update post_templates
set slides = (
  select jsonb_agg(
    case
      when (slide->>'order')::int = 2 then
        slide || jsonb_build_object(
          'prompt_recipe',
          'Respectful vertical memorial/headstone photograph in a cemetery or small roadside memorial. A simple headstone engraved with exactly this readable inscription: "Love you forever, Jimmy". Flowers, candles, and soft natural light. {memorial_attendees_description}. Somber documentary phone-photo feel, realistic environment, shallow depth of field, no other readable names or dates, no text overlays, no watermarks, no AI artifacts.'
        )
      else slide
    end
    order by ordinality
  )
  from jsonb_array_elements(slides) with ordinality as expanded(slide, ordinality)
)
where name = 'Purple Rain (Before / After)';
