import { NextRequest, NextResponse } from 'next/server'
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const maxDuration = 60

const TRIBUTE_REGION = 'us-east-2'
const TRIBUTE_BUCKET = 'heartbeat-photos-prod'
const VALID_STATUSES = new Set(['new', 'reviewing', 'in_progress', 'posted', 'declined'])
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const tributeS3Client = new S3Client({
  region: TRIBUTE_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
})

interface TributeRow {
  id: string
  loved_one_name: string
  relationship: string
  date_of_birth: string | null
  date_of_passing: string | null
  photo_s3_keys: string[]
  submitter_email: string
  submitter_name: string | null
  loved_things: string | null
  ways_honored: string | null
  things_missed: string | null
  specific_memory: string | null
  song: string | null
  other_details: string | null
  status: string
  posted_url: string | null
  reviewer_notes: string | null
  created_at: string
}

async function presignGetUrl(key: string): Promise<string> {
  return getSignedUrl(
    tributeS3Client,
    new GetObjectCommand({ Bucket: TRIBUTE_BUCKET, Key: key }),
    { expiresIn: 86400 }
  )
}

export async function GET(request: NextRequest) {
  try {
    const statusFilter = request.nextUrl.searchParams.get('status')

    let query = supabase
      .from('tributes')
      .select(
        'id, loved_one_name, relationship, date_of_birth, date_of_passing, photo_s3_keys, submitter_email, submitter_name, loved_things, ways_honored, things_missed, specific_memory, song, other_details, status, posted_url, reviewer_notes, created_at'
      )
      .order('created_at', { ascending: false })

    if (statusFilter && VALID_STATUSES.has(statusFilter)) {
      query = query.eq('status', statusFilter)
    }

    const { data, error } = await query

    if (error) {
      return NextResponse.json(
        { error: 'Failed to fetch tributes.', details: error.message },
        { status: 500 }
      )
    }

    const rows = (data || []) as TributeRow[]
    const items = await Promise.all(
      rows.map(async (row) => {
        const photos = await Promise.all(
          (row.photo_s3_keys || []).map(async (key) => {
            try {
              return { key, presignedUrl: await presignGetUrl(key) }
            } catch {
              return { key, presignedUrl: '' }
            }
          })
        )
        return { ...row, photos }
      })
    )

    return NextResponse.json({ items })
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Failed to fetch tributes.',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}

interface UpdateBody {
  id?: string
  status?: string
  reviewer_notes?: string | null
  posted_url?: string | null
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as UpdateBody
    const id = (body.id || '').trim()

    if (!UUID_REGEX.test(id)) {
      return NextResponse.json({ error: 'A valid tribute id is required' }, { status: 400 })
    }

    const updates: Record<string, unknown> = {}

    if (body.status !== undefined) {
      if (!VALID_STATUSES.has(body.status)) {
        return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
      }
      updates.status = body.status
    }

    if (body.reviewer_notes !== undefined) {
      const notes = typeof body.reviewer_notes === 'string' ? body.reviewer_notes.trim() : ''
      updates.reviewer_notes = notes === '' ? null : notes
    }

    if (body.posted_url !== undefined) {
      const url = typeof body.posted_url === 'string' ? body.posted_url.trim() : ''
      updates.posted_url = url === '' ? null : url
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No updatable fields provided' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('tributes')
      .update(updates)
      .eq('id', id)
      .select(
        'id, loved_one_name, relationship, date_of_birth, date_of_passing, photo_s3_keys, submitter_email, submitter_name, loved_things, ways_honored, things_missed, specific_memory, song, other_details, status, posted_url, reviewer_notes, created_at'
      )
      .single()

    if (error) {
      return NextResponse.json(
        { error: 'Failed to update tribute.', details: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({ item: data })
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Failed to update tribute.',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
