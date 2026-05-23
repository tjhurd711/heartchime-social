import { NextRequest, NextResponse } from 'next/server'
import { GetObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { s3Client } from '@/lib/s3'

const SOURCE_BUCKET = 'order-by-age-uploads'
const DEFAULT_PREFIX = 'uploads/'
const MAX_KEYS = 100
const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.heic', '.webp'])

function isImageKey(key: string): boolean {
  const lower = key.toLowerCase()
  return Array.from(IMAGE_EXTENSIONS).some(ext => lower.endsWith(ext))
}

export async function GET(request: NextRequest) {
  try {
    const prefix = request.nextUrl.searchParams.get('prefix') || DEFAULT_PREFIX
    const token = request.nextUrl.searchParams.get('token') || undefined

    const listResponse = await s3Client.send(
      new ListObjectsV2Command({
        Bucket: SOURCE_BUCKET,
        Prefix: prefix,
        MaxKeys: MAX_KEYS,
        ContinuationToken: token,
      })
    )

    const objects = (listResponse.Contents || [])
      .map(object => object.Key || '')
      .filter(key => key.length > 0 && !key.endsWith('/') && isImageKey(key))

    const items = await Promise.all(
      objects.map(async key => {
        const presignedUrl = await getSignedUrl(
          s3Client,
          new GetObjectCommand({
            Bucket: SOURCE_BUCKET,
            Key: key,
          }),
          { expiresIn: 60 * 60 }
        )

        return { key, presignedUrl }
      })
    )

    return NextResponse.json({
      items,
      nextToken: listResponse.NextContinuationToken || null,
    })
  } catch (error) {
    console.error('[reference-browse] failed', {
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    })

    return NextResponse.json(
      {
        error: 'Failed to browse reference photos',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
