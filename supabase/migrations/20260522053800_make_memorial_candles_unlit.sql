update post_templates
set slides = (
  select jsonb_agg(
    case
      when (slide->>'order')::int = 2 then
        slide || jsonb_build_object(
          'prompt_recipe',
          replace(slide->>'prompt_recipe', 'flowers and candles at the base', 'flowers and unlit candles at the base')
        )
      else slide
    end
    order by ordinality
  )
  from jsonb_array_elements(slides) with ordinality as expanded(slide, ordinality)
)
where name = 'Purple Rain (Before / After)';
