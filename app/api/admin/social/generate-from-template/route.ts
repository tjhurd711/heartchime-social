import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { generateAndUploadPhoto } from '@/lib/geminiImageGen'
import { renderAndUploadSocialCard } from '@/lib/socialCardRenderer'
import { renderAndUploadSlide1, TextStyle } from '@/lib/socialSlide1Renderer'
import { buildPhotoPrompt } from '@/lib/socialPhotoPrompt'

export const maxDuration = 300
export const runtime = 'nodejs'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

type TemplateCategory = 'evergreen' | 'trend'
type TemplateAccountType = 'business' | 'persona' | 'both'
type RequestAccountType = 'business' | 'persona'
type OverlayStyle = 'hook' | 'caption' | 'lyric' | 'none'
type SlideType =
  | 'selfie'
  | 'vintage'
  | 'gravesite'
  | 'object'
  | 'ai_generated'
  | 'text_card'
  | 'heartchime_card'
  | 'photo_upload_display'
  | 'before_after'
type LegacyEvergreenPostType = 'birthday' | 'passing_anniversary' | 'wedding_anniversary' | 'user_birthday'
type CharacterKey = 'alive' | 'deceased'
type PhotoSource = 'generated' | 'variable' | 'variable_or_generated'
type MotionStyle = 'ai_subtle' | 'kenburns' | 'static_hold'

interface GenerateFromTemplateRequest {
  template_id: string
  variables: Record<string, string>
  account_type: RequestAccountType
  persona_id?: string
  generate_live_photos?: boolean
  live_photo_slide_orders?: number[]
}

interface PostTemplateSlide {
  order: number
  slide_type: SlideType
  prompt_recipe?: string
  text_overlay?: string
  overlay_style?: OverlayStyle
  motion_hint?: string
  motion_style?: MotionStyle
  live_photo_eligible?: boolean
  live_photo_default?: boolean
  characters?: CharacterKey[]
  photo_source?: PhotoSource
  photo_variable?: string
  photo_variable_name?: string
  variable_name?: string
}

interface LivePhotoResult {
  order: number
  pvt_zip_url: string
  photo_url: string
  video_url: string
}

