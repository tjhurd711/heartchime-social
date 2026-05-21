import { NextRequest, NextResponse } from 'next/server'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'

const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-east-2',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
  },
})

const BUCKET = process.env.S3_BUCKET_NAME || 'heartbeat-photos-prod'
const REGION = process.env.AWS_REGION || 'us-east-2'

const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'webp', 'heic', 'heif', 'avif'])
const VIDEO_EXTENSIONS = new Set(['mp4', 'mov', 'm4v', 'webm'])

function sanitizeFileName(fileName: string): string {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, '_')
}

function getExtension(fileName: string): string {
  const raw = fileName.split('.').pop() || ''
  return raw.toLowerCase()
}

function isImageFile(file: File): boolean {
  if (file.type.startsWith('image/')) return true
  return IMAGE_EXTENSIONS.has(getExtension(file.name))
}

function isVideoFile(file: File): boolean {
  if (file.type.startsWith('video/')) return true
  return VIDEO_EXTENSIONS.has(getExtension(file.name))
}

function inferContentType(file: File, fallback: string): string {
  if (file.type && file.type.trim().length > 0) {
    return file.type
  }
  const extension = getExtension(file.name)
  if (extension === 'jpg' || extension === 'jpeg') return 'image/jpeg'
  if (extension === 'png') return 'image/png'
  if (extension === 'webp') return 'image/webp'
  if (extension === 'heic') return 'image/heic'
  if (extension === 'heif') return 'image/heif'
  if (extension === 'avif') return 'image/avif'
  if (extension === 'mp4') return 'video/mp4'
  if (extension === 'mov') return 'video/quicktime'
  if (extension === 'm4v') return 'video/x-m4v'
  if (extension === 'webm') return 'video/webm'
  return fallback
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const formData = await request.formData()
    const file = formData.get('file')
    const kind = String(formData.get('kind') || '')

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'file is required' }, { status: 400 })
    }
    if (!['video', 'photo', 'media'].includes(kind)) {
      return NextResponse.json({ error: 'kind must be media, video, or photo' }, { status: 400 })
    }

    if (kind === 'photo' && !isImageFile(file)) {
      return NextResponse.json(
        { error: 'Invalid photo type. Allowed: image files (png/jpeg/webp/heic/heif/avif)' },
        { status: 400 }
      )
    }
    if (kind === 'video' && !isVideoFile(file)) {
      return NextResponse.json({ error: 'Invalid video type. Allowed: mp4/mov/m4v/webm' }, { status: 400 })
    }
    if (kind === 'media' && !isImageFile(file) && !isVideoFile(file)) {
      return NextResponse.json(
        { error: 'Invalid media type. Allowed: image files or mp4/mov/m4v/webm' },
        { status: 400 }
      )
    }

    console.info('[template-reference-upload] incoming file', {
      templateId: id,
      kind,
      fileName: file.name,
      fileType: file.type,
      fileSize: file.size,
      detectedIsImage: isImageFile(file),
      detectedIsVideo: isVideoFile(file),
    })

    const fallbackExt = isVideoFile(file) ? 'mp4' : 'png'
    const safeName = sanitizeFileName(file.name || `${kind}.${fallbackExt}`)
    const key = `social-template-inputs/template-references/${id}/${safeName}`
    const body = Buffer.from(await file.arrayBuffer())
    const contentType = inferContentType(file, isVideoFile(file) ? 'video/mp4' : 'image/png')

    await s3Client.send(
      new PutObjectCommand({
        Bucket: BUCKET,
        Key: key,
        Body: body,
        ContentType: contentType,
      })
    )

    const url = `https://${BUCKET}.s3.${REGION}.amazonaws.com/${key}`
    console.info('[template-reference-upload] uploaded', {
      templateId: id,
      kind,
      key,
      contentType,
      url,
    })
    return NextResponse.json({ url, key })
  } catch (error) {
    console.error('[template-reference-upload] failed', {
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    })
    return NextResponse.json(
      {
        error: 'Failed to upload reference media',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
