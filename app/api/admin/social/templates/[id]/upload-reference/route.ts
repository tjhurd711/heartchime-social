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

function sanitizeFileName(fileName: string): string {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, '_')
}

function inferContentType(file: File, fallback: string): string {
  if (file.type && file.type.trim().length > 0) {
    return file.type
  }
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

    const allowedPhotoTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp']
    const allowedVideoTypes = ['video/mp4']

    if (kind === 'photo' && !allowedPhotoTypes.includes(file.type)) {
      return NextResponse.json(
        { error: 'Invalid photo type. Allowed: png, jpeg, jpg, webp' },
        { status: 400 }
      )
    }
    if (kind === 'video' && !allowedVideoTypes.includes(file.type)) {
      return NextResponse.json({ error: 'Invalid video type. Only mp4 allowed' }, { status: 400 })
    }
    if (kind === 'media' && !allowedPhotoTypes.includes(file.type) && !allowedVideoTypes.includes(file.type)) {
      return NextResponse.json(
        { error: 'Invalid media type. Allowed: mp4, png, jpeg, jpg, webp' },
        { status: 400 }
      )
    }

    const fallbackExt = file.type === 'video/mp4' ? 'mp4' : 'png'
    const safeName = sanitizeFileName(file.name || `${kind}.${fallbackExt}`)
    const key = `template-references/${id}/${safeName}`
    const body = Buffer.from(await file.arrayBuffer())

    await s3Client.send(
      new PutObjectCommand({
        Bucket: BUCKET,
        Key: key,
        Body: body,
        ContentType: inferContentType(file, kind === 'video' ? 'video/mp4' : 'image/png'),
      })
    )

    const url = `https://${BUCKET}.s3.${REGION}.amazonaws.com/${key}`
    return NextResponse.json({ url, key })
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Failed to upload reference media',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
