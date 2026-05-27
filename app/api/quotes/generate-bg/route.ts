import { NextRequest, NextResponse } from 'next/server'
import { GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { generateAndUploadPhoto } from '@/lib/geminiImageGen'
import { s3Client } from '@/lib/s3'

export const runtime = 'nodejs'
export const maxDuration = 90

interface GenerateQuoteBackgroundRequest {
  prompt?: string
  jobId?: string
}

const DEFAULT_BG_PROMPT =
  'Serene soft-focus nature scene, golden hour light, subtle atmospheric depth, textless background, no people, no text, vertical composition.'

function parseS3KeyFromUrl(rawUrl: string): string | null {
  try {
    const parsed = new URL(rawUrl)
    const key = decodeURIComponent(parsed.pathname.replace(/^\/+/, ''))
    return key || null
  } catch {
    return null
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as GenerateQuoteBackgroundRequest
    const prompt = body.prompt?.trim() || DEFAULT_BG_PROMPT
    const jobId = body.jobId?.trim() || ''

    if (!jobId) {
      return NextResponse.json({ error: 'jobId is required' }, { status: 400 })
    }

    const effectivePrompt = `${prompt}\n\nStrict requirements: no people, no words, no typography, no logos, no signs, no watermark.`
    const generatedUrl = await generateAndUploadPhoto(effectivePrompt)

    if (!generatedUrl) {
      return NextResponse.json({ error: 'Failed to generate quote background' }, { status: 500 })
    }

    const key = parseS3KeyFromUrl(generatedUrl)
    if (!key) {
      return NextResponse.json(
        { error: 'Generated URL did not include a valid S3 key', details: generatedUrl },
        { status: 500 }
      )
    }

    const bucketName = process.env.S3_BUCKET_NAME || 'heartbeat-photos-prod'
    const presignedUrl = await getSignedUrl(
      s3Client,
      new GetObjectCommand({
        Bucket: bucketName,
        Key: key,
      }),
      { expiresIn: 86400 }
    )

    return NextResponse.json({ key, url: presignedUrl })
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Failed to generate quote background',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
