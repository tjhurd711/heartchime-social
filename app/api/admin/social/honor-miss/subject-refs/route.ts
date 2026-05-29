import { NextRequest, NextResponse } from 'next/server'
import { GetObjectCommand, ListObjectsV2Command, PutObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { v4 as uuidv4 } from 'uuid'
import { s3Client } from '@/lib/s3'

export const runtime = 'nodejs'

// Subject reference photos for Honor & Miss third-person tributes live in
// heartbeat-photos-prod. We let the picker browse existing social imagery and
// upload new subject references under social-generated/subject-refs/.
const BUCKET = process.env.S3_BUCKET_NAME || 'heartbeat-photos-prod'
const REGION = process.env.AWS_REGION || 'us-east-2'
const UPLOAD_PREFIX = 'social-generated/subject-refs/'

const ALLOWED_PREFIXES = ['social-generated/subject-refs/', 'social-generated/', 'social-bait/']

const DEFAULT_PAGE_SIZE = 30
const MAX_PAGE_SIZE = 60
const MAX_EXTENSION_LENGTH = 10
const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.heic', '.heif', '.webp', '.avif'])
const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
  'image/avif',
])

function isImageKey(key: string): boolean {
  const lower = key.toLowerCase()
  return Array.from(IMAGE_EXTENSIONS).some((ext) => lower.endsWith(ext))
}

function publicUrl(key: string): string {
  return `https://${BUCKET}.s3.${REGION}.amazonaws.com/${key}`
}

function sanitizeExtension(value: string): string {
  const cleaned = value.trim().replace(/^\./, '').toLowerCase().slice(0, MAX_EXTENSION_LENGTH)
  return cleaned.replace(/[^a-z0-9]/g, '')
}

function resolvePrefix(requested: string | null): string {
  const prefix = (requested || '').trim()
  if (ALLOWED_PREFIXES.includes(prefix)) return prefix
  return UPLOAD_PREFIX
}

// ─── Browse existing reference photos ────────────────────────────────────────
export async function GET(request: NextRequest) {
  try {
    const prefix = resolvePrefix(request.nextUrl.searchParams.get('prefix'))
    const token = request.nextUrl.searchParams.get('token') || undefined
    const pageSizeRaw = Number.parseInt(request.nextUrl.searchParams.get('pageSize') || '', 10)
    const pageSize = Number.isNaN(pageSizeRaw)
      ? DEFAULT_PAGE_SIZE
      : Math.min(MAX_PAGE_SIZE, Math.max(1, pageSizeRaw))

    const listResponse = await s3Client.send(
      new ListObjectsV2Command({
        Bucket: BUCKET,
        Prefix: prefix,
        MaxKeys: pageSize,
        ContinuationToken: token,
      })
    )

    const keys = (listResponse.Contents || [])
      .map((object) => object.Key || '')
      .filter((key) => key.length > 0 && !key.endsWith('/') && isImageKey(key))

    const items = await Promise.all(
      keys.map(async (key) => {
        // Presigned thumbnail works whether or not the object is publicly readable.
        const thumbUrl = await getSignedUrl(
          s3Client,
          new GetObjectCommand({ Bucket: BUCKET, Key: key }),
          { expiresIn: 60 * 60 }
        )
        return { key, url: publicUrl(key), thumbUrl }
      })
    )

    return NextResponse.json({
      items,
      prefix,
      pageSize,
      nextToken: listResponse.NextContinuationToken || null,
      hasNextPage: Boolean(listResponse.NextContinuationToken),
    })
  } catch (error) {
    console.error('[honor-miss/subject-refs] browse failed:', error)
    return NextResponse.json(
      { error: 'Failed to browse subject references', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

// ─── Presigned upload for a new subject reference ────────────────────────────
interface UploadBody {
  extension?: string
  contentType?: string
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as UploadBody
    const extension = sanitizeExtension(body.extension || '')
    const contentType = (body.contentType || '').toLowerCase()

    if (!extension) {
      return NextResponse.json({ error: 'extension is required' }, { status: 400 })
    }
    if (!contentType || !ALLOWED_MIME_TYPES.has(contentType)) {
      return NextResponse.json({ error: 'Unsupported contentType for image upload' }, { status: 400 })
    }

    const key = `${UPLOAD_PREFIX}${uuidv4()}.${extension}`

    const putUrl = await getSignedUrl(
      s3Client,
      new PutObjectCommand({ Bucket: BUCKET, Key: key, ContentType: contentType }),
      { expiresIn: 60 * 10 }
    )

    return NextResponse.json({
      key,
      putUrl,
      url: publicUrl(key),
      expiresInSeconds: { put: 60 * 10 },
    })
  } catch (error) {
    console.error('[honor-miss/subject-refs] presign failed:', error)
    return NextResponse.json(
      { error: 'Failed to create upload URL', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
