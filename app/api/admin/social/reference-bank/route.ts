import { randomUUID } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3'
import { s3Client } from '@/lib/s3'

const SOURCE_BUCKET = 'order-by-age-uploads'
const TARGET_BUCKET = process.env.S3_BUCKET_NAME || 'heartbeat-photos-prod'
const AWS_REGION = process.env.AWS_REGION || 'us-east-2'
const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.heic', '.webp'])

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

type SaveItem = { key: string }

function getFileExtension(key: string): string | null {
  const dotIndex = key.lastIndexOf('.')
  if (dotIndex < 0) return null
  const extension = key.slice(dotIndex).toLowerCase()
  return IMAGE_EXTENSIONS.has(extension) ? extension : null
}

function inferContentType(extension: string): string {
  if (extension === '.jpg' || extension === '.jpeg') return 'image/jpeg'
  if (extension === '.png') return 'image/png'
  if (extension === '.heic') return 'image/heic'
  if (extension === '.webp') return 'image/webp'
  return 'application/octet-stream'
}

export async function GET() {
  try {
    const { data, error } = await supabase
      .from('reference_photo_bank')
      .select('id, source_bucket, source_key, bank_url, tags, created_at')
      .order('created_at', { ascending: false })
      .limit(500)

    if (error) {
      return NextResponse.json(
        { error: 'Failed to fetch reference bank', details: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({ items: data || [] })
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Failed to fetch reference bank',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const incomingItems = Array.isArray(body?.items) ? (body.items as SaveItem[]) : []
    const uniqueKeys = Array.from(
      new Set(
        incomingItems
          .map(item => (typeof item?.key === 'string' ? item.key.trim() : ''))
          .filter(Boolean)
      )
    )

    if (uniqueKeys.length === 0) {
      return NextResponse.json({ saved: 0, skipped: 0 })
    }

    const invalidKey = uniqueKeys.find(key => !getFileExtension(key))
    if (invalidKey) {
      return NextResponse.json(
        { error: `Unsupported image key extension: ${invalidKey}` },
        { status: 400 }
      )
    }

    const { data: existingRows, error: existingError } = await supabase
      .from('reference_photo_bank')
      .select('source_key')
      .eq('source_bucket', SOURCE_BUCKET)
      .in('source_key', uniqueKeys)

    if (existingError) {
      return NextResponse.json(
        { error: 'Failed to check existing bank rows', details: existingError.message },
        { status: 500 }
      )
    }

    const existingKeys = new Set((existingRows || []).map(row => row.source_key))
    const keysToCopy = uniqueKeys.filter(key => !existingKeys.has(key))

    let saved = 0
    let skipped = uniqueKeys.length - keysToCopy.length

    for (const sourceKey of keysToCopy) {
      const extension = getFileExtension(sourceKey)
      if (!extension) {
        skipped += 1
        continue
      }

      const sourceObject = await s3Client.send(
        new GetObjectCommand({
          Bucket: SOURCE_BUCKET,
          Key: sourceKey,
        })
      )

      if (!sourceObject.Body) {
        skipped += 1
        continue
      }

      const targetKey = `reference-bank/${randomUUID()}${extension}`
      const bytes = await sourceObject.Body.transformToByteArray()
      const contentType = sourceObject.ContentType || inferContentType(extension)

      await s3Client.send(
        new PutObjectCommand({
          Bucket: TARGET_BUCKET,
          Key: targetKey,
          Body: Buffer.from(bytes),
          ContentType: contentType,
        })
      )

      const bankUrl = `https://${TARGET_BUCKET}.s3.${AWS_REGION}.amazonaws.com/${targetKey}`

      const { data: insertData, error: insertError } = await supabase
        .from('reference_photo_bank')
        .upsert(
          {
            source_bucket: SOURCE_BUCKET,
            source_key: sourceKey,
            bank_url: bankUrl,
          },
          {
            onConflict: 'source_bucket,source_key',
            ignoreDuplicates: true,
          }
        )
        .select('id')

      if (insertError) {
        return NextResponse.json(
          { error: 'Failed to insert reference photo bank row', details: insertError.message },
          { status: 500 }
        )
      }

      if ((insertData || []).length > 0) {
        saved += 1
      } else {
        skipped += 1
      }
    }

    return NextResponse.json({ saved, skipped })
  } catch (error) {
    console.error('[reference-bank] failed', {
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    })

    return NextResponse.json(
      {
        error: 'Failed to save reference bank items',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
