import { LambdaClient } from '@aws-sdk/client-lambda'
import { NextRequest, NextResponse } from 'next/server'
import {
  ClipPlanEntry,
  clipPlanToOrderedKeys,
  invokeChildrenInParallelWithRetry,
  normalizeReusedClips,
  objectExists,
  writeJsonObject,
} from '@/lib/socialVideoOrchestration'
import { s3Client } from '@/lib/s3'

export const runtime = 'nodejs'
export const maxDuration = 60

interface ReusedClipRequest {
  key: string
  bucket?: string
  durationSeconds?: number
}

interface GenerateLongScenicVideoRequest {
  prompt?: string
  prompts?: string[]
  clipCount?: number
  includeGenerated?: boolean
  reusedClips?: ReusedClipRequest[]
}

interface ScenicManifest {
  parentJobId: string
  prompt: string
  prompts: string[]
  clipCount: number
  childJobIds: string[]
  clips: ClipPlanEntry[]
  startedAt: string
}

const SCENIC_BUCKET = 'heartbeat-photos-prod'
const DEFAULT_CLIP_COUNT = 2
const MIN_CLIP_COUNT = 1
const MAX_CLIP_COUNT = 4
const MAX_TOTAL_CLIPS = 8

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

function normalizeClipCount(value: unknown): number | null {
  if (value === undefined) return DEFAULT_CLIP_COUNT
  if (typeof value !== 'number' || !Number.isInteger(value)) return null
  if (value < MIN_CLIP_COUNT || value > MAX_CLIP_COUNT) return null
  return value
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as GenerateLongScenicVideoRequest
    const prompt = body.prompt?.trim() || ''
    const prompts = Array.isArray(body.prompts) ? body.prompts : []

    const reusedClips = normalizeReusedClips(body.reusedClips, SCENIC_BUCKET, MAX_TOTAL_CLIPS)
    if (!Array.isArray(reusedClips)) {
      return NextResponse.json({ error: reusedClips.error }, { status: 400 })
    }

    // Generate new clips unless the caller opts out (pure reuse). When no
    // prompt text is supplied at all but reused clips exist, default to reuse-only.
    const hasPromptText = Boolean(prompt) || prompts.some((item) => typeof item === 'string' && item.trim())
    const includeGenerated =
      body.includeGenerated === false ? false : reusedClips.length > 0 ? hasPromptText : true

    let promptsForClips: string[] = []
    if (includeGenerated) {
      const clipCount = normalizeClipCount(body.clipCount)
      if (clipCount === null) {
        return NextResponse.json(
          { error: `clipCount must be an integer between ${MIN_CLIP_COUNT} and ${MAX_CLIP_COUNT}` },
          { status: 400 }
        )
      }

      const trimmedPrompts = prompts
        .map((item) => (typeof item === 'string' ? item.trim() : ''))
        .filter((item) => item.length > 0)
      if (trimmedPrompts.length > 3) {
        return NextResponse.json(
          { error: 'prompts supports up to 3 unique scene prompts' },
          { status: 400 }
        )
      }

      promptsForClips = Array.from({ length: clipCount }, (_, index) => {
        if (trimmedPrompts.length > 0) return trimmedPrompts[index % trimmedPrompts.length]
        return prompt
      })

      const hasEmptyPrompt = promptsForClips.some((item) => !item || item.trim().length === 0)
      if (hasEmptyPrompt) {
        return NextResponse.json(
          { error: 'each clip prompt must be a non-empty string' },
          { status: 400 }
        )
      }
    }

    const totalClips = promptsForClips.length + reusedClips.length
    if (totalClips < 1) {
      return NextResponse.json(
        { error: 'Provide a scene prompt to generate or at least one reused clip.' },
        { status: 400 }
      )
    }
    if (totalClips > MAX_TOTAL_CLIPS) {
      return NextResponse.json(
        { error: `Total clips (generated + reused) must not exceed ${MAX_TOTAL_CLIPS}.` },
        { status: 400 }
      )
    }

    // Verify reused clips actually exist before scheduling a stitch.
    const reusedExists = await Promise.all(
      reusedClips.map((clip) => objectExists(s3Client, clip.bucket || SCENIC_BUCKET, clip.key))
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

    const parentJobId = crypto.randomUUID()
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
            error: 'Failed to enqueue one or more scenic clip generations.',
            failedIndices,
          },
          { status: 500 }
        )
      }
    }

    // Ordered clip plan: newly generated clips first, then reused library clips.
    const clips: ClipPlanEntry[] = [
      ...childJobIds.map((childJobId, index) => ({
        type: 'generate' as const,
        childJobId,
        prompt: promptsForClips[index],
      })),
      ...reusedClips.map((clip) => ({
        type: 'reuse' as const,
        key: clip.key,
        bucket: clip.bucket,
        durationSeconds: clip.durationSeconds,
      })),
    ]

    const manifest: ScenicManifest = {
      parentJobId,
      prompt: promptsForClips.join('\n---\n'),
      prompts: promptsForClips,
      clipCount: clipPlanToOrderedKeys(clips).length,
      childJobIds,
      clips,
      startedAt: new Date().toISOString(),
    }

    await writeJsonObject({
      s3Client,
      bucket: SCENIC_BUCKET,
      key: `scenic-video/${parentJobId}/manifest.json`,
      value: manifest,
    })

    return NextResponse.json({ parentJobId, clipCount: manifest.clipCount })
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Failed to enqueue long scenic video generation.',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
