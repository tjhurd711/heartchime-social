import { HeadObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { NextResponse } from 'next/server'
import { s3Client } from '@/lib/s3'

export const runtime = 'nodejs'

const DEFAULT_BUCKET = process.env.S3_BUCKET_NAME || 'heartbeat-photos-prod'
const STALE_AFTER_DAYS = 7

/**
 * Reports YouTube cookie object age for the Video Editor AWS fetch UI.
 * Reads private S3 key only (never returns cookie contents).
 */
export async function GET() {
  const bucket =
    process.env.YOUTUBE_COOKIES_S3_BUCKET?.trim() ||
    process.env.S3_BUCKET_NAME?.trim() ||
    DEFAULT_BUCKET
  const key = process.env.YOUTUBE_COOKIES_S3_KEY?.trim() || 'config/youtube-cookies.txt'

  try {
    const client: S3Client = s3Client
    const head = await client.send(
      new HeadObjectCommand({
        Bucket: bucket,
        Key: key,
      })
    )

    const meta = head.Metadata || {}
    const uploadedAtRaw =
      meta['uploaded-at'] || meta['uploaded_at'] || head.LastModified?.toISOString() || null

    let ageDays: number | null = null
    let stale = false
    if (uploadedAtRaw) {
      const uploadedMs = Date.parse(uploadedAtRaw)
      if (Number.isFinite(uploadedMs)) {
        ageDays = Math.max(0, (Date.now() - uploadedMs) / (1000 * 60 * 60 * 24))
        stale = ageDays > STALE_AFTER_DAYS
      }
    }

    return NextResponse.json({
      configured: true,
      bucket,
      key,
      uploadedAt: uploadedAtRaw,
      ageDays,
      stale,
      staleAfterDays: STALE_AFTER_DAYS,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    const missing =
      message.includes('NotFound') ||
      message.includes('NoSuchKey') ||
      message.includes('404') ||
      (error as { name?: string })?.name === 'NotFound' ||
      (error as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode === 404

    return NextResponse.json(
      {
        configured: false,
        bucket,
        key,
        uploadedAt: null,
        ageDays: null,
        stale: true,
        staleAfterDays: STALE_AFTER_DAYS,
        error: missing
          ? `No cookies at s3://${bucket}/${key} — run export-youtube-cookies.ps1 then upload-youtube-cookies.mjs`
          : message,
      },
      { status: missing ? 200 : 500 }
    )
  }
}
