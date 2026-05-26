import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

const REGION = process.env.AWS_REGION || 'us-east-2'
const BUCKET_NAME = process.env.S3_BUCKET_NAME || 'heartbeat-photos-prod'

const credentials =
  process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
    ? {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      }
    : undefined

const voicemailS3Client = new S3Client({
  region: REGION,
  credentials,
})

export function getVoicemailBucketName(): string {
  return BUCKET_NAME
}

export function getVoicemailRegion(): string {
  return REGION
}

export function getVoicemailS3Url(key: string): string {
  return `https://${BUCKET_NAME}.s3.${REGION}.amazonaws.com/${key}`
}

export async function getVoicemailSignedReadUrl(key: string, expiresInSeconds: number = 60 * 60): Promise<string> {
  return getSignedUrl(
    voicemailS3Client,
    new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
    }),
    { expiresIn: expiresInSeconds }
  )
}

export async function getVoicemailSignedPutUrl(params: {
  key: string
  contentType: string
  expiresInSeconds?: number
}): Promise<string> {
  return getSignedUrl(
    voicemailS3Client,
    new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: params.key,
      ContentType: params.contentType,
    }),
    { expiresIn: params.expiresInSeconds ?? 15 * 60 }
  )
}

export async function uploadVoicemailObject(params: {
  key: string
  body: Buffer | string
  contentType: string
  cacheControl?: string
}) {
  await voicemailS3Client.send(
    new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: params.key,
      Body: params.body,
      ContentType: params.contentType,
      CacheControl: params.cacheControl,
    })
  )
}

export async function getVoicemailObjectBuffer(key: string): Promise<Buffer> {
  const response = await voicemailS3Client.send(
    new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
    })
  )

  if (!response.Body) {
    throw new Error(`S3 object body is empty for key: ${key}`)
  }

  const bodyAsArrayBuffer = await response.Body.transformToByteArray()
  return Buffer.from(bodyAsArrayBuffer)
}
