import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { s3Client } from '@/lib/s3'
import {
  isLocalClipFetchEnabled,
  runLocalCelebrityClipReplace,
} from '@/lib/localCelebrityClipFetch'

export const runtime = 'nodejs'
export const maxDuration = 300

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const DEFAULT_BUCKET = process.env.S3_BUCKET_NAME || 'heartbeat-photos-prod'

const YOUTUBE_VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/
const MAX_DOWNLOAD_DURATION = 120
const DEFAULT_DOWNLOAD_DURATION = 20

function normalizeManualVideoId(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const id = raw.trim()
  return YOUTUBE_VIDEO_ID_RE.test(id) ? id : null
}

/** Parse optional download window; empty/omitted → undefined (fetcher default: first 20s). */
function parseDownloadWindow(body: {
  downloadStart?: unknown
  downloadDuration?: unknown
}): { downloadStart?: number; downloadDuration?: number } | { error: string } {
  const hasStart = body.downloadStart !== undefined && body.downloadStart !== null && body.downloadStart !== ''
  const hasDuration =
    body.downloadDuration !== undefined &&
    body.downloadDuration !== null &&
    body.downloadDuration !== ''

  let downloadStart: number | undefined
  let downloadDuration: number | undefined

  if (hasStart) {
    const start = Number(body.downloadStart)
    if (!Number.isFinite(start) || start < 0) {
      return { error: 'downloadStart must be a number >= 0' }
    }
    downloadStart = start
  }

  if (hasDuration) {
    const duration = Number(body.downloadDuration)
    if (!Number.isFinite(duration) || duration < 1 || duration > MAX_DOWNLOAD_DURATION) {
      return {
        error: `downloadDuration must be between 1 and ${MAX_DOWNLOAD_DURATION} seconds`,
      }
    }
    downloadDuration = duration
  } else if (hasStart) {
    // Explicit start with no duration → default window length.
    downloadDuration = DEFAULT_DOWNLOAD_DURATION
  }

  return { downloadStart, downloadDuration }
}

