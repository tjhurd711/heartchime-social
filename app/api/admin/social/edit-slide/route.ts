import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { generateAndUploadGptImageEdit } from '@/lib/openaiImageGen'

export const runtime = 'nodejs'
export const maxDuration = 180

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

interface EditSlideRequest {
  post_id?: string
  slide_order?: number
  prompt?: string
}

interface SlideBundleItem {
  order?: number
  url?: string
  image_url?: string
  slide_type?: string
  live_photo_pvt_url?: string
  overlay_text?: string | null
  reference_pick_key?: string
}

interface LivePhotoEntry {
  order?: number
  slide_order?: number
}

function coerceSlideBundle(raw: unknown): SlideBundleItem[] {
  if (!Array.isArray(raw)) return []
  return raw as SlideBundleItem[]
}

function coerceSlidesUrls(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  return raw.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
}

function resolveSlideSourceUrl(
  slideOrder: number,
  slideBundle: SlideBundleItem[],
  slidesUrls: string[],
  slide1Url: string | null,
  slide2Url: string | null
): string | null {
  const bundleItem = slideBundle.find((item) => item.order === slideOrder)
  if (bundleItem?.image_url) return bundleItem.image_url
  if (bundleItem?.url) return bundleItem.url
  if (slidesUrls[slideOrder - 1]) return slidesUrls[slideOrder - 1]
  if (slideOrder === 1 && slide1Url) return slide1Url
  if (slideOrder === 2 && slide2Url) return slide2Url
  return null
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as EditSlideRequest
    const postId = typeof body.post_id === 'string' ? body.post_id.trim() : ''
    const slideOrder = Number.isFinite(body.slide_order) ? Math.floor(Number(body.slide_order)) : NaN
    const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : ''

    if (!postId) {
      return NextResponse.json({ error: 'Missing required field: post_id' }, { status: 400 })
    }
    if (!Number.isFinite(slideOrder) || slideOrder < 1) {
      return NextResponse.json({ error: 'Missing or invalid required field: slide_order' }, { status: 400 })
    }
    if (!prompt) {
      return NextResponse.json({ error: 'Missing required field: prompt' }, { status: 400 })
    }

    const { data: post, error: postError } = await supabase
      .from('social_posts')
      .select('id, slide_bundle, slides_urls, slide_1_url, slide_2_url, live_photo_urls')
      .eq('id', postId)
      .single()

    if (postError || !post) {
      return NextResponse.json({ error: postError?.message || 'Post not found' }, { status: 404 })
    }

    const slideBundle = coerceSlideBundle(post.slide_bundle)
    const slidesUrls = coerceSlidesUrls(post.slides_urls)
    const sourceUrl = resolveSlideSourceUrl(slideOrder, slideBundle, slidesUrls, post.slide_1_url, post.slide_2_url)

    if (!sourceUrl) {
      return NextResponse.json(
        { error: `Could not find a source image URL for slide ${slideOrder}` },
        { status: 400 }
      )
    }

    const editedUrl = await generateAndUploadGptImageEdit(prompt, sourceUrl)
    if (!editedUrl) {
      return NextResponse.json({ error: 'Failed to generate edited image' }, { status: 500 })
    }

    const nextSlideBundle = slideBundle.map((item) => {
      if (item.order !== slideOrder) return item
      return {
        ...item,
        url: editedUrl,
        image_url: editedUrl,
        // Existing live photo for this slide no longer matches new static image.
        live_photo_pvt_url: undefined,
      }
    })

    const nextSlidesUrls = [...slidesUrls]
    while (nextSlidesUrls.length < slideOrder) {
      nextSlidesUrls.push('')
    }
    nextSlidesUrls[slideOrder - 1] = editedUrl

    const livePhotoUrls = Array.isArray(post.live_photo_urls) ? (post.live_photo_urls as LivePhotoEntry[]) : []
    const nextLivePhotoUrls = livePhotoUrls.filter((entry) => (entry.slide_order ?? entry.order) !== slideOrder)

    const updatePayload: Record<string, unknown> = {
      slide_bundle: nextSlideBundle,
      slides_urls: nextSlidesUrls,
      live_photo_urls: nextLivePhotoUrls.length > 0 ? nextLivePhotoUrls : null,
      is_live_photo: nextLivePhotoUrls.length > 0,
    }

    if (slideOrder === 1) updatePayload.slide_1_url = editedUrl
    if (slideOrder === 2) updatePayload.slide_2_url = editedUrl

    const { data: updatedPost, error: updateError } = await supabase
      .from('social_posts')
      .update(updatePayload)
      .eq('id', postId)
      .select('*')
      .single()

    if (updateError || !updatedPost) {
      return NextResponse.json({ error: updateError?.message || 'Failed to update post' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      edited_url: editedUrl,
      slide_order: slideOrder,
      post: updatedPost,
    })
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Failed to edit slide image',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
