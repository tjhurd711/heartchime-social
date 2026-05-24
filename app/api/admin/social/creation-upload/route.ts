import { NextRequest, NextResponse } from 'next/server'
import { PutObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { v4 as uuidv4 } from 'uuid'
import { s3Client } from '@/lib/s3'

const BUCKET = process.env.S3_BUCKET_NAME || 'heartbeat-photos-prod'
const REGION = process.env.AWS_REGION || 'us-east-2'
const ALLOWED_TYPES = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/heic', 'image/heif', 'image/avif'])

function extensionFromContentType(contentType: string): string {
  if (contentType === 'image/png') return 'png'
  if (contentType === 'image/webp') return 'webp'
  if (contentType === 'image/heic') return 'heic'
  if (contentType === 'image/heif') return 'heif'
  if (contentType === 'image/avif') return 'avif'
  return 'jpg'
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const fileName = typeof body?.fileName === 'string' ? body.fileName : ''
    const contentType = typeof body?.contentType === 'string' ? body.contentType : ''

    if (!fileName || !contentType) {
      return NextResponse.json({ error: 'fileName and contentType are required' }, { status: 400 })
    }
    if (!ALLOWED_TYPES.has(contentType)) {
      return NextResponse.json({ error: 'Invalid content type for image upload' }, { status: 400 })
    }

    const extFromName = fileName.split('.').pop()?.trim().toLowerCase()
    const extension = extFromName && /^[a-z0-9]+$/.test(extFromName)
      ? extFromName
      : extensionFromContentType(contentType)
    const s3Key = `social-uploads/${uuidv4()}.${extension}`

    const command = new PutObjectCommand({
      Bucket: BUCKET,
      Key: s3Key,
      ContentType: contentType,
    })
    const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 })
    const publicUrl = `https://${BUCKET}.s3.${REGION}.amazonaws.com/${s3Key}`

    return NextResponse.json({
      uploadUrl,
      s3Key,
      publicUrl,
    })
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Failed to generate creation upload URL',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
