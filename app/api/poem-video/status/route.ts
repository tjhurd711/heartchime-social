import {
  GetObjectCommand,
} from '@aws-sdk/client-s3'
import { InvokeCommand, LambdaClient } from '@aws-sdk/client-lambda'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { NextRequest, NextResponse } from 'next/server'
import {
  hasTimedOut,
  invokeWithSentinel,
  objectExists,
  readChildErrorMarkers,
  readJsonObject,
  resolveFailedChildren,
} from '@/lib/socialVideoOrchestration'
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

export async function GET(request: NextRequest) {
  try {
    const parentJobId = request.nextUrl.searchParams.get('parentJobId')?.trim() || ''
    if (!parentJobId) {
      return NextResponse.json(
        { error: 'parentJobId query param is required' },
        { status: 400 }
      )
    }

    const manifestKey = `poem-video/${parentJobId}/manifest.json`
    const manifest = await readJsonObject<PoemManifest>(s3Client, POEM_BUCKET, manifestKey)
    if (!manifest) {
      return NextResponse.json({ status: 'pending' })
    }

    const childClipKeys = manifest.childJobIds.map(
      (childJobId) => `scenic-video/${childJobId}/clip-0.mp4`
    )
    const childMetadataKeys = manifest.childJobIds.map(
      (childJobId) => `scenic-video/${childJobId}/metadata.json`
    )

    const childDone = await Promise.all(
      childMetadataKeys.map((key) => objectExists(s3Client, POEM_BUCKET, key))
    )
    const childErrors = await readChildErrorMarkers({
      s3Client,
      bucket: POEM_BUCKET,
      childJobIds: manifest.childJobIds,
    })
    if (childErrors.length > 0) {
      return NextResponse.json({
        status: 'failed',
        failedChildren: childErrors.map((entry) => entry.childJobId),
        message: childErrors[0].error,
      })
    }
    const done = childDone.filter(Boolean).length
    const total = manifest.clipCount

    if (done < total) {
      if (hasTimedOut(manifest.startedAt)) {
        const failedChildren = resolveFailedChildren(manifest.childJobIds, childDone)
        if (failedChildren.length > 0) {
          return NextResponse.json({
            status: 'failed',
            failedChildren,
            message: 'Poem video generation timed out waiting for child clip metadata after 5 minutes.',
          })
        }
      }
      return NextResponse.json({ status: 'generating', done, total })
    }

    const finalKey = `poem-video/${parentJobId}/final.mp4`
    const finalExists = await objectExists(s3Client, POEM_BUCKET, finalKey)
    if (finalExists) {
      const url = await presignGetUrl(POEM_BUCKET, finalKey)
      return NextResponse.json({
        status: 'done',
        key: finalKey,
        url,
      })
    }

    const mixSentinelKey = `poem-video/${parentJobId}/mix-fired.json`
    const mixAlreadyFired = await objectExists(s3Client, POEM_BUCKET, mixSentinelKey)

    await invokeWithSentinel({
      s3Client,
      bucket: POEM_BUCKET,
      sentinelKey: mixSentinelKey,
      sentinelBody: {
        parentJobId,
        firedAt: new Date().toISOString(),
        clipCount: total,
      },
      alreadyFired: mixAlreadyFired,
      invoke: async () => {
        await lambdaClient.send(
          new InvokeCommand({
            FunctionName: process.env.POEM_MIX_LAMBDA_NAME?.trim() || 'poem-mix',
            InvocationType: 'Event',
            Payload: Buffer.from(
              JSON.stringify({
                parentJobId,
                clipKeys: childClipKeys,
                voiceKey: manifest.voiceKey,
                voiceDuration: manifest.voiceDuration,
                keepAmbient: manifest.keepAmbient,
                bucket: POEM_BUCKET,
              })
            ),
          })
        )
      },
    })

    return NextResponse.json({ status: 'mixing', done, total })
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Failed to check poem video status.',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
