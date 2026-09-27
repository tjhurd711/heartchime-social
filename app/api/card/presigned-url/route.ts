import { NextRequest, NextResponse } from 'next/server'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

export const runtime = 'nodejs'

// Card photo uploads live alongside rendered cards in the prod photo bucket. The
// social-cards/* prefix is already writable + publicly readable (the admin
// renderer writes there), so user uploads go under social-cards/uploads/*.
const CARD_REGION = 'us-east-2'
const CARD_BUCKET = process.env.AWS_S3_BUCKET || 'heartbeat-photos-prod'
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

const cardS3Client = new S3Client({
  region: CARD_REGION,
  // Default checksums add x-amz-checksum-crc32=AAAAAA== to the presigned URL.
  // The browser PUT cannot replace that placeholder, so S3 rejects the upload.
  requestChecksumCalculation: 'WHEN_REQUIRED',
  responseChecksumValidation: 'WHEN_REQUIRED',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
})

interface PresignedRequestBody {
  cardId?: string
  filename?: string
  contentType?: string
}

function sanitizeFilename(value: string): string {
  const base = value.split('/').pop()?.split('\\').pop() || ''
  const cleaned = base.trim().slice(0, MAX_FILENAME_LENGTH).replace(/[^a-zA-Z0-9._-]/g, '_')
  return cleaned.replace(/^\.+/, '')
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as PresignedRequestBody
    const cardId = (body.cardId || '').trim()
    const filename = sanitizeFilename(body.filename || '')
    const contentType = (body.contentType || '').toLowerCase()

    if (!UUID_REGEX.test(cardId)) {
      return NextResponse.json({ error: 'cardId must be a valid UUID' }, { status: 400 })
    }
    if (!filename) {
      return NextResponse.json({ error: 'filename is required' }, { status: 400 })
    }
    if (!contentType || !ALLOWED_MIME_TYPES.has(contentType)) {
      return NextResponse.json({ error: 'Unsupported contentType for image upload' }, { status: 400 })
    }

    const key = `social-cards/uploads/${cardId}/${filename}`

    const putUrl = await getSignedUrl(
      cardS3Client,
      new PutObjectCommand({
        Bucket: CARD_BUCKET,
        Key: key,
        ContentType: contentType,
      }),
      { expiresIn: 60 * 10 }
    )

    const publicUrl = `https://${CARD_BUCKET}.s3.${CARD_REGION}.amazonaws.com/${key}`

    return NextResponse.json({
      key,
      putUrl,
      publicUrl,
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
