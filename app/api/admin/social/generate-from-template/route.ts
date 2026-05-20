import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { generateAndUploadPhoto } from '@/lib/geminiImageGen'
import { renderAndUploadSocialCard } from '@/lib/socialCardRenderer'
import { renderAndUploadSlide1, TextStyle } from '@/lib/socialSlide1Renderer'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

type TemplateCategory = 'evergreen' | 'trend'
type TemplateAccountType = 'business' | 'persona' | 'both'
type RequestAccountType = 'business' | 'persona'
type OverlayStyle = 'hook' | 'caption' | 'none'
type SlideType =
  | 'selfie'
  | 'vintage'
  | 'gravesite'
  | 'object'
  | 'text_card'
  | 'heartchime_card'
  | 'before_after'

interface GenerateFromTemplateRequest {
  template_id: string
  variables: Record<string, string>
  account_type: RequestAccountType
  persona_id?: string
}

interface PostTemplateSlide {
  order: number
  slide_type: SlideType
  prompt_recipe?: string
  text_overlay?: string
  overlay_style?: OverlayStyle
}

interface PostTemplateRow {
  id: string
  name: string
  category: TemplateCategory
  account_type: TemplateAccountType
  audio_track_name: string | null
  audio_track_url: string | null
  slide_count: number
  slides: unknown
  variables_needed: string[]
  is_active: boolean
}

const TRANSPARENT_PX =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WlAbQAAAABJRU5ErkJggg=='

function interpolatePrompt(recipe: string, variables: Record<string, string>): string {
  return recipe.replace(/\{([^}]+)\}/g, (_full, rawKey: string) => {
    const key = rawKey.trim()
    const value = variables[key]
    if (value === undefined || value === null || value === '') {
      throw new Error(`Missing template variable: ${key}`)
    }
    return value
  })
}

function parseSlides(raw: unknown): PostTemplateSlide[] {
  if (!Array.isArray(raw)) {
    throw new Error('Template slides must be an array')
  }

  const slides = raw as PostTemplateSlide[]
  for (const slide of slides) {
    if (typeof slide?.order !== 'number' || !slide?.slide_type) {
      throw new Error('Template slide is missing required fields: order, slide_type')
    }
  }

  return slides.sort((a, b) => a.order - b.order)
}

function resolveOverlayText(
  slide: PostTemplateSlide,
  variables: Record<string, string>,
  interpolatedPrompt?: string
): string | null {
  const style = slide.overlay_style ?? 'none'
  if (style === 'none') {
    return null
  }

  if (style === 'hook') {
    return variables.hook || (slide.text_overlay ? interpolatePrompt(slide.text_overlay, variables) : null)
  }

  if (slide.text_overlay) {
    return interpolatePrompt(slide.text_overlay, variables)
  }

  return interpolatedPrompt || null
}

function overlayStyleToTextStyle(style: OverlayStyle | undefined): TextStyle {
  return style === 'caption' ? 'clean' : 'snapchat'
}

