update post_templates
set slides = (
  select jsonb_agg(
    case
      when (slide->>'live_photo_framing_mode') = 'contain' then
        slide || jsonb_build_object('live_photo_framing_mode', 'fit')
      else slide
    end
    order by ordinality
  )
  from jsonb_array_elements(slides) with ordinality as expanded(slide, ordinality)
)
where name = 'Purple Rain (Before / After)';
