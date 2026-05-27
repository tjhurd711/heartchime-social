import { LambdaClient } from '@aws-sdk/client-lambda'
import { NextRequest, NextResponse } from 'next/server'
import { invokeChildrenInParallelWithRetry, writeJsonObject } from '@/lib/socialVideoOrchestration'
import { s3Client } from '@/lib/s3'

export const runtime = 'nodejs'
export const maxDuration = 60

interface GeneratePoemVideoRequest {
  parentJobId?: string
  voiceKey?: string
  voiceDuration?: number
  keepAmbient?: boolean
  prompts?: string[] | string
}

interface PoemManifest {
  parentJobId: string
  voiceKey: string
  voiceDuration: number
  keepAmbient: boolean
  clipCount: number
  childJobIds: string[]
  prompts: string[]
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
    const promptsForClips = resolvePrompts(body.prompts, clipCount)
    if (!promptsForClips) {
      return NextResponse.json(
        { error: 'prompts must be a non-empty string or a non-empty string array' },
        { status: 400 }
      )
    }

    const childJobIds = Array.from({ length: clipCount }, (_, index) => `${parentJobId}-c${index}`)
    const generateFunctionName = process.env.SCENIC_VIDEO_LAMBDA_NAME?.trim() || 'veo-generate'

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

    const manifest: PoemManifest = {
      parentJobId,
      voiceKey,
      voiceDuration,
      keepAmbient,
      clipCount,
      childJobIds,
      prompts: promptsForClips,
      startedAt: new Date().toISOString(),
    }

    await writeJsonObject({
      s3Client,
      bucket: POEM_BUCKET,
      key: `poem-video/${parentJobId}/manifest.json`,
      value: manifest,
    })

    return NextResponse.json({ parentJobId, clipCount })
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
