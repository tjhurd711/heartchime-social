import { NextRequest, NextResponse } from 'next/server'
import { PutObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { v4 as uuidv4 } from 'uuid'
import { s3Client, BUCKET_NAME, AWS_REGION } from '@/lib/s3'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { fileName, contentType } = body

    if (!fileName || !contentType) {
      return NextResponse.json(
        { error: 'fileName and contentType are required' },
        { status: 400 }
      )
    }

    // Validate content type
    const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp']
    if (!allowedTypes.includes(contentType)) {
      return NextResponse.json(
        { error: 'Invalid content type. Allowed: png, jpeg, webp' },
        { status: 400 }
      )
    }

    // Generate unique key for the file
    const uuid = uuidv4()
    const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_')
    const s3Key = `social/recipients/${uuid}-${sanitizedFileName}`

    // Create the command for putting an object
    const command = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: s3Key,
      ContentType: contentType,
    })

    // Generate the presigned URL (valid for 1 hour)
    const uploadUrl = await getSignedUrl(s3Client, command, {
      expiresIn: 3600,
    })

    // Generate the public URL (matching format from lib/s3.ts)
    const publicUrl = `https://${BUCKET_NAME}.s3.${AWS_REGION}.amazonaws.com/${s3Key}`

    return NextResponse.json({
      uploadUrl,
      publicUrl,
      s3Key,
    })
  } catch (error) {
    console.error('Error generating presigned URL for recipient:', error)
    return NextResponse.json(
      { error: 'Failed to generate upload URL' },
      { status: 500 }
    )
  }
}

