import { NextRequest, NextResponse } from 'next/server'
import { renderAndUploadSocialCard } from '@/lib/socialCardRenderer'

export const runtime = 'nodejs'
// Puppeteer rendering can take a while; allow generous headroom.
export const maxDuration = 60

const CARD_BUCKET = process.env.AWS_S3_BUCKET || 'heartbeat-photos-prod'
const MAX_MESSAGE_LENGTH = 600
// Rendering is expensive (headless Chrome); throttle hard per IP.
const RATE_LIMIT_WINDOW_MS = 15_000

// Best-effort in-memory rate limit (per instance, resets on cold start).
const lastRenderByIp = new Map<string, number>()

function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0].trim()
  return request.headers.get('x-real-ip')?.trim() || 'unknown'
}

interface RenderBody {
  photoUrl?: string
  photoKey?: string
  message?: string
  dotCount?: number
}

// Only allow photos we issued an upload URL for (our own bucket), to avoid being
// used as a generic image proxy/renderer for arbitrary remote URLs.
function resolvePhotoUrl(body: RenderBody): string | null {
  if (typeof body.photoKey === 'string' && body.photoKey.startsWith('social-cards/uploads/')) {
    return `https://${CARD_BUCKET}.s3.us-east-2.amazonaws.com/${body.photoKey}`
  }
  if (typeof body.photoUrl === 'string') {
    const url = body.photoUrl.trim()
    const allowedHostSuffix = `${CARD_BUCKET}.s3.us-east-2.amazonaws.com`
    try {
      const parsed = new URL(url)
      if (
        parsed.protocol === 'https:' &&
        parsed.hostname === allowedHostSuffix &&
        parsed.pathname.startsWith('/social-cards/uploads/')
      ) {
        return url
      }
    } catch {
      return null
    }
  }
  return null
}

export async function POST(request: NextRequest) {
  try {
    const ip = getClientIp(request)
    const now = Date.now()
    const last = lastRenderByIp.get(ip)
    if (last && now - last < RATE_LIMIT_WINDOW_MS) {
      return NextResponse.json(
        { error: 'You are creating cards too quickly. Please wait a few seconds and try again.' },
        { status: 429 }
      )
    }

    const body = (await request.json()) as RenderBody

    const message = (body.message || '').trim()
    if (!message) {
      return NextResponse.json({ error: 'Please enter a message for your card.' }, { status: 400 })
    }
    if (message.length > MAX_MESSAGE_LENGTH) {
      return NextResponse.json(
        { error: `Message is too long (max ${MAX_MESSAGE_LENGTH} characters).` },
        { status: 400 }
      )
    }

    const photoUrl = resolvePhotoUrl(body)
    if (!photoUrl) {
      return NextResponse.json(
        { error: 'A valid uploaded photo is required.' },
        { status: 400 }
      )
    }

    // Slideshow dots are optional decoration; only 2-4 are supported, anything
    // else (including 0/undefined) means "no dots".
    const rawDots = Number(body.dotCount)
    const dotCount = rawDots === 2 || rawDots === 3 || rawDots === 4 ? rawDots : 0

    // Reserve the slot before the (slow) render so concurrent calls are blocked too.
    lastRenderByIp.set(ip, now)

    const url = await renderAndUploadSocialCard(photoUrl, message, dotCount)

    return NextResponse.json({ success: true, url })
  } catch (error) {
    console.error('[card/render] Error:', error)
    return NextResponse.json(
      {
        error: 'Failed to render your card. Please try again.',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
