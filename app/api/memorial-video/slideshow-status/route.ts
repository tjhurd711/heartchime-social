import { GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { NextRequest, NextResponse } from 'next/server'
import { s3Client } from '@/lib/s3'

export const runtime = 'nodejs'

const OUTPUT_BUCKET = process.env.S3_BUCKET_NAME || 'heartbeat-photos-prod'
const UUID_PATTERN = /^[0-9a-fA-F-]{16,64}$/

// The memorial-slideshow Lambda always writes its finished render to
// memorial-slideshow/{jobId}/video.mp4 and a sidecar metadata.json. The
// metadata file is written immediately after the video upload, so its presence
// is the signal that the render is complete.
function videoKey(jobId: string): string {
  return `memorial-slideshow/${jobId}/video.mp4`
}

function metadataKey(jobId: string): string {
  return `memorial-slideshow/${jobId}/metadata.json`
}

function isMissingObjectError(error: unknown): boolean {
  const name = (error as { name?: string })?.name
  const code = (error as { Code?: string })?.Code
  const statusCode = (error as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode
  return name === 'NoSuchKey' || code === 'NoSuchKey' || name === 'NotFound' || statusCode === 404
}

export async function GET(request: NextRequest) {
  const jobId = request.nextUrl.searchParams.get('jobId')?.trim() || ''
  if (!jobId || !UUID_PATTERN.test(jobId)) {
    return NextResponse.json({ error: 'A valid jobId is required.' }, { status: 400 })
  }

  try {
    let metadata: Record<string, unknown> | null = null
    try {
      const metadataObject = await s3Client.send(
        new GetObjectCommand({ Bucket: OUTPUT_BUCKET, Key: metadataKey(jobId) })
      )
      const body = await metadataObject.Body?.transformToString()
      metadata = body ? (JSON.parse(body) as Record<string, unknown>) : null
    } catch (metadataError) {
      if (isMissingObjectError(metadataError)) {
        return NextResponse.json({ status: 'processing', jobId })
      }
      throw metadataError
    }

    const key = videoKey(jobId)
    const url = await getSignedUrl(
      s3Client,
      new GetObjectCommand({ Bucket: OUTPUT_BUCKET, Key: key }),
      { expiresIn: 60 * 60 * 24 }
    )

    return NextResponse.json({
      status: 'ready',
      jobId,
      key,
      url,
      duration: Number(metadata?.duration ?? 0),
      photoCount: Number(metadata?.photoCount ?? 0),
    })
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Failed to check memorial slideshow status.',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
