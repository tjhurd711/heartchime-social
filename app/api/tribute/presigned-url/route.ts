import { NextRequest, NextResponse } from 'next/server'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

export const runtime = 'nodejs'

// Tributes live in the prod photo bucket in us-east-2 (rekognition-user already has
// GetObject/PutObject on tributes/*). Pin the region explicitly so presigned PUT
// signatures are always valid regardless of the ambient AWS_REGION env.
const TRIBUTE_REGION = 'us-east-2'
const TRIBUTE_BUCKET = 'heartbeat-photos-prod'
const MAX_FILENAME_LENGTH = 80
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

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

const tributeS3Client = new S3Client({
  region: TRIBUTE_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
})

interface PresignedRequestBody {
  tributeId?: string
  filename?: string
  contentType?: string
}

function sanitizeFilename(value: string): string {
  // Keep only the basename, strip path traversal, allow a safe charset.
  const base = value.split('/').pop()?.split('\\').pop() || ''
  const cleaned = base.trim().slice(0, MAX_FILENAME_LENGTH).replace(/[^a-zA-Z0-9._-]/g, '_')
  return cleaned.replace(/^\.+/, '')
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as PresignedRequestBody
    const tributeId = (body.tributeId || '').trim()
    const filename = sanitizeFilename(body.filename || '')
    const contentType = (body.contentType || '').toLowerCase()

    if (!UUID_REGEX.test(tributeId)) {
      return NextResponse.json({ error: 'tributeId must be a valid UUID' }, { status: 400 })
    }
    if (!filename) {
      return NextResponse.json({ error: 'filename is required' }, { status: 400 })
    }
    if (!contentType || !ALLOWED_MIME_TYPES.has(contentType)) {
      return NextResponse.json({ error: 'Unsupported contentType for image upload' }, { status: 400 })
    }

    const key = `tributes/${tributeId}/${filename}`

    const putUrl = await getSignedUrl(
      tributeS3Client,
      new PutObjectCommand({
        Bucket: TRIBUTE_BUCKET,
        Key: key,
        ContentType: contentType,
      }),
      { expiresIn: 60 * 10 }
    )

    return NextResponse.json({
      key,
      putUrl,
      expiresInSeconds: 60 * 10,
    })
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Failed to create presigned URL',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
