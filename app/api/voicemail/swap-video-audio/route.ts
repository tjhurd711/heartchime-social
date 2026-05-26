import { InvokeCommand, LambdaClient } from '@aws-sdk/client-lambda'
import { NextRequest, NextResponse } from 'next/server'
import { getVoicemailBucketName, getVoicemailRegion, getVoicemailSignedReadUrl, getVoicemailS3Url, uploadVoicemailObject } from '@/lib/voicemailStorage'

export const runtime = 'nodejs'
export const maxDuration = 60

const SUPPORTED_VIDEO_CONTENT_TYPES = new Set([
  'video/mp4',
  'video/quicktime',
  'video/x-m4v',
])

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

function videoExtensionFromInput(contentType: string, fileName: string): string {
  const loweredContentType = contentType.toLowerCase().trim()
  if (loweredContentType === 'video/quicktime') return 'mov'
  if (loweredContentType === 'video/mp4' || loweredContentType === 'video/x-m4v') return 'mp4'

  const nameExt = fileName.split('.').pop()?.toLowerCase().trim()
  if (nameExt && /^[a-z0-9]+$/.test(nameExt)) {
    return nameExt
  }
  return 'mp4'
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const sourceVideo = formData.get('video')
    const providedAudioKey = formData.get('audioKey')?.toString().trim() || ''
    const providedAudioUrl = formData.get('audioUrl')?.toString().trim() || ''

    if (!(sourceVideo instanceof File)) {
      return NextResponse.json({ error: 'video file is required' }, { status: 400 })
    }

    const contentType = (sourceVideo.type || '').toLowerCase().trim()
    if (contentType && !SUPPORTED_VIDEO_CONTENT_TYPES.has(contentType)) {
      return NextResponse.json(
        { error: 'Unsupported video type. Allowed: mp4, mov, m4v.' },
        { status: 400 }
      )
    }

    if (!providedAudioKey && !providedAudioUrl) {
      return NextResponse.json({ error: 'audioKey or audioUrl is required' }, { status: 400 })
    }

    const functionName = process.env.VOICEMAIL_RENDER_LAMBDA_NAME?.trim()
    if (!functionName) {
      return NextResponse.json({ error: 'VOICEMAIL_RENDER_LAMBDA_NAME is not configured' }, { status: 500 })
    }

    const jobId = extractJobIdFromAudioKey(providedAudioKey || null) || crypto.randomUUID()
    const sourceVideoExtension = videoExtensionFromInput(contentType, sourceVideo.name || 'source-video.mp4')
    const sourceVideoKey = `voicemail-tester/${jobId}/source-video.${sourceVideoExtension}`
    const swappedVideoKey = `voicemail-tester/${jobId}/video.mp4`
    const metadataKey = `voicemail-tester/${jobId}/metadata.json`

    const sourceVideoBuffer = Buffer.from(await sourceVideo.arrayBuffer())
    await uploadVoicemailObject({
      key: sourceVideoKey,
      body: sourceVideoBuffer,
      contentType: contentType || 'video/mp4',
      cacheControl: 'max-age=31536000',
    })

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
