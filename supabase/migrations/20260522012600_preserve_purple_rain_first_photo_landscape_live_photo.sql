update post_templates
set slides = (
  select jsonb_agg(
    case
      when (slide->>'order')::int = 1 then
        slide || jsonb_build_object(
          'live_photo_output_orientation', 'vertical',
          'live_photo_framing_mode', 'contain'
        )
      else slide
    end
    order by ordinality
  )
  from jsonb_array_elements(slides) with ordinality as expanded(slide, ordinality)
)
where name = 'Purple Rain (Before / After)';
