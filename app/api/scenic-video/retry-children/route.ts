import { LambdaClient } from '@aws-sdk/client-lambda'
import { NextRequest, NextResponse } from 'next/server'
import { invokeChildrenInParallelWithRetry, readJsonObject } from '@/lib/socialVideoOrchestration'
import { s3Client } from '@/lib/s3'

export const runtime = 'nodejs'
export const maxDuration = 60

interface ScenicManifest {
  parentJobId: string
  prompt: string
  prompts?: string[]
  clipCount: number
  childJobIds: string[]
  startedAt: string
}

interface RetryScenicChildrenRequest {
  parentJobId?: string
  failedChildren?: string[]
}

const SCENIC_BUCKET = 'heartbeat-photos-prod'

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
    const body = (await request.json().catch(() => ({}))) as RetryScenicChildrenRequest
    const parentJobId = body.parentJobId?.trim() || ''
    const failedChildren = Array.isArray(body.failedChildren) ? body.failedChildren : []

    if (!parentJobId) {
      return NextResponse.json({ error: 'parentJobId is required' }, { status: 400 })
    }
    if (failedChildren.length === 0) {
      return NextResponse.json({ error: 'failedChildren must be a non-empty array' }, { status: 400 })
    }

    const manifestKey = `scenic-video/${parentJobId}/manifest.json`
    const manifest = await readJsonObject<ScenicManifest>(s3Client, SCENIC_BUCKET, manifestKey)
    if (!manifest) {
      return NextResponse.json({ error: 'Manifest not found for parent job.' }, { status: 404 })
    }

    const promptList =
      manifest.prompts && manifest.prompts.length > 0
        ? manifest.prompts
        : manifest.prompt
            .split('\n---\n')
            .map((item) => item.trim())
            .filter(Boolean)

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
        const prompt = promptList[Math.min(childIndex, promptList.length - 1)] || manifest.prompt
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
          error: 'Failed to retry one or more scenic child jobs.',
          failedChildren: stillFailedChildren,
        },
        { status: 500 }
      )
    }

    return NextResponse.json({ parentJobId, retriedChildren: failedChildren.length })
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Failed to retry scenic child jobs.',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
