import { GetObjectCommand } from '@aws-sdk/client-s3'
import { LambdaClient } from '@aws-sdk/client-lambda'
import { createClient } from '@supabase/supabase-js'
import { parseBuffer } from 'music-metadata'
import { NextRequest, NextResponse } from 'next/server'
import {
  ClipPlanEntry,
  ReusedClipInput,
  clipPlanToOrderedKeys,
  invokeChildrenInParallelWithRetry,
  normalizeReusedClips,
  objectExists,
  writeJsonObject,
} from '@/lib/socialVideoOrchestration'
import { s3Client } from '@/lib/s3'

export const runtime = 'nodejs'
export const maxDuration = 60

const GENERATED_CLIP_DURATION_SECONDS = 8

interface ReusedClipRequest {
  key: string
  bucket?: string
  durationSeconds?: number
}

interface GeneratePoemVideoRequest {
  parentJobId?: string
  voiceKey?: string
  voiceDuration?: number
  keepAmbient?: boolean
  prompts?: string[] | string
  reusedClips?: ReusedClipRequest[]
}

interface PoemManifest {
  parentJobId: string
  voiceKey: string
  voiceDuration: number
  keepAmbient: boolean
  clipCount: number
  childJobIds: string[]
  prompts: string[]
  clips: ClipPlanEntry[]
  startedAt: string
}

const POEM_BUCKET = 'heartbeat-photos-prod'
const MAX_CLIP_COUNT = 8

const lambdaCredentials =
  process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
    ? {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      }
    : undefined

const lambdaClient = new LambdaClient({
  region: process.env.SCENIC_VIDEO_LAMBDA_REGION || 'us-east-2',
  credentials: lambdaCredentials,
})

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// Reads the actual container duration of an MP4 clip via music-metadata
// (already a dependency), avoiding the need for an ffprobe binary at runtime.
async function probeClipDurationSeconds(bucket: string, key: string): Promise<number> {
  try {
    const response = await s3Client.send(new GetObjectCommand({ Bucket: bucket, Key: key }))
    const bytes = await response.Body?.transformToByteArray()
    if (!bytes || bytes.length === 0) return 0
    const metadata = await parseBuffer(Buffer.from(bytes), { mimeType: 'video/mp4' })
    const duration = metadata.format.duration
    return typeof duration === 'number' && Number.isFinite(duration) && duration > 0 ? duration : 0
  } catch {
    return 0
  }
}

// Resolves the true duration of each reused clip: prefer the library's
// recorded duration_seconds, fall back to probing the file, then to the 8s
// Veo default. Returned array is aligned with the input order.
async function resolveReusedClipDurations(clips: ReusedClipInput[]): Promise<number[]> {
  if (clips.length === 0) return []

  const durations = new Array<number>(clips.length).fill(0)

  try {
    const { data } = await supabase
      .from('social_video_library')
      .select('s3_key, duration_seconds')
      .in(
        's3_key',
        clips.map((clip) => clip.key)
      )
    const byKey = new Map<string, number>()
    for (const row of (data || []) as Array<{ s3_key: string; duration_seconds: number | null }>) {
      const seconds = Number(row.duration_seconds)
      if (Number.isFinite(seconds) && seconds > 0) byKey.set(row.s3_key, seconds)
    }
    clips.forEach((clip, index) => {
      const fromLibrary = byKey.get(clip.key)
      if (fromLibrary) durations[index] = fromLibrary
    })
  } catch {
    // Library lookup is best-effort; probing below covers the remainder.
  }

  await Promise.all(
    clips.map(async (clip, index) => {
      if (durations[index] > 0) return
      durations[index] = await probeClipDurationSeconds(clip.bucket || POEM_BUCKET, clip.key)
    })
  )

  return durations.map((seconds) => (seconds > 0 ? seconds : GENERATED_CLIP_DURATION_SECONDS))
}

