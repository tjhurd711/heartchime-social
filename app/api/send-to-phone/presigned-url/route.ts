import { NextRequest, NextResponse } from 'next/server'
import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { s3Client } from '@/lib/s3'

export const runtime = 'nodejs'

const BUCKET = process.env.S3_BUCKET_NAME || 'heartbeat-photos-prod'
const MAX_ALBUM_NAME_LENGTH = 120
const MAX_EXTENSION_LENGTH = 10
const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
  'image/avif',
  'image/gif',
])

interface PresignedRequestBody {
  albumName?: string
  order?: number
  extension?: string
  contentType?: string
}

function sanitizeAlbumName(value: string): string {
  const trimmed = value.trim().slice(0, MAX_ALBUM_NAME_LENGTH)
  return trimmed.replace(/[^a-zA-Z0-9_-]/g, '_')
}

function sanitizeExtension(value: string): string {
  const cleaned = value.trim().replace(/^\./, '').toLowerCase().slice(0, MAX_EXTENSION_LENGTH)
  return cleaned.replace(/[^a-z0-9]/g, '')
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as PresignedRequestBody
    const albumName = sanitizeAlbumName(body.albumName || '')
    const order = Number(body.order)
    const extension = sanitizeExtension(body.extension || '')
    const contentType = (body.contentType || '').toLowerCase()

    if (!albumName) {
      return NextResponse.json({ error: 'albumName is required' }, { status: 400 })
    }
    if (!Number.isInteger(order) || order < 1 || order > 999) {
      return NextResponse.json({ error: 'order must be an integer between 1 and 999' }, { status: 400 })
    }
    if (!extension) {
      return NextResponse.json({ error: 'extension is required' }, { status: 400 })
    }
    if (!contentType || !ALLOWED_MIME_TYPES.has(contentType)) {
      return NextResponse.json({ error: 'Unsupported contentType for image upload' }, { status: 400 })
    }

    const key = `social-bait/send/${albumName}/${String(order).padStart(2, '0')}.${extension}`

    const putUrl = await getSignedUrl(
      s3Client,
      new PutObjectCommand({
        Bucket: BUCKET,
        Key: key,
        ContentType: contentType,
      }),
      { expiresIn: 60 * 10 }
    )

    const getUrl = await getSignedUrl(
      s3Client,
      new GetObjectCommand({
        Bucket: BUCKET,
        Key: key,
      }),
      { expiresIn: 60 * 20 }
    )

    return NextResponse.json({
      key,
      putUrl,
      getUrl,
      expiresInSeconds: {
        put: 60 * 10,
        get: 60 * 20,
      },
    })
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Failed to create presigned URLs',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
