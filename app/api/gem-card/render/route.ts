import { NextRequest, NextResponse } from 'next/server'
import { renderAndUploadGemCard } from '@/lib/gemCardRenderer'

export const runtime = 'nodejs'
// Puppeteer rendering can take a while; allow generous headroom.
export const maxDuration = 60

const CARD_BUCKET = process.env.AWS_S3_BUCKET || 'heartbeat-photos-prod'
const MAX_CONTEXT_LENGTH = 200
const MAX_HANDLE_LENGTH = 40
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
  context?: string
  creatorHandle?: string
}

// Only allow photos we issued an upload URL for (our own bucket), to avoid being
// used as a generic image proxy/renderer for arbitrary remote URLs. Gem cards
// reuse the same social-cards/uploads/* image upload path as HeartChime cards.
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

// Normalize a creator handle to "@name" (or empty when not provided).
function normalizeHandle(raw: string): string {
  const trimmed = raw.trim().replace(/^@+/, '')
  return trimmed ? `@${trimmed}` : ''
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

    const context = (body.context || '').trim()
    if (!context) {
      return NextResponse.json({ error: 'Please enter a context line for your gem.' }, { status: 400 })
    }
    if (context.length > MAX_CONTEXT_LENGTH) {
      return NextResponse.json(
        { error: `Context is too long (max ${MAX_CONTEXT_LENGTH} characters).` },
        { status: 400 }
      )
    }

    const creatorHandle = normalizeHandle(body.creatorHandle || '')
    if (creatorHandle.length > MAX_HANDLE_LENGTH + 1) {
      return NextResponse.json(
        { error: `Handle is too long (max ${MAX_HANDLE_LENGTH} characters).` },
        { status: 400 }
      )
    }

    const photoUrl = resolvePhotoUrl(body)
    if (!photoUrl) {
      return NextResponse.json(
        { error: 'A valid uploaded image is required.' },
        { status: 400 }
      )
    }

    // Reserve the slot before the (slow) render so concurrent calls are blocked too.
    lastRenderByIp.set(ip, now)

    const url = await renderAndUploadGemCard(photoUrl, context, creatorHandle)

    return NextResponse.json({ success: true, url })
  } catch (error) {
    console.error('[gem-card/render] Error:', error)
    return NextResponse.json(
      {
        error: 'Failed to render your card. Please try again.',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
