import { NextRequest, NextResponse } from 'next/server'
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3'

const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-east-2',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
  },
})

const BUCKET = process.env.S3_BUCKET_NAME || 'heartbeat-photos-prod'
const REGION = process.env.AWS_REGION || 'us-east-2'

function isAllowedHost(host: string): boolean {
  const allowedHosts = new Set([
    `${BUCKET}.s3.${REGION}.amazonaws.com`,
    `${BUCKET}.s3.amazonaws.com`,
  ])
  return allowedHosts.has(host)
}

export async function GET(request: NextRequest) {
  try {
    const encodedUrl = request.nextUrl.searchParams.get('url')
    if (!encodedUrl) {
      return NextResponse.json({ error: 'Missing url parameter' }, { status: 400 })
    }

    const mediaUrl = new URL(encodedUrl)
    if (!isAllowedHost(mediaUrl.host)) {
      return NextResponse.json({ error: 'Unsupported media host' }, { status: 400 })
    }

    const key = decodeURIComponent(mediaUrl.pathname.replace(/^\/+/, ''))
    if (!key) {
      return NextResponse.json({ error: 'Invalid media key' }, { status: 400 })
    }

    const object = await s3Client.send(
      new GetObjectCommand({
        Bucket: BUCKET,
        Key: key,
      })
    )

    if (!object.Body) {
      return NextResponse.json({ error: 'Media body missing' }, { status: 404 })
    }

    const bytes = await object.Body.transformToByteArray()
    return new NextResponse(Buffer.from(bytes), {
      status: 200,
      headers: {
        'Content-Type': object.ContentType || 'application/octet-stream',
        'Cache-Control': 'public, max-age=3600',
      },
    })
  } catch (error) {
    console.error('[template-reference-media-proxy] failed', {
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    })
    return NextResponse.json(
      {
        error: 'Failed to load reference media',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
