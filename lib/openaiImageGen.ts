import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { v4 as uuidv4 } from 'uuid'

const OPENAI_IMAGE_MODEL = 'gpt-image-2'
const OPENAI_IMAGE_SIZE = '1024x1536'
const OPENAI_IMAGE_QUALITY = 'high'

const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-east-2',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
})

interface OpenAiImageGenerationResponse {
  data?: Array<{
    b64_json?: string
  }>
  error?: {
    message?: string
  }
}

export async function generateAndUploadTextArtifact(prompt: string): Promise<string | null> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    console.error('[openai-image] OPENAI_API_KEY not set')
    return null
  }

  try {
    const response = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: OPENAI_IMAGE_MODEL,
        prompt,
        size: OPENAI_IMAGE_SIZE,
        quality: OPENAI_IMAGE_QUALITY,
      }),
    })

    const payload = (await response.json()) as OpenAiImageGenerationResponse
    if (!response.ok || payload.error) {
      console.error('[openai-image] API error:', payload.error?.message || `HTTP ${response.status}`)
      return null
    }

    const base64 = payload.data?.[0]?.b64_json
    if (!base64) {
      console.error('[openai-image] Missing b64_json in response')
      return null
    }

    const buffer = Buffer.from(base64, 'base64')
    const key = `social-generated/${uuidv4()}.png`
    const bucketName = process.env.S3_BUCKET_NAME || 'heartbeat-photos-prod'

    await s3Client.send(
      new PutObjectCommand({
        Bucket: bucketName,
        Key: key,
        Body: buffer,
        ContentType: 'image/png',
      })
    )

    return `https://${bucketName}.s3.us-east-2.amazonaws.com/${key}`
  } catch (error) {
    console.error('[openai-image] Unexpected error:', error)
    return null
  }
}
