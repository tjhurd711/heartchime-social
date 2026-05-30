import { InvokeCommand, LambdaClient } from '@aws-sdk/client-lambda'
import { NextRequest, NextResponse } from 'next/server'
import { getVoicemailRegion } from '@/lib/voicemailStorage'

export const runtime = 'nodejs'
export const maxDuration = 60

interface GenerateMemorialSlideshowRequest {
  photoKeys?: string[]
  secondsPerPhoto?: number
  photoRepeatCount?: number
  musicKey?: string
}

const lambdaCredentials =
  process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
    ? {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      }
    : undefined

const lambdaClient = new LambdaClient({
  region: getVoicemailRegion(),
  credentials: lambdaCredentials,
})

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as GenerateMemorialSlideshowRequest
    const rawPhotoKeys = Array.isArray(body.photoKeys) ? body.photoKeys : []
    const photoKeys = rawPhotoKeys
      .map((key) => (typeof key === 'string' ? key.trim() : ''))
      .filter((key) => key.length > 0)
    const parsedSecondsPerPhoto =
      body.secondsPerPhoto === undefined ? 2 : Number(body.secondsPerPhoto)
    const parsedPhotoRepeatCount =
      body.photoRepeatCount === undefined ? 1 : Number(body.photoRepeatCount)
    const musicKey = body.musicKey?.trim() || undefined

    if (photoKeys.length < 1 || photoKeys.length > 10) {
      return NextResponse.json(
        { error: 'photoKeys must include between 1 and 10 S3 keys' },
        { status: 400 }
      )
    }

    if (!Number.isFinite(parsedSecondsPerPhoto) || parsedSecondsPerPhoto <= 0) {
      return NextResponse.json(
        { error: 'secondsPerPhoto must be a positive number' },
        { status: 400 }
      )
    }

    if (
      !Number.isFinite(parsedPhotoRepeatCount) ||
      !Number.isInteger(parsedPhotoRepeatCount) ||
      parsedPhotoRepeatCount < 1 ||
      parsedPhotoRepeatCount > 3
    ) {
      return NextResponse.json(
        { error: 'photoRepeatCount must be an integer between 1 and 3' },
        { status: 400 }
      )
    }

    const expandedPhotoKeys = Array.from(
      { length: parsedPhotoRepeatCount },
      () => photoKeys
    ).flat()

    const jobId = crypto.randomUUID()
    const payload = {
      jobId,
      photo_keys: expandedPhotoKeys,
      seconds_per_photo: parsedSecondsPerPhoto,
      music_key: musicKey,
    }

    // Fire the render asynchronously ('Event') so we never hold the HTTP request
    // open for the full ffmpeg render. The render can take ~30s+, which collides
    // with the platform's request timeout and previously caused the browser to
    // receive a gateway error even though the video finished successfully.
    // The client polls /api/memorial-video/slideshow-status with this jobId
    // until the finished mp4 appears in S3.
    const command = new InvokeCommand({
      FunctionName: 'memorial-slideshow',
      InvocationType: 'Event',
      Payload: Buffer.from(JSON.stringify(payload)),
    })

    const invokeResult = await lambdaClient.send(command)
    const accepted =
      typeof invokeResult.StatusCode === 'number' &&
      invokeResult.StatusCode >= 200 &&
      invokeResult.StatusCode < 300

    if (!accepted) {
      return NextResponse.json(
        {
          error: 'Failed to start memorial slideshow render.',
          details: `Lambda invoke returned status ${invokeResult.StatusCode ?? 'unknown'}`,
        },
        { status: 502 }
      )
    }

    const estimatedDuration = expandedPhotoKeys.length * parsedSecondsPerPhoto

    return NextResponse.json(
      {
        jobId,
        status: 'processing',
        estimatedDuration,
      },
      { status: 202 }
    )
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Failed to generate memorial slideshow.',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