export async function POST(request: NextRequest) {
  if (!isLocalClipFetchEnabled()) {
    return NextResponse.json(
      { error: 'Replace clip is only available in development (local fetch).' },
      { status: 403 }
    )
  }

  try {
    const body = (await request.json()) as {
      clipId?: string
      celebrityName?: string
      phase?: string
      excludeIds?: string[]
      queryIndex?: number
      candidatesOnly?: boolean
      pickVideoId?: string
      manualVideoId?: string
      maxCandidates?: number
      downloadStart?: number | string
      downloadDuration?: number | string
    }

    const clipId = body.clipId?.trim() || ''
    const celebrityName = body.celebrityName?.trim() || ''
    const phase = body.phase?.trim().toLowerCase() || ''
    const candidatesOnly = Boolean(body.candidatesOnly)
    const pickVideoId = body.pickVideoId?.trim() || undefined
    const manualVideoIdRaw = body.manualVideoId?.trim() || undefined
    const queryIndex = Number.isFinite(Number(body.queryIndex))
      ? Math.max(0, Math.floor(Number(body.queryIndex)))
      : 0
    const maxCandidates = Number.isFinite(Number(body.maxCandidates))
      ? Math.max(3, Math.min(15, Math.floor(Number(body.maxCandidates))))
      : 10

    const windowParsed = parseDownloadWindow(body)
    if ('error' in windowParsed) {
      return NextResponse.json({ error: windowParsed.error }, { status: 400 })
    }

    if (!clipId || !celebrityName) {
      return NextResponse.json(
        { error: 'clipId and celebrityName are required' },
        { status: 400 }
      )
    }

    if (phase !== 'intro' && phase !== 'clip') {
      return NextResponse.json({ error: 'phase must be intro or clip' }, { status: 400 })
    }

    let manualVideoId: string | undefined
    if (manualVideoIdRaw) {
      const normalized = normalizeManualVideoId(manualVideoIdRaw)
      if (!normalized) {
        return NextResponse.json(
          { error: 'manualVideoId must be an 11-character YouTube video ID [A-Za-z0-9_-]' },
          { status: 400 }
        )
      }
      manualVideoId = normalized
    }

    if (pickVideoId && !YOUTUBE_VIDEO_ID_RE.test(pickVideoId)) {
      return NextResponse.json(
        { error: 'pickVideoId must be an 11-character YouTube video ID [A-Za-z0-9_-]' },
        { status: 400 }
      )
    }

    const { data: targetClip, error: targetError } = await supabase
      .from('celebrity_videos')
      .select('*')
      .eq('id', clipId)
      .eq('celebrity_name', celebrityName)
      .maybeSingle()

    if (targetError) {
      return NextResponse.json({ error: targetError.message }, { status: 500 })
    }

    if (!targetClip) {
      return NextResponse.json({ error: 'Clip not found' }, { status: 404 })
    }

    const { data: existingRows, error: listError } = await supabase
      .from('celebrity_videos')
      .select('video_id')
      .eq('celebrity_name', celebrityName)

    if (listError) {
      return NextResponse.json({ error: listError.message }, { status: 500 })
    }

    const clientExclude = Array.isArray(body.excludeIds)
      ? body.excludeIds.map((id) => String(id || '').trim()).filter(Boolean)
      : []

    const excludeVideoIds = Array.from(
      new Set([
        ...clientExclude,
        ...(existingRows || [])
          .map((row) => String(row.video_id || '').trim())
          .filter(Boolean),
        String(targetClip.video_id || '').trim(),
      ].filter(Boolean))
    )

    const outcome = runLocalCelebrityClipReplace({
      celebrityName,
      phase: phase as 'intro' | 'clip',
      excludeVideoIds,
      replaceVideoId: String(targetClip.video_id),
      queryIndex,
      candidatesOnly,
      pickVideoId,
      manualVideoId,
      maxCandidates,
      downloadStart: windowParsed.downloadStart,
      downloadDuration: windowParsed.downloadDuration,
    })

    if (!outcome.ok) {
      return NextResponse.json(
        {
          error: outcome.error || 'Replace clip failed',
          cookiesPath: outcome.cookiesPath,
          result: outcome.result,
          queryIndex: outcome.result?.queryIndex ?? queryIndex,
          candidates: outcome.result?.candidates ?? [],
        },
        { status: 502 }
      )
    }

    if (candidatesOnly) {
      return NextResponse.json({
        celebrityName,
        replacedClipId: clipId,
        replacedVideoId: targetClip.video_id,
        candidates: outcome.result?.candidates ?? [],
        queryIndex: outcome.result?.queryIndex ?? queryIndex,
        querySuffix: outcome.result?.querySuffix ?? null,
        searchQuery: outcome.result?.searchQuery ?? null,
        result: outcome.result,
      })
    }

    const handlerClip = outcome.result?.clip as { video_id?: string } | undefined
    const newVideoId = handlerClip?.video_id
    if (!newVideoId) {
      return NextResponse.json({ error: 'Replace succeeded but no clip returned' }, { status: 502 })
    }

    const { data: newRow, error: newRowError } = await supabase
      .from('celebrity_videos')
      .select('*')
      .eq('video_id', newVideoId)
      .maybeSingle()

    if (newRowError || !newRow) {
      return NextResponse.json(
        {
          error: newRowError?.message || 'New clip row not found in Supabase',
          result: outcome.result,
        },
        { status: 502 }
      )
    }

    const bucket = newRow.bucket || DEFAULT_BUCKET
    const key = newRow.s3_key
    let previewUrl: string | null = null
    if (newRow.status === 'ready' && key) {
      previewUrl = await getSignedUrl(
        s3Client,
        new GetObjectCommand({ Bucket: bucket, Key: key }),
        { expiresIn: 60 * 60 }
      )
    }

    return NextResponse.json({
      celebrityName,
      replacedClipId: clipId,
      replacedVideoId: targetClip.video_id,
      clip: { ...newRow, previewUrl },
      candidates: outcome.result?.candidates ?? [],
      queryIndex: outcome.result?.queryIndex ?? queryIndex,
      querySuffix: outcome.result?.querySuffix ?? null,
      searchQuery: outcome.result?.searchQuery ?? null,
      result: outcome.result,
    })
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Replace clip failed',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