export async function POST(request: NextRequest) {
  try {
    const body: GenerateFromTemplateRequest = await request.json()
    const { template_id, variables, account_type, persona_id } = body

    if (!template_id) {
      return NextResponse.json({ error: 'Missing required field: template_id' }, { status: 400 })
    }
    if (!variables || typeof variables !== 'object') {
      return NextResponse.json({ error: 'Missing required field: variables' }, { status: 400 })
    }
    if (!account_type || !['business', 'persona'].includes(account_type)) {
      return NextResponse.json({ error: 'Invalid account_type. Must be business or persona' }, { status: 400 })
    }
    if (account_type === 'persona' && !persona_id) {
      return NextResponse.json({ error: 'persona_id is required when account_type is persona' }, { status: 400 })
    }

    const { data: template, error: templateError } = await supabase
      .from('post_templates')
      .select('*')
      .eq('id', template_id)
      .eq('is_active', true)
      .single()

    if (templateError || !template) {
      return NextResponse.json({ error: 'Template not found or inactive' }, { status: 404 })
    }

    const typedTemplate = template as PostTemplateRow

    if (typedTemplate.account_type !== 'both' && typedTemplate.account_type !== account_type) {
      return NextResponse.json(
        { error: `Template account_type ${typedTemplate.account_type} does not support ${account_type}` },
        { status: 400 }
      )
    }

    const missingVariables = (typedTemplate.variables_needed || []).filter((name) => {
      const value = variables[name]
      return value === undefined || value === null || value === ''
    })

    if (missingVariables.length > 0) {
      return NextResponse.json(
        { error: `Missing required variables: ${missingVariables.join(', ')}` },
        { status: 400 }
      )
    }

    const slides = parseSlides(typedTemplate.slides)

    const slideResults: Array<{ order: number; url: string; slide_type: SlideType }> = []
    let latestImageUrl: string | null = null

    for (const slide of slides) {
      const interpolatedPrompt = slide.prompt_recipe
        ? interpolatePrompt(slide.prompt_recipe, variables)
        : ''

      if (slide.slide_type === 'heartchime_card') {
        const cardPhoto = latestImageUrl || ''
        const cardMessage =
          interpolatedPrompt ||
          variables.card_message ||
          `Remembering ${variables.deceased_name || 'your loved one'} with love.`
        const cardUrl = await renderAndUploadSocialCard(cardPhoto, cardMessage)
        slideResults.push({ order: slide.order, url: cardUrl, slide_type: slide.slide_type })
        latestImageUrl = cardUrl
        continue
      }

      if (slide.slide_type === 'text_card') {
        const textBody = interpolatedPrompt || slide.text_overlay || variables.hook || 'HeartChime'
        const textCardUrl = await renderAndUploadSlide1(
          TRANSPARENT_PX,
          textBody,
          overlayStyleToTextStyle(slide.overlay_style)
        )
        slideResults.push({ order: slide.order, url: textCardUrl, slide_type: slide.slide_type })
        latestImageUrl = textCardUrl
        continue
      }

      const baseImageUrl = await generateAndUploadPhoto(interpolatedPrompt)
      if (!baseImageUrl) {
        throw new Error(`Failed to generate image for slide order ${slide.order} (${slide.slide_type})`)
      }

      const overlayText = resolveOverlayText(slide, variables, interpolatedPrompt)
      const finalUrl =
        overlayText && overlayText.trim()
          ? await renderAndUploadSlide1(baseImageUrl, overlayText, overlayStyleToTextStyle(slide.overlay_style))
          : baseImageUrl

      slideResults.push({ order: slide.order, url: finalUrl, slide_type: slide.slide_type })
      latestImageUrl = finalUrl
    }

    const orderedUrls = slideResults.sort((a, b) => a.order - b.order).map((s) => s.url)

    const postInsert = {
      status: 'draft',
      platform: 'both',
      post_type: 'template',
      pipeline: typedTemplate.category,
      template_id: typedTemplate.id,
      slides_urls: orderedUrls,
      audio_track_name: typedTemplate.audio_track_name,
      audio_track_url: typedTemplate.audio_track_url,
      slide_count: orderedUrls.length,
      slide_1_url: orderedUrls[0] || null,
      slide_2_url: orderedUrls[1] || null,
      slide_3_url: orderedUrls[2] || null,
      hook_text: variables.hook || null,
      text_style: 'snapchat',
      deceased_nickname: variables.deceased_name || null,
      deceased_relationship: variables.relationship || 'loved one',
      time_period: variables.era || '1990s',
    }

    const { data: post, error: postError } = await supabase
      .from('social_posts')
      .insert(postInsert)
      .select('id')
      .single()

    if (postError || !post) {
      return NextResponse.json(
        { error: 'Failed to create social post', details: postError?.message || 'Unknown error' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      post_id: post.id,
      slides: slideResults.sort((a, b) => a.order - b.order),
    })
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Failed to generate post from template',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
