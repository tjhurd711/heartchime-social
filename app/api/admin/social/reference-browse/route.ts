import { NextRequest, NextResponse } from 'next/server'
import { GetObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { s3Client } from '@/lib/s3'

const SOURCE_BUCKET = 'order-by-age-uploads'
const DEFAULT_PREFIX = 'uploads/'
const DEFAULT_PAGE_SIZE = 24
const MAX_PAGE_SIZE = 60
const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.heic', '.webp'])

function isImageKey(key: string): boolean {
  const lower = key.toLowerCase()
  return Array.from(IMAGE_EXTENSIONS).some(ext => lower.endsWith(ext))
}

export async function GET(request: NextRequest) {
  try {
    const prefix = request.nextUrl.searchParams.get('prefix') || DEFAULT_PREFIX
    const token = request.nextUrl.searchParams.get('token') || undefined
    const pageRaw = request.nextUrl.searchParams.get('page')
    const pageSizeRaw = Number.parseInt(request.nextUrl.searchParams.get('pageSize') || '', 10)
    const pageSize = Number.isNaN(pageSizeRaw)
      ? DEFAULT_PAGE_SIZE
      : Math.min(MAX_PAGE_SIZE, Math.max(1, pageSizeRaw))
    const pageFromQuery = Number.parseInt(pageRaw || '', 10)
    const page = Number.isNaN(pageFromQuery) ? 1 : Math.max(1, pageFromQuery)

    let continuationToken = token
    if (!continuationToken && page > 1) {
      for (let index = 1; index < page; index += 1) {
        const cursorResponse = await s3Client.send(
          new ListObjectsV2Command({
            Bucket: SOURCE_BUCKET,
            Prefix: prefix,
            MaxKeys: pageSize,
            ContinuationToken: continuationToken,
          })
        )

        if (!cursorResponse.NextContinuationToken) {
          return NextResponse.json({
            items: [],
            page,
            pageSize,
            nextToken: null,
            hasNextPage: false,
          })
        }

        continuationToken = cursorResponse.NextContinuationToken
      }
    }

    const listResponse = await s3Client.send(
      new ListObjectsV2Command({
        Bucket: SOURCE_BUCKET,
        Prefix: prefix,
        MaxKeys: pageSize,
        ContinuationToken: continuationToken,
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
      page,
      pageSize,
      nextToken: listResponse.NextContinuationToken || null,
      hasNextPage: Boolean(listResponse.NextContinuationToken),
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
