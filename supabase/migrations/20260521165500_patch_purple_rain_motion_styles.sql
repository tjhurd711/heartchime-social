update post_templates
set slides = (
  select jsonb_agg(
    case
      when (slide->>'order')::int = 1 then
        slide || jsonb_build_object(
          'motion_style', 'ai_subtle',
          'live_photo_eligible', true,
          'live_photo_default', true
        )
      when (slide->>'order')::int = 2 then
        slide || jsonb_build_object(
          'motion_style', 'kenburns',
          'motion_hint', 'Slow zoom-in on the memorial photo. No AI motion. Respectful, still.',
          'live_photo_eligible', true,
          'live_photo_default', false
        )
      else slide
    end
    order by ordinality
  )
  from jsonb_array_elements(slides) with ordinality as expanded(slide, ordinality)
)
where name = 'Purple Rain (Before / After)';
