update post_templates
set slides = (
  select jsonb_agg(
    case
      when (slide->>'order')::int = 1 then
        slide || jsonb_build_object(
          'prompt_recipe',
          'Authentic vintage photograph from the {era}. {subjects_description} together in a candid family/personal photo. Medium-wide snapshot from across the room or yard, camera about 8-12 feet away. People are not close to the camera; show full upper bodies or most of their bodies, with visible surrounding environment. Subjects should occupy only about 35-45% of the frame, not a tight portrait, not a selfie, not a close-up. Shot by a family member, amateur framing, natural imperfect lighting, slight motion blur acceptable. Looks like a photo pulled from a shoebox or phone camera roll. No watermarks, no text overlays, no AI artifacts.'
        )
      else slide
    end
    order by ordinality
  )
  from jsonb_array_elements(slides) with ordinality as expanded(slide, ordinality)
)
where name = 'Purple Rain (Before / After)';
