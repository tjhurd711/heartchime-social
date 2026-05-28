import { GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { s3Client } from '@/lib/s3'

export const runtime = 'nodejs'
export const maxDuration = 60

type SharedVideoSource = 'scenic-clip' | 'scenic-final' | 'poem-clip' | 'poem-final'

interface SocialVideoLibraryRow {
  id: string
  source: SharedVideoSource
  job_id: string
  parent_job_id: string | null
  clip_count: number
  duration_seconds: number
  s3_key: string
  bucket: string
  prompt: string | null
  memory_thought: string | null
  created_at: string
}

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

export async function GET() {
  try {
    const { data, error } = await supabase
      .from('social_video_library')
      .select(
        'id, source, job_id, parent_job_id, clip_count, duration_seconds, s3_key, bucket, prompt, memory_thought, created_at'
      )
      .eq('source', 'scenic-clip')
      .order('created_at', { ascending: false })
      .limit(200)

    if (error) {
      return NextResponse.json(
        { error: 'Failed to fetch social video library.', details: error.message },
        { status: 500 }
      )
    }

    const rows = (data || []) as SocialVideoLibraryRow[]
    const items = await Promise.all(
      rows.map(async (row) => {
        const url = await presignGetUrl(row.bucket, row.s3_key)
        return {
          id: row.id,
          source: row.source,
          jobId: row.job_id,
          parentJobId: row.parent_job_id || undefined,
          clipCount: row.clip_count,
          durationSeconds: row.duration_seconds,
          key: row.s3_key,
          bucket: row.bucket,
          prompt: row.prompt || '',
          memoryThought: row.memory_thought || '',
          createdAt: row.created_at,
          savedAtIso: row.created_at,
          url,
        }
      })
    )

    return NextResponse.json({ items })
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Failed to fetch social video library.',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
