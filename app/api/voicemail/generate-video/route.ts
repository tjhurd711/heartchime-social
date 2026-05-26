import { InvokeCommand, LambdaClient } from '@aws-sdk/client-lambda'
import { NextRequest, NextResponse } from 'next/server'
import { getVoicemailBucketName, getVoicemailRegion, getVoicemailS3Url } from '@/lib/voicemailStorage'

export const runtime = 'nodejs'
export const maxDuration = 60

interface GenerateVoicemailVideoRequest {
  contactName?: string
  emoji?: string
  metadataLine?: string
  topLabel?: string
  transcriptText?: string
  theme?: 'ios_voicemail' | 'classic_dark' | 'soft_blur' | 'minimal_black'
  script?: string
  voiceId?: string
  profileImageDataUrl?: string | null
  profileImageUrl?: string | null
  audioUrl?: string
  audioKey?: string
  audioBase64?: string
  audioMimeType?: string
  durationSeconds?: number
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

function extractJobIdFromAudioKey(audioKey: string | null): string | null {
  if (!audioKey) return null
  const match = audioKey.match(/^voicemail-tester\/([^/]+)\/audio\./)
  return match?.[1] || null
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as GenerateVoicemailVideoRequest
    const contactName = body.contactName?.trim() || 'Mom'
    const emoji = body.emoji?.trim() || ''
    const metadataLine = body.metadataLine?.trim() || 'home - Oct 15, 2025 at 7:16 PM'
    const topLabel = body.topLabel?.trim() || 'Voicemail'
    const transcriptText = body.transcriptText?.trim() || 'Transcript (low confidence)'
    const theme = body.theme || 'ios_voicemail'
    const script = body.script?.trim() || ''
    const voiceId = body.voiceId?.trim() || ''
    const audioKey = body.audioKey?.trim() || ''
    const audioUrl = body.audioUrl?.trim() || (audioKey ? getVoicemailS3Url(audioKey) : '')
    const audioBase64 = body.audioBase64?.trim() || ''
    const audioMimeType = body.audioMimeType?.trim() || 'audio/mpeg'
    const durationSeconds = Number(body.durationSeconds)

    if (!audioUrl && !audioBase64) {
      return NextResponse.json({ error: 'audioUrl/audioKey or audioBase64 is required' }, { status: 400 })
    }

    if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
      return NextResponse.json({ error: 'durationSeconds must be a positive number' }, { status: 400 })
    }

    const jobId = extractJobIdFromAudioKey(audioKey || null) || crypto.randomUUID()
    const jobPrefix = `voicemail-tester/${jobId}`
    const videoKey = `${jobPrefix}/video.mp4`
    const metadataKey = `${jobPrefix}/metadata.json`

    const profileDataInput = body.profileImageDataUrl?.trim() || ''
    const profileUrlInput = body.profileImageUrl?.trim() || ''
    const profileImageDataUrl = profileDataInput.startsWith('data:image/') ? profileDataInput : undefined
    const profileImageUrl =
      profileUrlInput && /^https?:\/\//i.test(profileUrlInput)
        ? profileUrlInput
        : /^https?:\/\//i.test(profileDataInput)
          ? profileDataInput
          : undefined

    const functionName = process.env.VOICEMAIL_RENDER_LAMBDA_NAME?.trim()
    if (!functionName) {
      return NextResponse.json({ error: 'VOICEMAIL_RENDER_LAMBDA_NAME is not configured' }, { status: 500 })
    }

    const payload = {
      contactName,
      emoji,
      metadataLine,
      topLabel,
      transcriptText,
      theme,
      script,
      voiceId,
      audioKey: audioKey || undefined,
      audioUrl: audioUrl || undefined,
      audioBase64: audioBase64 || undefined,
      audioMimeType,
      durationSeconds,
      profileImageUrl,
      profileImageDataUrl,
      bucket: getVoicemailBucketName(),
      region: getVoicemailRegion(),
      jobId,
      videoKey,
      metadataKey,
    }

    const command = new InvokeCommand({
      FunctionName: functionName,
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
      return NextResponse.json({ error: 'Failed to render voicemail video.', details: detail }, { status: 500 })
    }

    const normalizedPayload =
      lambdaPayload && typeof lambdaPayload === 'object' && 'body' in lambdaPayload && typeof lambdaPayload.body === 'string'
        ? JSON.parse(lambdaPayload.body)
        : lambdaPayload

    const resolvedVideoKey = normalizedPayload?.videoKey || videoKey
    const resolvedDurationSeconds = Number(normalizedPayload?.durationSeconds ?? durationSeconds)
    const resolvedJobId = normalizedPayload?.jobId || jobId
    const videoUrl = normalizedPayload?.videoUrl || getVoicemailS3Url(resolvedVideoKey)

    return NextResponse.json({
      videoUrl,
      videoKey: resolvedVideoKey,
      durationSeconds: resolvedDurationSeconds,
      jobId: resolvedJobId,
    })
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Failed to render voicemail video.',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
