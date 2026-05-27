import { GetObjectCommand } from '@aws-sdk/client-s3'
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

interface ScenicManifest {
  parentJobId: string
  prompt: string
  clipCount: number
  childJobIds: string[]
  startedAt: string
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

    const manifestKey = `scenic-video/${parentJobId}/manifest.json`
    const manifest = await readJsonObject<ScenicManifest>(s3Client, SCENIC_BUCKET, manifestKey)
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
      childMetadataKeys.map((key) => objectExists(s3Client, SCENIC_BUCKET, key))
    )
    const childErrors = await readChildErrorMarkers({
      s3Client,
      bucket: SCENIC_BUCKET,
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
            message:
              'Long scenic generation timed out waiting for child clip metadata after 5 minutes.',
          })
        }
      }
      return NextResponse.json({ status: 'generating', done, total })
    }

    const finalKey = `scenic-video/${parentJobId}/final.mp4`
    const finalExists = await objectExists(s3Client, SCENIC_BUCKET, finalKey)
    if (finalExists) {
      const url = await presignGetUrl(SCENIC_BUCKET, finalKey)
      return NextResponse.json({
        status: 'done',
        key: finalKey,
        url,
      })
    }

    const stitchSentinelKey = `scenic-video/${parentJobId}/stitch-fired.json`
    const stitchAlreadyFired = await objectExists(s3Client, SCENIC_BUCKET, stitchSentinelKey)

    await invokeWithSentinel({
      s3Client,
      bucket: SCENIC_BUCKET,
      sentinelKey: stitchSentinelKey,
      sentinelBody: {
        parentJobId,
        firedAt: new Date().toISOString(),
        clipCount: total,
      },
      alreadyFired: stitchAlreadyFired,
      invoke: async () => {
        await lambdaClient.send(
          new InvokeCommand({
            FunctionName: process.env.SCENIC_STITCH_LAMBDA_NAME?.trim() || 'scenic-stitch',
            InvocationType: 'Event',
            Payload: Buffer.from(
              JSON.stringify({
                parentJobId,
                clipKeys: childClipKeys,
                bucket: SCENIC_BUCKET,
              })
            ),
          })
        )
      },
    })

    return NextResponse.json({ status: 'stitching', done, total })
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Failed to check long scenic video status.',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
