import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const RATE_LIMIT_WINDOW_MS = 60_000

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// Simple in-memory rate limit: 1 submission per IP per minute. Best-effort only —
// resets on cold start and is per-instance, which is acceptable for this form.
const lastSubmissionByIp = new Map<string, number>()

function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0].trim()
  return request.headers.get('x-real-ip')?.trim() || 'unknown'
}

interface SubmitBody {
  tributeId?: string
  loved_one_name?: string
  relationship?: string
  date_of_birth?: string | null
  date_of_passing?: string | null
  photo_s3_keys?: string[]
  submitter_email?: string
  submitter_name?: string | null
  loved_things?: string | null
  ways_honored?: string | null
  things_missed?: string | null
  specific_memory?: string | null
  song?: string | null
  other_details?: string | null
}

function cleanText(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

function cleanDate(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null
  // Accept YYYY-MM-DD only; anything else is stored as null to keep the date column clean.
  return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : null
}

export async function POST(request: NextRequest) {
  try {
    const ip = getClientIp(request)
    const now = Date.now()
    const last = lastSubmissionByIp.get(ip)
    if (last && now - last < RATE_LIMIT_WINDOW_MS) {
      return NextResponse.json(
        { error: 'Too many submissions. Please wait a moment and try again.' },
        { status: 429 }
      )
    }

    const body = (await request.json()) as SubmitBody

    const tributeId = (body.tributeId || '').trim()
    if (!UUID_REGEX.test(tributeId)) {
      return NextResponse.json({ error: 'tributeId must be a valid UUID' }, { status: 400 })
    }

    const lovedOneName = cleanText(body.loved_one_name)
    if (!lovedOneName) {
      return NextResponse.json({ error: "Loved one's name is required" }, { status: 400 })
    }

    const relationship = cleanText(body.relationship)
    if (!relationship) {
      return NextResponse.json({ error: 'Relationship is required' }, { status: 400 })
    }

    const submitterEmail = cleanText(body.submitter_email)
    if (!submitterEmail || !EMAIL_REGEX.test(submitterEmail)) {
      return NextResponse.json({ error: 'A valid submitter email is required' }, { status: 400 })
    }

    const photoKeys = Array.isArray(body.photo_s3_keys)
      ? body.photo_s3_keys
          .filter((k): k is string => typeof k === 'string' && k.trim() !== '')
          .map((k) => k.trim())
          .filter((k) => k.startsWith(`tributes/${tributeId}/`))
      : []

    if (photoKeys.length === 0) {
      return NextResponse.json({ error: 'At least one photo is required' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('tributes')
      .insert({
        id: tributeId,
        loved_one_name: lovedOneName,
        relationship,
        date_of_birth: cleanDate(body.date_of_birth),
        date_of_passing: cleanDate(body.date_of_passing),
        photo_s3_keys: photoKeys,
        submitter_email: submitterEmail,
        submitter_name: cleanText(body.submitter_name),
        loved_things: cleanText(body.loved_things),
        ways_honored: cleanText(body.ways_honored),
        things_missed: cleanText(body.things_missed),
        specific_memory: cleanText(body.specific_memory),
        song: cleanText(body.song),
        other_details: cleanText(body.other_details),
      })
      .select('id')
      .single()

    if (error) {
      return NextResponse.json(
        { error: 'Failed to save tribute.', details: error.message },
        { status: 500 }
      )
    }

    lastSubmissionByIp.set(ip, now)

    return NextResponse.json({ success: true, id: data.id })
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Failed to save tribute.',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