function resolvePrompts(input: string[] | string | undefined, clipCount: number): string[] | null {
  if (typeof input === 'string') {
    const prompt = input.trim()
    if (!prompt) return null
    return Array.from({ length: clipCount }, () => prompt)
  }

  if (!Array.isArray(input) || input.length === 0) {
    return null
  }

  const trimmed = input.map((value) => (typeof value === 'string' ? value.trim() : ''))
  if (trimmed.some((value) => value.length === 0)) {
    return null
  }

  return Array.from({ length: clipCount }, (_, index) => {
    const sourceIndex = Math.min(index, trimmed.length - 1)
    return trimmed[sourceIndex]
  })
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as GeneratePoemVideoRequest
    const parentJobId = body.parentJobId?.trim() || ''
    const voiceKey = body.voiceKey?.trim() || ''
    const voiceDuration = Number(body.voiceDuration)
    const keepAmbient = Boolean(body.keepAmbient)

    if (!parentJobId) {
      return NextResponse.json({ error: 'parentJobId is required' }, { status: 400 })
    }
    if (!voiceKey) {
      return NextResponse.json({ error: 'voiceKey is required' }, { status: 400 })
    }
    if (!Number.isFinite(voiceDuration) || voiceDuration <= 0) {
      return NextResponse.json({ error: 'voiceDuration must be a positive number' }, { status: 400 })
    }

    const clipCount = Math.max(1, Math.min(MAX_CLIP_COUNT, Math.ceil(voiceDuration / 8)))

    // Reused clips substitute for new generations: they fill clip slots so we
    // only generate enough fresh clips to cover the remaining voice duration.
    const reusedAll = normalizeReusedClips(body.reusedClips, POEM_BUCKET, MAX_CLIP_COUNT)
    if (!Array.isArray(reusedAll)) {
      return NextResponse.json({ error: reusedAll.error }, { status: 400 })
    }
    const reusedClips = reusedAll.slice(0, clipCount)
    const generatedCount = Math.max(0, clipCount - reusedClips.length)

    let promptsForClips: string[] = []
    if (generatedCount > 0) {
      const resolved = resolvePrompts(body.prompts, generatedCount)
      if (!resolved) {
        return NextResponse.json(
          { error: 'prompts must be a non-empty string or a non-empty string array' },
          { status: 400 }
        )
      }
      promptsForClips = resolved
    }

    // Verify reused clips actually exist before scheduling a mix.
    const reusedExists = await Promise.all(
      reusedClips.map((clip) => objectExists(s3Client, clip.bucket || POEM_BUCKET, clip.key))
    )
    const missingReused = reusedClips.filter((_, index) => !reusedExists[index])
    if (missingReused.length > 0) {
      return NextResponse.json(
        {
          error: 'One or more reused clips were not found in storage.',
          missing: missingReused.map((clip) => clip.key),
        },
        { status: 400 }
      )
    }

    const childJobIds = promptsForClips.map((_, index) => `${parentJobId}-c${index}`)
    const generateFunctionName = process.env.SCENIC_VIDEO_LAMBDA_NAME?.trim() || 'veo-generate'

    if (childJobIds.length > 0) {
      const failedIndices = await invokeChildrenInParallelWithRetry({
        lambdaClient,
        functionName: generateFunctionName,
        children: childJobIds,
        makePayload: (jobId, index) => ({
          jobId,
          prompt: promptsForClips[index],
          durationSeconds: 8,
          generateAudio: true,
        }),
      })
      if (failedIndices.length > 0) {
        return NextResponse.json(
          {
            error: 'Failed to enqueue one or more poem scenic clips.',
            failedIndices,
          },
          { status: 500 }
        )
      }
    }

    // Resolve true per-clip durations so the mixer crossfades land correctly
    // even when a reused clip is 4s/6s rather than the 8s Veo default.
    const reusedDurations = await resolveReusedClipDurations(reusedClips)

    // Ordered clip plan: newly generated clips first, then reused library clips.
    const clips: ClipPlanEntry[] = [
      ...childJobIds.map((childJobId, index) => ({
        type: 'generate' as const,
        childJobId,
        prompt: promptsForClips[index],
        durationSeconds: GENERATED_CLIP_DURATION_SECONDS,
      })),
      ...reusedClips.map((clip, index) => ({
        type: 'reuse' as const,
        key: clip.key,
        bucket: clip.bucket,
        durationSeconds: reusedDurations[index],
      })),
    ]

    const manifest: PoemManifest = {
      parentJobId,
      voiceKey,
      voiceDuration,
      keepAmbient,
      clipCount: clipPlanToOrderedKeys(clips).length,
      childJobIds,
      prompts: promptsForClips,
      clips,
      startedAt: new Date().toISOString(),
    }

    await writeJsonObject({
      s3Client,
      bucket: POEM_BUCKET,
      key: `poem-video/${parentJobId}/manifest.json`,
      value: manifest,
    })

    return NextResponse.json({ parentJobId, clipCount: manifest.clipCount })
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Failed to enqueue poem video generation.',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
