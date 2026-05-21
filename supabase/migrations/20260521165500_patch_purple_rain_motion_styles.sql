update post_templates
set slides = (
  select jsonb_agg(
    case
      when (slide->>'order')::int = 1 then
        slide || jsonb_build_object(
          'motion_style', 'ai_subtle',
          'live_photo_eligible', true,
          'live_photo_default', true,
          'subjects_config', jsonb_build_object(
            'enabled', true,
            'min', 1,
            'max', 3,
            'require_one_deceased', true
          ),
          'prompt_recipe', 'Authentic vintage photograph from the {era}. {subjects_description} together in a candid family/personal photo. Shot by a family member, amateur framing, natural imperfect lighting, slight motion blur acceptable. Looks like a photo pulled from a shoebox or phone camera roll. No watermarks, no text overlays, no AI artifacts.'
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
