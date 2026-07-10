import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { s3Client } from '@/lib/s3'

export const runtime = 'nodejs'

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const DEFAULT_BUCKET = process.env.S3_BUCKET_NAME || 'heartbeat-photos-prod'

type CelebrityVideoRow = {
  video_id: string
  phase: string
  created_at: string
  status: string
  bucket?: string | null
  s3_key?: string | null
  [key: string]: unknown
}

function dedupeLatestClips(rows: CelebrityVideoRow[]): CelebrityVideoRow[] {
  const byVideoId = new Map<string, CelebrityVideoRow>()
  for (const row of rows) {
    const existing = byVideoId.get(row.video_id)
    if (!existing || new Date(row.created_at).getTime() > new Date(existing.created_at).getTime()) {
      byVideoId.set(row.video_id, row)
    }
  }
  return Array.from(byVideoId.values()).sort((a, b) => {
    if (a.phase === 'intro' && b.phase !== 'intro') return -1
    if (b.phase === 'intro' && a.phase !== 'intro') return 1
    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  })
}

export async function GET(request: NextRequest) {
  try {
    const celebrityName = request.nextUrl.searchParams.get('celebrityName')?.trim() || ''
    const listNames = request.nextUrl.searchParams.get('listNames') === 'true'

    if (listNames) {
      const { data, error } = await supabase
        .from('celebrity_videos')
        .select('celebrity_name, created_at')
        .order('created_at', { ascending: false })
        .limit(500)

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }

      const names = Array.from(
        new Set((data || []).map((row) => String(row.celebrity_name || '').trim()).filter(Boolean))
      )

      return NextResponse.json({ names })
    }

    if (!celebrityName) {
      return NextResponse.json({ error: 'celebrityName is required' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('celebrity_videos')
      .select('*')
      .eq('celebrity_name', celebrityName)
      .neq('status', 'removed')
      .order('created_at', { ascending: false })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const deduped = dedupeLatestClips(data || [])
    const clips = await Promise.all(
      deduped.map(async (row) => {
        const bucket = row.bucket || DEFAULT_BUCKET
        const key = row.s3_key
        let previewUrl: string | null = null
        if (row.status === 'ready' && key) {
          previewUrl = await getSignedUrl(
            s3Client,
            new GetObjectCommand({ Bucket: bucket, Key: key }),
            { expiresIn: 60 * 60 }
          )
        }
        return { ...row, previewUrl }
      })
    )

    const readyCount = clips.filter((clip) => clip.status === 'ready').length

    return NextResponse.json({
      celebrityName,
      clips,
      readyCount,
      selectedCount: clips.length,
    })
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Failed to load celebrity videos',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
