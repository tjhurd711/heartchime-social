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

    const expandedPhotoKeys = photoKeys.flatMap((key) =>
      Array.from({ length: parsedPhotoRepeatCount }, () => key)
    )

    const jobId = crypto.randomUUID()
    const payload = {
      jobId,
      photo_keys: expandedPhotoKeys,
      seconds_per_photo: parsedSecondsPerPhoto,
      music_key: musicKey,
    }

    const command = new InvokeCommand({
      FunctionName: 'memorial-slideshow',
      InvocationType: 'RequestResponse',
      Payload: Buffer.from(JSON.stringify(payload)),
    })

    const invokeResult = await lambdaClient.send(command)
    const lambdaPayloadRaw = invokeResult.Payload
      ? new TextDecoder().decode(invokeResult.Payload)
      : '{}'
    const lambdaPayload = lambdaPayloadRaw ? JSON.parse(lambdaPayloadRaw) : {}

    if (invokeResult.FunctionError) {
      const detail =
        lambdaPayload?.errorMessage ||
        lambdaPayload?.errorType ||
        lambdaPayload?.body ||
        'Lambda invocation failed'
      return NextResponse.json(
        { error: 'Failed to generate memorial slideshow.', details: detail },
        { status: 500 }
      )
    }

    const normalizedPayload =
      lambdaPayload &&
      typeof lambdaPayload === 'object' &&
      'body' in lambdaPayload &&
      typeof lambdaPayload.body === 'string'
        ? JSON.parse(lambdaPayload.body)
        : lambdaPayload

    const url = normalizedPayload?.url
    const key = normalizedPayload?.key
    const resolvedJobId = normalizedPayload?.jobId || jobId
    const duration = Number(normalizedPayload?.duration ?? 0)

    if (!url || !key) {
      return NextResponse.json(
        { error: 'Memorial slideshow Lambda returned an invalid response.' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      url,
      key,
      jobId: resolvedJobId,
      duration,
    })
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
