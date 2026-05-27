import { NextRequest, NextResponse } from 'next/server'
import { getVoicemailS3Url, getVoicemailSignedPutUrl } from '@/lib/voicemailStorage'

interface MemorialUploadUrlRequest {
  jobId?: string
  fileName?: string
  contentType?: string
  kind?: 'photo' | 'music'
}

const SUPPORTED_PHOTO_CONTENT_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
  'image/avif',
])

const SUPPORTED_MUSIC_CONTENT_TYPES = new Set([
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/x-wav',
  'audio/aac',
  'audio/mp4',
  'audio/x-m4a',
  'audio/webm',
  'audio/ogg',
])

function resolveExtension(contentType: string, fileName: string, fallback: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase().trim()
  if (ext && /^[a-z0-9]+$/.test(ext)) {
    return ext
  }

  if (contentType === 'image/png') return 'png'
  if (contentType === 'image/webp') return 'webp'
  if (contentType === 'image/heic') return 'heic'
  if (contentType === 'image/heif') return 'heif'
  if (contentType === 'image/avif') return 'avif'
  if (contentType === 'audio/wav' || contentType === 'audio/x-wav') return 'wav'
  if (contentType === 'audio/mpeg' || contentType === 'audio/mp3') return 'mp3'
  if (contentType === 'audio/aac') return 'aac'
  if (contentType === 'audio/x-m4a' || contentType === 'audio/mp4') return 'm4a'
  if (contentType === 'audio/webm') return 'webm'
  if (contentType === 'audio/ogg') return 'ogg'

  return fallback
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as MemorialUploadUrlRequest
    const jobId = body.jobId?.trim() || ''
    const fileName = body.fileName?.trim() || ''
    const contentType = body.contentType?.trim().toLowerCase() || ''
    const kind = body.kind === 'music' ? 'music' : 'photo'

    if (!jobId) {
      return NextResponse.json({ error: 'jobId is required' }, { status: 400 })
    }

    if (!fileName || !contentType) {
      return NextResponse.json(
        { error: 'fileName and contentType are required' },
        { status: 400 }
      )
    }

    if (kind === 'photo' && !SUPPORTED_PHOTO_CONTENT_TYPES.has(contentType)) {
      return NextResponse.json(
        { error: 'Unsupported photo content type.' },
        { status: 400 }
      )
    }

    if (kind === 'music' && !SUPPORTED_MUSIC_CONTENT_TYPES.has(contentType)) {
      return NextResponse.json(
        { error: 'Unsupported music content type.' },
        { status: 400 }
      )
    }

    const extension = resolveExtension(contentType, fileName, kind === 'music' ? 'mp3' : 'jpg')
    const key =
      kind === 'music'
        ? `memorial-slideshow/${jobId}/input/music.${extension}`
        : `memorial-slideshow/${jobId}/input/photo-${crypto.randomUUID()}.${extension}`

    const expiresInSeconds = 15 * 60
    const uploadUrl = await getVoicemailSignedPutUrl({
      key,
      contentType,
      expiresInSeconds,
    })

    return NextResponse.json({
      jobId,
      key,
      uploadUrl,
      publicUrl: getVoicemailS3Url(key),
      expiresInSeconds,
    })
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Failed to create memorial upload URL.',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
