import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const maxDuration = 120
export const runtime = 'nodejs'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

interface SlideBundleItem {
  order: number
  image_url?: string | null
  url?: string | null
  live_photo_pvt_url?: string | null
  overlay_text?: string | null
}

interface LivePhotoEntry {
  order?: number
  slide_order?: number
  pvt_zip_url?: string
  urls?: {
    pvt_zip_url?: string
  }
}

interface SendToDeviceRequest {
  post_id?: string
  trend_name?: string
  album_name?: string
  slides?: SlideBundleItem[]
}

function getLivePhotoUrlForOrder(livePhotos: LivePhotoEntry[], order: number): string | undefined {
  const entry = livePhotos.find((item) => (item.slide_order ?? item.order) === order)
  return entry?.urls?.pvt_zip_url || entry?.pvt_zip_url
}

function normalizeSlides(slides: SlideBundleItem[], livePhotos: LivePhotoEntry[] = []) {
  return slides
    .sort((a, b) => a.order - b.order)
    .map((slide) => {
      const livePhotoUrl = slide.live_photo_pvt_url || getLivePhotoUrlForOrder(livePhotos, slide.order)

      return {
        order: slide.order,
        image_url: slide.image_url || slide.url || '',
        ...(livePhotoUrl ? { live_photo_pvt_url: livePhotoUrl } : {}),
        overlay_text: slide.overlay_text || '',
      }
    })
}

function isMacServerUnreachable(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'TimeoutError'
}

async function buildPayload(body: SendToDeviceRequest) {
  const trendName = body.trend_name || 'Purple Rain'
  const albumName = body.album_name || 'HC-Business'

  if (body.slides?.length) {
    return {
      post_id: body.post_id || '',
      trend_name: trendName,
      album_name: albumName,
      slides: normalizeSlides(body.slides),
    }
  }

  if (!body.post_id) {
    throw new Error('Missing required field: post_id')
  }

  const { data: post, error } = await supabase
    .from('social_posts')
    .select('id, slide_bundle, live_photo_urls')
    .eq('id', body.post_id)
    .single()

  if (error || !post) {
    throw new Error(error?.message || 'Post not found')
  }

  const slideBundle = Array.isArray(post.slide_bundle) ? post.slide_bundle as SlideBundleItem[] : []
  if (slideBundle.length === 0) {
    throw new Error('Post is missing slide_bundle. Regenerate this post before sending to iPhone.')
  }

  const livePhotos = Array.isArray(post.live_photo_urls) ? post.live_photo_urls as LivePhotoEntry[] : []

  return {
    post_id: post.id,
    trend_name: trendName,
    album_name: albumName,
    slides: normalizeSlides(slideBundle, livePhotos),
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as SendToDeviceRequest
    const serverUrl = process.env.LIVE_PHOTO_SERVER_URL
    const apiKey = process.env.LIVE_PHOTO_API_KEY ?? ''

    if (!serverUrl) {
      return NextResponse.json(
        { error: 'Mac server is not configured. Set LIVE_PHOTO_SERVER_URL.' },
        { status: 500 }
      )
    }

    const payload = await buildPayload(body)
    const response = await fetch(`${serverUrl.replace(/\/$/, '')}/send-to-device`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(110_000),
    })

    const responseText = await response.text()
    let responseBody: unknown = null
    try {
      responseBody = responseText ? JSON.parse(responseText) : null
    } catch {
      responseBody = responseText
    }

    if (!response.ok) {
      return NextResponse.json(
        {
          error: 'Mac server rejected the send-to-device request',
          status: response.status,
          details: responseBody,
          payload,
        },
        { status: 502 }
      )
    }

    return NextResponse.json({
      success: true,
      payload,
      imported_count:
        responseBody && typeof responseBody === 'object' && 'imported_count' in responseBody
          ? responseBody.imported_count
          : undefined,
      note_created:
        responseBody && typeof responseBody === 'object' && 'note_created' in responseBody
          ? responseBody.note_created
          : undefined,
      mac_response: responseBody,
    })
  } catch (error) {
    if (isMacServerUnreachable(error) || error instanceof TypeError) {
      return NextResponse.json(
        { error: 'Mac server unreachable — is it running?' },
        { status: 504 }
      )
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to send post to iPhone' },
      { status: 400 }
    )
  }
}
