import { NextRequest, NextResponse } from 'next/server'
import { getVoicemailS3Url, getVoicemailSignedPutUrl } from '@/lib/voicemailStorage'

interface UploadSourceVideoRequest {
  fileName?: string
  contentType?: string
  jobId?: string
}

const SUPPORTED_VIDEO_CONTENT_TYPES = new Set([
  'video/mp4',
  'video/quicktime',
  'video/x-m4v',
])

function sourceVideoExtensionFromInput(contentType: string, fileName: string): string {
  const loweredContentType = contentType.toLowerCase().trim()
  if (loweredContentType === 'video/quicktime') return 'mov'
  if (loweredContentType === 'video/mp4' || loweredContentType === 'video/x-m4v') return 'mp4'

  const ext = fileName.split('.').pop()?.toLowerCase().trim()
  if (ext && /^[a-z0-9]+$/.test(ext)) {
    return ext
  }
  return 'mp4'
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as UploadSourceVideoRequest
    const fileName = body.fileName?.trim() || 'source-video.mp4'
    const contentType = body.contentType?.trim().toLowerCase() || ''
    const providedJobId = body.jobId?.trim() || ''

    if (!contentType || !SUPPORTED_VIDEO_CONTENT_TYPES.has(contentType)) {
      return NextResponse.json(
        { error: 'Unsupported video type. Allowed: video/mp4, video/quicktime, video/x-m4v.' },
        { status: 400 }
      )
    }

    const jobId = providedJobId || crypto.randomUUID()
    const extension = sourceVideoExtensionFromInput(contentType, fileName)
    const sourceVideoKey = `voicemail-tester/${jobId}/source-video.${extension}`
    const uploadUrl = await getVoicemailSignedPutUrl({
      key: sourceVideoKey,
      contentType,
      expiresInSeconds: 15 * 60,
    })

    return NextResponse.json({
      jobId,
      sourceVideoKey,
      uploadUrl,
      sourceVideoUrl: getVoicemailS3Url(sourceVideoKey),
      expiresInSeconds: 15 * 60,
    })
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Failed to create upload URL for source video.',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
