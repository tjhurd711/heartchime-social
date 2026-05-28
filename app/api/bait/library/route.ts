import { GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { s3Client } from '@/lib/s3'

export const runtime = 'nodejs'
export const maxDuration = 60

interface BaitLibraryRow {
  id: string
  handle: string
  tiktok_url: string | null
  s3_key: string
  media_type: string
  used: boolean
  created_at: string
  posted_tiktok: boolean | null
  posted_instagram: boolean | null
  posted_facebook: boolean | null
  posted_at: string | null
  posted_url: string | null
  notes: string | null
}

const BAIT_BUCKET = 'heartbeat-photos-prod'

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

async function presignGetUrl(bucket: string, key: string): Promise<string> {
  return getSignedUrl(
    s3Client,
    new GetObjectCommand({
      Bucket: bucket,
      Key: key,
    }),
    { expiresIn: 86400 }
  )
}

function isAccessDenied(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const maybeError = error as { name?: string; message?: string }
  const message = `${maybeError.name || ''} ${maybeError.message || ''}`.toLowerCase()
  return message.includes('accessdenied') || message.includes('access denied')
}

export async function GET() {
  try {
    const { data, error } = await supabase
      .from('bait_library')
      .select(
        'id, handle, tiktok_url, s3_key, media_type, used, created_at, posted_tiktok, posted_instagram, posted_facebook, posted_at, posted_url, notes'
      )
      .order('created_at', { ascending: false })

    if (error) {
      return NextResponse.json(
        { error: 'Failed to fetch bait library.', details: error.message },
        { status: 500 }
      )
    }

    const rows = (data || []) as BaitLibraryRow[]
    const items = await Promise.all(
      rows.map(async (row) => {
        try {
          const presignedUrl = await presignGetUrl(BAIT_BUCKET, row.s3_key)
          return { ...row, presignedUrl }
        } catch (presignError) {
          if (isAccessDenied(presignError)) {
            throw new Error(
              `S3 AccessDenied while presigning ${row.s3_key}. Ensure principal rekognition-user has s3:GetObject on social-bait/* in bucket ${BAIT_BUCKET}.`
            )
          }
          throw presignError
        }
      })
    )

    return NextResponse.json({ items })
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Failed to fetch bait library.',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
