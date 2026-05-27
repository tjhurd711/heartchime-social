import { GetObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { NextRequest, NextResponse } from 'next/server'
import { s3Client } from '@/lib/s3'

export const runtime = 'nodejs'
export const maxDuration = 60

const SCENIC_BUCKET = 'heartbeat-photos-prod'

async function objectExists(bucket: string, key: string): Promise<boolean> {
  try {
    await s3Client.send(
      new HeadObjectCommand({
        Bucket: bucket,
        Key: key,
      })
    )
    return true
  } catch {
    return false
  }
}

async function presignGetUrl(bucket: string, key: string): Promise<string> {
  return getSignedUrl(
    s3Client,
    new GetObjectCommand({
      Bucket: bucket,
      Key: key,
    }),
    { expiresIn: 86400 }
  )
}

export async function GET(request: NextRequest) {
  try {
    const jobId = request.nextUrl.searchParams.get('jobId')?.trim() || ''
    if (!jobId) {
      return NextResponse.json({ error: 'jobId query param is required' }, { status: 400 })
    }

    const clipKey = `scenic-video/${jobId}/clip-0.mp4`
    const metadataKey = `scenic-video/${jobId}/metadata.json`

    const [clipExists, metadataExists] = await Promise.all([
      objectExists(SCENIC_BUCKET, clipKey),
      objectExists(SCENIC_BUCKET, metadataKey),
    ])

    if (!clipExists || !metadataExists) {
      return NextResponse.json({ status: 'pending' })
    }

    const url = await presignGetUrl(SCENIC_BUCKET, clipKey)
    return NextResponse.json({
      status: 'done',
      key: clipKey,
      url,
    })
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Failed to check scenic video status.',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
