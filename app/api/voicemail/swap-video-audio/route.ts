import { InvokeCommand, LambdaClient } from '@aws-sdk/client-lambda'
import { NextRequest, NextResponse } from 'next/server'
import { getVoicemailBucketName, getVoicemailRegion, getVoicemailSignedReadUrl, getVoicemailS3Url } from '@/lib/voicemailStorage'

export const runtime = 'nodejs'
export const maxDuration = 60

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

function extractJobIdFromAudioKey(audioKey: string | null): string | null {
  if (!audioKey) return null
  const match = audioKey.match(/^voicemail-tester\/([^/]+)\/audio\./)
  return match?.[1] || null
}

interface SwapVideoAudioRequest {
  sourceVideoKey?: string
  audioKey?: string
  audioUrl?: string
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as SwapVideoAudioRequest
    const sourceVideoKey = body.sourceVideoKey?.trim() || ''
    const providedAudioKey = body.audioKey?.trim() || ''
    const providedAudioUrl = body.audioUrl?.trim() || ''

    if (!sourceVideoKey) {
      return NextResponse.json({ error: 'sourceVideoKey is required' }, { status: 400 })
    }
    if (!/^voicemail-tester\/[^/]+\/source-video\./.test(sourceVideoKey)) {
      return NextResponse.json({ error: 'sourceVideoKey must be a voicemail source-video key' }, { status: 400 })
    }

    if (!providedAudioKey && !providedAudioUrl) {
      return NextResponse.json({ error: 'audioKey or audioUrl is required' }, { status: 400 })
    }

    const functionName = process.env.VOICEMAIL_RENDER_LAMBDA_NAME?.trim()
    if (!functionName) {
      return NextResponse.json({ error: 'VOICEMAIL_RENDER_LAMBDA_NAME is not configured' }, { status: 500 })
    }

    const sourceVideoJobMatch = sourceVideoKey.match(/^voicemail-tester\/([^/]+)\/source-video\./)
    const jobId = sourceVideoJobMatch?.[1] || extractJobIdFromAudioKey(providedAudioKey || null) || crypto.randomUUID()
    const swappedVideoKey = `voicemail-tester/${jobId}/video.mp4`
    const metadataKey = `voicemail-tester/${jobId}/metadata.json`

    const payload = {
      action: 'audio_swap',
      bucket: getVoicemailBucketName(),
      region: getVoicemailRegion(),
      jobId,
      audioKey: providedAudioKey || undefined,
      audioUrl: providedAudioUrl || (providedAudioKey ? getVoicemailS3Url(providedAudioKey) : undefined),
      sourceVideoKey,
      sourceVideoUrl: getVoicemailS3Url(sourceVideoKey),
      videoKey: swappedVideoKey,
      metadataKey,
    }

    const command = new InvokeCommand({
      FunctionName: functionName,
      InvocationType: 'RequestResponse',
      Payload: Buffer.from(JSON.stringify(payload)),
    })

    const invokeResult = await lambdaClient.send(command)
    const lambdaPayloadRaw = invokeResult.Payload ? new TextDecoder().decode(invokeResult.Payload) : '{}'
    const lambdaPayload = lambdaPayloadRaw ? JSON.parse(lambdaPayloadRaw) : {}

    if (invokeResult.FunctionError) {
      const detail =
        lambdaPayload?.errorMessage ||
        lambdaPayload?.errorType ||
        lambdaPayload?.body ||
        'Lambda invocation failed'
      return NextResponse.json({ error: 'Failed to swap voicemail video audio.', details: detail }, { status: 500 })
    }

    const normalizedPayload =
      lambdaPayload && typeof lambdaPayload === 'object' && 'body' in lambdaPayload && typeof lambdaPayload.body === 'string'
        ? JSON.parse(lambdaPayload.body)
        : lambdaPayload

    const resolvedVideoKey = normalizedPayload?.videoKey || swappedVideoKey
    const resolvedJobId = normalizedPayload?.jobId || jobId
    const videoUrl = await getVoicemailSignedReadUrl(resolvedVideoKey, 60 * 60)

    return NextResponse.json({
      videoUrl,
      videoKey: resolvedVideoKey,
      sourceVideoKey,
      audioKey: providedAudioKey || null,
      jobId: resolvedJobId,
    })
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Failed to swap voicemail video audio.',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
