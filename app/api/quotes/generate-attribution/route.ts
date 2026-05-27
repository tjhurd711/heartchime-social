import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

export const runtime = 'nodejs'
export const maxDuration = 30

type AttributionFormat = 'book_page' | 'highlighted_book' | 'tweet'

interface AttributionRequest {
  quote?: string
  format?: AttributionFormat
}

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || '',
})

function normalizeFormat(value: unknown): AttributionFormat {
  if (value === 'tweet') return 'tweet'
  if (value === 'highlighted_book') return 'highlighted_book'
  return 'book_page'
}

function parseJsonObject(raw: string): Record<string, unknown> | null {
  const trimmed = raw.trim()
  const cleaned = trimmed.startsWith('```')
    ? trimmed.replace(/^```(?:json|JSON)?\s*/, '').replace(/\s*```$/, '').trim()
    : trimmed

  try {
    const parsed = JSON.parse(cleaned)
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null
  } catch {
    const objectMatch = cleaned.match(/\{[\s\S]*\}/)
    if (!objectMatch) return null
    try {
      const parsed = JSON.parse(objectMatch[0])
      return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null
    } catch {
      return null
    }
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as AttributionRequest
    const quote = body.quote?.trim() || ''
    const format = normalizeFormat(body.format)

    if (!quote) {
      return NextResponse.json({ error: 'quote is required' }, { status: 400 })
    }
    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json(
        { error: 'Attribution generator is not configured. Set ANTHROPIC_API_KEY.' },
        { status: 503 }
      )
    }

    const instruction =
      format === 'tweet'
        ? `Invent a fictional social profile attribution for this quote.\nReturn JSON only:\n{"displayName":"...","handle":"@...","attribution":"Display Name (@handle)"}` :
          `Invent a fictional book attribution for this quote.\nReturn JSON only:\n{"title":"...","author":"...","attribution":"Title, Author"}`

    const prompt = `Quote:\n"${quote}"\n\n${instruction}

Critical constraints:
- NEVER use real authors, real public figures, real celebrities, or real existing social handles.
- Names, titles, and handles must be invented and plausible but clearly fictional.
- Keep attribution concise and natural.
- Return ONLY valid JSON with the requested keys, no markdown.`

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 250,
      temperature: 0.8,
      messages: [{ role: 'user', content: prompt }],
    })

    const text = response.content.find((chunk) => chunk.type === 'text')
    if (!text || text.type !== 'text') {
      return NextResponse.json({ error: 'No attribution text returned from model.' }, { status: 502 })
    }

    const parsed = parseJsonObject(text.text)
    if (!parsed) {
      return NextResponse.json(
        { error: 'Failed to parse attribution generator response.' },
        { status: 502 }
      )
    }

    if (format === 'tweet') {
      const displayName = String(parsed.displayName || '').trim()
      const rawHandle = String(parsed.handle || '').trim()
      const handle = rawHandle.startsWith('@') ? rawHandle : `@${rawHandle.replace(/^@+/, '')}`
      const attribution = String(parsed.attribution || `${displayName} (${handle})`).trim()
      if (!displayName || !handle || !attribution) {
        return NextResponse.json({ error: 'Attribution generation returned incomplete tweet fields.' }, { status: 502 })
      }
      return NextResponse.json({ format, displayName, handle, attribution })
    }

    const title = String(parsed.title || '').trim()
    const author = String(parsed.author || '').trim()
    const attribution = String(parsed.attribution || `${title}, ${author}`).trim()
    if (!title || !author || !attribution) {
      return NextResponse.json({ error: 'Attribution generation returned incomplete book fields.' }, { status: 502 })
    }
    return NextResponse.json({ format, title, author, attribution })
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Failed to generate attribution',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
