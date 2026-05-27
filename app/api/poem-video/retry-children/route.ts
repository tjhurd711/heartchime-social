import { LambdaClient } from '@aws-sdk/client-lambda'
import { NextRequest, NextResponse } from 'next/server'
import { invokeChildrenInParallelWithRetry, readJsonObject } from '@/lib/socialVideoOrchestration'
import { s3Client } from '@/lib/s3'

export const runtime = 'nodejs'
export const maxDuration = 60

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

interface RetryPoemChildrenRequest {
  parentJobId?: string
  failedChildren?: string[]
}

const POEM_BUCKET = 'heartbeat-photos-prod'

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

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as RetryPoemChildrenRequest
    const parentJobId = body.parentJobId?.trim() || ''
    const failedChildren = Array.isArray(body.failedChildren) ? body.failedChildren : []

    if (!parentJobId) {
      return NextResponse.json({ error: 'parentJobId is required' }, { status: 400 })
    }
    if (failedChildren.length === 0) {
      return NextResponse.json({ error: 'failedChildren must be a non-empty array' }, { status: 400 })
    }

    const manifestKey = `poem-video/${parentJobId}/manifest.json`
    const manifest = await readJsonObject<PoemManifest>(s3Client, POEM_BUCKET, manifestKey)
    if (!manifest) {
      return NextResponse.json({ error: 'Manifest not found for parent job.' }, { status: 404 })
    }

    const invalidChild = failedChildren.find((child) => !manifest.childJobIds.includes(child))
    if (invalidChild) {
      return NextResponse.json(
        { error: `Child job ID does not belong to manifest: ${invalidChild}` },
        { status: 400 }
      )
    }

    const generateFunctionName = process.env.SCENIC_VIDEO_LAMBDA_NAME?.trim() || 'veo-generate'

    const failedIndices = await invokeChildrenInParallelWithRetry({
      lambdaClient,
      functionName: generateFunctionName,
      children: failedChildren,
      makePayload: (childJobId) => {
        const childIndex = manifest.childJobIds.indexOf(childJobId)
        const prompt = manifest.prompts[Math.min(childIndex, manifest.prompts.length - 1)]
        return {
          jobId: childJobId,
          prompt,
          durationSeconds: 8,
          generateAudio: true,
        }
      },
    })
    const stillFailedChildren = failedIndices.map((index) => failedChildren[index])

    if (stillFailedChildren.length > 0) {
      return NextResponse.json(
        {
          error: 'Failed to retry one or more poem child jobs.',
          failedChildren: stillFailedChildren,
        },
        { status: 500 }
      )
    }

    return NextResponse.json({ parentJobId, retriedChildren: failedChildren.length })
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Failed to retry poem child jobs.',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