interface LivePhotoResponse {
  slide_order: number
  urls: {
    pvt_zip_url: string
    photo_url: string
    video_url: string
  }
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
  live_photo_supported: boolean
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

function normalizeEthnicity(value: string): string {
  return value.replace(/_/g, ' ')
}

function genderToNoun(value: string): string {
  if (value === 'male') return 'man'
  if (value === 'female') return 'woman'
  return value
}

function buildCharacterDescriptions(
  slide: PostTemplateSlide,
  variables: Record<string, string>
): Record<string, string> {
  const interpolationContext: Record<string, string> = {}
  const characters = slide.characters || []

  for (const character of characters) {
    const age = variables[`${character}_age`]
    const gender = variables[`${character}_gender`]
    const ethnicity = variables[`${character}_ethnicity`]

    if (age && gender && ethnicity) {
      interpolationContext[`${character}_description`] =
        `a ${age} ${genderToNoun(gender)}, ${normalizeEthnicity(ethnicity)}`
    }
  }

  return interpolationContext
}

function resolvePhotoVariableName(slide: PostTemplateSlide): string | null {
  return slide.photo_variable || slide.photo_variable_name || slide.variable_name || null
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
  if (style === 'lyric') return 'lyric'
  return style === 'caption' ? 'clean' : 'snapchat'
}

function resolveEvergreenLegacyPrompt(
  templateCategory: TemplateCategory,
  slideType: SlideType,
  variables: Record<string, string>
): string | null {
  if (templateCategory !== 'evergreen') return null
  if (slideType !== 'selfie' && slideType !== 'vintage') return null

  const relationship = variables.relationship
  const era = variables.era
  if (!relationship || !era) return null

  const requestedPostType = variables.post_type as LegacyEvergreenPostType | undefined
  const postType: LegacyEvergreenPostType =
    requestedPostType && ['birthday', 'passing_anniversary', 'wedding_anniversary', 'user_birthday'].includes(requestedPostType)
      ? requestedPostType
      : 'birthday'

  // Preserve legacy evergreen vintage-photo prompt generation exactly.
  return buildPhotoPrompt(postType, relationship, 'female', '40s', era, undefined)
}

export async function POST(request: NextRequest) {
  try {
    const body: GenerateFromTemplateRequest = await request.json()
    const {
      template_id,
      variables,
      account_type,
      persona_id,
      generate_live_photos = false,
      live_photo_slide_orders,
    } = body

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
    if ((generate_live_photos || (live_photo_slide_orders && live_photo_slide_orders.length > 0)) && !typedTemplate.live_photo_supported) {
      return NextResponse.json(
        { error: 'This template does not support live photo generation' },
        { status: 400 }
      )
    }

    const missingVariables = (typedTemplate.variables_needed || []).filter((name) => {
      const value = variables[name]
      return value === undefined || value === null || value === ''
    })

    const slides = parseSlides(typedTemplate.slides)
    const slideDerivedMissing = new Set<string>()
    for (const slide of slides) {
      for (const character of slide.characters || []) {
        slideDerivedMissing.add(`${character}_age`)
        slideDerivedMissing.add(`${character}_gender`)
        slideDerivedMissing.add(`${character}_ethnicity`)
      }

      if (slide.photo_source === 'variable' || slide.slide_type === 'photo_upload_display') {
        const photoVariableName = resolvePhotoVariableName(slide)
        if (!photoVariableName) {
          return NextResponse.json(
            { error: `Slide order ${slide.order} uses photo_source=variable but is missing photo variable name` },
            { status: 400 }
          )
        }
        slideDerivedMissing.add(photoVariableName)
      } else if (slide.photo_source === 'variable_or_generated') {
        const photoVariableName = resolvePhotoVariableName(slide)
        if (!photoVariableName) {
          return NextResponse.json(
            { error: `Slide order ${slide.order} uses photo_source=variable_or_generated but is missing photo variable name` },
            { status: 400 }
          )
        }
      }
    }

    const allMissingVariables = [...new Set([...missingVariables, ...slideDerivedMissing])].filter((name) => {
      const value = variables[name]
      return value === undefined || value === null || value === ''
    })

    if (allMissingVariables.length > 0) {
      return NextResponse.json(
        { error: `Missing required variables: ${allMissingVariables.join(', ')}` },
        { status: 400 }
      )
    }

    const slideResults: Array<{ order: number; url: string; slide_type: SlideType }> = []
    let latestImageUrl: string | null = null
    let evergreenCardPhotoUrl: string | null = null

    for (const slide of slides) {
      const interpolationContext = {
        ...variables,
        ...buildCharacterDescriptions(slide, variables),
      }

      let interpolatedPrompt = slide.prompt_recipe
        ? interpolatePrompt(slide.prompt_recipe, interpolationContext)
        : ''
      const legacyEvergreenPrompt = resolveEvergreenLegacyPrompt(
        typedTemplate.category,
        slide.slide_type,
        variables
      )
      if (legacyEvergreenPrompt) {
        interpolatedPrompt = legacyEvergreenPrompt
      }

      if (slide.slide_type === 'heartchime_card') {
        if (typedTemplate.category === 'evergreen' && !evergreenCardPhotoUrl) {
          const cardPhotoPrompt = resolveEvergreenLegacyPrompt(
            typedTemplate.category,
            'vintage',
            variables
          )
          if (cardPhotoPrompt) {
            evergreenCardPhotoUrl = await generateAndUploadPhoto(cardPhotoPrompt)
          }
        }

        const photoVariableName = slide.photo_source === 'variable' ? resolvePhotoVariableName(slide) : null
        const variablePhoto = photoVariableName ? interpolationContext[photoVariableName] : null
        const cardPhoto = variablePhoto || evergreenCardPhotoUrl || latestImageUrl || ''
        const cardMessage =
          interpolatedPrompt ||
          variables.card_message ||
          `Remembering ${variables.deceased_name || 'your loved one'} with love.`
        const cardUrl = await renderAndUploadSocialCard(cardPhoto, cardMessage)
        slideResults.push({ order: slide.order, url: cardUrl, slide_type: slide.slide_type })
        latestImageUrl = cardUrl
        continue
      }

      if (slide.slide_type === 'selfie' && variables.selfie_url) {
        const overlayText = resolveOverlayText(slide, interpolationContext, interpolatedPrompt)
        const selfieUrl = overlayText && overlayText.trim()
          ? await renderAndUploadSlide1(
              variables.selfie_url,
              overlayText,
              overlayStyleToTextStyle(slide.overlay_style)
            )
          : variables.selfie_url

        slideResults.push({ order: slide.order, url: selfieUrl, slide_type: slide.slide_type })
        latestImageUrl = selfieUrl
        continue
      }

      if (slide.slide_type === 'text_card') {
        const textBody = interpolatedPrompt || slide.text_overlay || interpolationContext.hook || 'HeartChime'
        const textCardUrl = await renderAndUploadSlide1(
          TRANSPARENT_PX,
          textBody,
          overlayStyleToTextStyle(slide.overlay_style)
        )
        slideResults.push({ order: slide.order, url: textCardUrl, slide_type: slide.slide_type })
        latestImageUrl = textCardUrl
        continue
      }

      if (slide.slide_type === 'photo_upload_display') {
        const photoVariableName = resolvePhotoVariableName(slide)
        if (!photoVariableName) {
          throw new Error(`Slide order ${slide.order} (photo_upload_display) is missing photo variable name`)
        }

        const sourcePhotoUrl = interpolationContext[photoVariableName]
        if (!sourcePhotoUrl) {
          throw new Error(`Slide order ${slide.order} is missing required photo variable: ${photoVariableName}`)
        }

        const overlayText = resolveOverlayText(slide, interpolationContext, interpolatedPrompt)
        const finalUrl =
          overlayText && overlayText.trim()
            ? await renderAndUploadSlide1(sourcePhotoUrl, overlayText, overlayStyleToTextStyle(slide.overlay_style))
            : sourcePhotoUrl

        slideResults.push({ order: slide.order, url: finalUrl, slide_type: slide.slide_type })
        latestImageUrl = finalUrl
        continue
      }

      let baseImageUrl: string | null = null
      if (slide.photo_source === 'variable') {
        const photoVariableName = resolvePhotoVariableName(slide)
        baseImageUrl = photoVariableName ? interpolationContext[photoVariableName] : null
      } else if (slide.photo_source === 'variable_or_generated') {
        const photoVariableName = resolvePhotoVariableName(slide)
        const variablePhoto = photoVariableName ? interpolationContext[photoVariableName] : null
        baseImageUrl = variablePhoto || await generateAndUploadPhoto(interpolatedPrompt)
      } else {
        baseImageUrl = await generateAndUploadPhoto(interpolatedPrompt)
      }

      if (!baseImageUrl) {
        throw new Error(`Failed to generate image for slide order ${slide.order} (${slide.slide_type})`)
      }

      const overlayText = resolveOverlayText(slide, interpolationContext, interpolatedPrompt)
      const finalUrl =
        overlayText && overlayText.trim()
          ? await renderAndUploadSlide1(baseImageUrl, overlayText, overlayStyleToTextStyle(slide.overlay_style))
          : baseImageUrl

      slideResults.push({ order: slide.order, url: finalUrl, slide_type: slide.slide_type })
      latestImageUrl = finalUrl
    }

    const orderedUrls = slideResults.sort((a, b) => a.order - b.order).map((s) => s.url)
    const orderedSlides = slideResults.sort((a, b) => a.order - b.order)
    const livePhotoResults: LivePhotoResult[] = []
    const livePhotoWarnings: string[] = []
    let isLivePhoto = false
    const eligibleLivePhotoOrders = slides
      .filter((slide) => slide.live_photo_eligible)
      .map((slide) => slide.order)
    const requestedLivePhotoOrders = live_photo_slide_orders ?? (generate_live_photos ? eligibleLivePhotoOrders : [])

    if (requestedLivePhotoOrders.length > 0) {
      const livePhotoServerUrl = process.env.LIVE_PHOTO_SERVER_URL
      const livePhotoApiKey = process.env.LIVE_PHOTO_API_KEY

      if (!livePhotoServerUrl || !livePhotoApiKey) {
        livePhotoWarnings.push('Live Photo server is not configured; generated static slides only.')
      } else {
        const slideUrlByOrder = new Map<number, string>()
        for (const slideResult of orderedSlides) {
          slideUrlByOrder.set(slideResult.order, slideResult.url)
        }

        for (const slide of slides) {
          if (!slide.live_photo_eligible) {
            continue
          }
          if (!requestedLivePhotoOrders.includes(slide.order)) {
            continue
          }
          if (!slide.motion_hint) {
            continue
          }

          const staticSlideUrl = slideUrlByOrder.get(slide.order)
          if (!staticSlideUrl) {
            livePhotoWarnings.push(`Missing static image URL for slide ${slide.order}; skipped live photo generation.`)
            continue
          }

          const interpolationContext = {
            ...variables,
            ...buildCharacterDescriptions(slide, variables),
          }

          let interpolatedMotionHint = slide.motion_hint
          try {
            interpolatedMotionHint = interpolatePrompt(slide.motion_hint, interpolationContext)
          } catch (error) {
            livePhotoWarnings.push(
              `Failed to interpolate motion hint for slide ${slide.order}: ${error instanceof Error ? error.message : 'Unknown error'}`
            )
            continue
          }

          try {
            const response = await fetch(`${livePhotoServerUrl.replace(/\/$/, '')}/generate`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${livePhotoApiKey}`,
              },
              body: JSON.stringify({
                image_url: staticSlideUrl,
                motion_style: slide.motion_style || 'ai_subtle',
                motion_hint: interpolatedMotionHint,
                output_orientation: 'vertical',
                framing_mode: 'fill',
              }),
            })

            if (!response.ok) {
              const responseText = await response.text()
              throw new Error(
                `Live photo server returned ${response.status}: ${responseText || 'No response body'}`
              )
            }

            const data = await response.json()
            if (!data?.pvt_url || !data?.photo_url || !data?.video_url) {
              throw new Error('Live photo response missing pvt_url, photo_url, or video_url')
            }

            livePhotoResults.push({
              order: slide.order,
              pvt_zip_url: data.pvt_url,
              photo_url: data.photo_url,
              video_url: data.video_url,
            })
          } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error'
            console.error(`Live photo generation failed for slide ${slide.order}:`, error)
            livePhotoWarnings.push(`Slide ${slide.order} live photo generation failed: ${message}`)
          }
        }

        isLivePhoto = livePhotoResults.length > 0 && livePhotoWarnings.length === 0
      }
    }

    const livePhotos: LivePhotoResponse[] = livePhotoResults
      .sort((a, b) => a.order - b.order)
      .map((result) => ({
        slide_order: result.order,
        urls: {
          pvt_zip_url: result.pvt_zip_url,
          photo_url: result.photo_url,
          video_url: result.video_url,
        },
      }))

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
      live_photo_urls: livePhotos.length > 0 ? livePhotos : null,
      is_live_photo: isLivePhoto,
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
      slides: orderedSlides,
      is_live_photo: isLivePhoto,
      live_photo_urls: livePhotos.length > 0 ? livePhotos : undefined,
      live_photos: livePhotos.length > 0 ? livePhotos : undefined,
      live_photo_warning: livePhotoWarnings.length > 0 ? livePhotoWarnings.join(' ') : undefined,
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
