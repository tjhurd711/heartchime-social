import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

export const s3Client = new S3Client({
  region: process.env.AWS_REGION!,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
})

export const BUCKET_NAME = process.env.S3_BUCKET_NAME!
export const AWS_REGION = process.env.AWS_REGION!

export interface PresignedUrlRequest {
  fileName: string
  contentType: string
}

export interface PresignedUrlResponse {
  fileName: string
  uploadUrl: string
  s3Key: string
  key: string      // Alias for s3Key (mobile app compatibility)
  s3Url: string    // Final S3 URL after upload (not the presigned URL)
}

/**
 * Generate a presigned URL for uploading a file to S3
 * The URL expires in 1 hour
 */
export async function generatePresignedUrl(
  profileId: string,
  fileName: string,
  contentType: string
): Promise<PresignedUrlResponse> {
  // Create the S3 key (path where file will be stored)
  const s3Key = `initial/${profileId}/${fileName}`

  // Create the command for putting an object
  const command = new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: s3Key,
    ContentType: contentType,
  })

  // Generate the presigned URL (valid for 1 hour)
  const uploadUrl = await getSignedUrl(s3Client, command, {
    expiresIn: 3600, // 1 hour in seconds
  })

  // Generate the final S3 URL (permanent URL after upload)
  const s3Url = `https://${BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${s3Key}`

  return {
    fileName,
    uploadUrl,
    s3Key,
    key: s3Key,   // Alias for mobile app compatibility
    s3Url,        // Final S3 URL (not the presigned upload URL)
  }
}

/**
 * Generate multiple presigned URLs in batch
 */
export async function generatePresignedUrls(
  profileId: string,
  files: PresignedUrlRequest[]
): Promise<PresignedUrlResponse[]> {
  const promises = files.map((file) =>
    generatePresignedUrl(profileId, file.fileName, file.contentType)
  )

  return Promise.all(promises)
}

/**
 * Generate a presigned URL for uploading a gem video to S3
 * Path: gems/{gemId}.mp4
 */
export async function generateGemPresignedUrl(
  gemId: string,
  contentType: string = 'video/mp4'
): Promise<PresignedUrlResponse> {
  const s3Key = `gems/${gemId}.mp4`

  const command = new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: s3Key,
    ContentType: contentType,
  })

  const uploadUrl = await getSignedUrl(s3Client, command, {
    expiresIn: 3600, // 1 hour
  })

  // Generate the final S3 URL (permanent URL after upload)
  const s3Url = `https://${BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${s3Key}`

  return {
    fileName: `${gemId}.mp4`,
    uploadUrl,
    s3Key,
    key: s3Key,   // Alias for mobile app compatibility
    s3Url,        // Final S3 URL
  }
}

/**
 * Get the public S3 URL for a gem
 */
export function getGemS3Url(gemId: string): string {
  const s3Key = `gems/${gemId}.mp4`
  // For S3 public URLs, format is: https://bucket.s3.region.amazonaws.com/key
  // Or use CloudFront if configured
  return `https://${BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${s3Key}`
}
