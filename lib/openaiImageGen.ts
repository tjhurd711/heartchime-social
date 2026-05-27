import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { v4 as uuidv4 } from 'uuid'

const OPENAI_IMAGE_MODEL = 'gpt-image-2'
const OPENAI_IMAGE_SIZE = '1024x1536'
const OPENAI_IMAGE_QUALITY = 'high'
const OPENAI_EDITS_ENDPOINT = 'https://api.openai.com/v1/images/edits'

const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-east-2',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
})

interface OpenAiImageGenerationResponse {
  data?: Array<{
    url?: string
    b64_json?: string
  }>
  error?: {
    message?: string
  }
}

interface TextArtifactOptions {
  timeoutMs?: number
  size?: string
  quality?: string
}

function inferImageMimeTypeFromPath(pathOrUrl: string): string {
  const lower = pathOrUrl.toLowerCase()
  if (lower.endsWith('.png')) return 'image/png'
  if (lower.endsWith('.webp')) return 'image/webp'
  if (lower.endsWith('.heic')) return 'image/heic'
  if (lower.endsWith('.heif')) return 'image/heif'
  if (lower.endsWith('.avif')) return 'image/avif'
  return 'image/jpeg'
}

function inferImageMimeTypeFromUrl(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl)
    return inferImageMimeTypeFromPath(parsed.pathname)
  } catch {
    return inferImageMimeTypeFromPath(rawUrl)
  }
}

function uploadBufferToGeneratedMedia(buffer: Buffer): Promise<string> {
  const key = `social-generated/${uuidv4()}.png`
  const bucketName = process.env.S3_BUCKET_NAME || 'heartbeat-photos-prod'

  return s3Client
    .send(
      new PutObjectCommand({
        Bucket: bucketName,
        Key: key,
        Body: buffer,
        ContentType: 'image/png',
      })
    )
    .then(() => `https://${bucketName}.s3.us-east-2.amazonaws.com/${key}`)
}

export async function generateAndUploadTextArtifact(
  prompt: string,
  options: TextArtifactOptions = {}
): Promise<string | null> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    console.error('[openai-image] OPENAI_API_KEY not set')
    return null
  }

  try {
    const timeoutMs = Number.isFinite(options.timeoutMs) ? Math.max(1000, Math.floor(options.timeoutMs!)) : 55000
    const size = options.size?.trim() || OPENAI_IMAGE_SIZE
    const quality = options.quality?.trim() || OPENAI_IMAGE_QUALITY
    const timeoutSignal = AbortSignal.timeout(timeoutMs)

    const response = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      signal: timeoutSignal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: OPENAI_IMAGE_MODEL,
        prompt,
        size,
        quality,
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
    return await uploadBufferToGeneratedMedia(buffer)
  } catch (error) {
    if (error instanceof Error && error.name === 'TimeoutError') {
      console.error('[openai-image] Text artifact generation timed out')
      return null
    }
    console.error('[openai-image] Unexpected error:', error)
    return null
  }
}

export async function generateAndUploadGptImage(prompt: string): Promise<string | null> {
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
      console.error('[openai-image] GPT generation API error:', payload.error?.message || `HTTP ${response.status}`)
      return null
    }

    const base64 = payload.data?.[0]?.b64_json
    if (!base64) {
      console.error('[openai-image] GPT generation response missing b64_json')
      return null
    }

    const buffer = Buffer.from(base64, 'base64')
    return await uploadBufferToGeneratedMedia(buffer)
  } catch (error) {
    console.error('[openai-image] Unexpected GPT generation error:', error)
    return null
  }
}

export async function generateAndUploadGptImageEdit(
  prompt: string,
  inputImageUrl: string
): Promise<string | null> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    console.error('[openai-image] OPENAI_API_KEY not set')
    return null
  }

  try {
    const inputImageResponse = await fetch(inputImageUrl)
    if (!inputImageResponse.ok) {
      console.error('[openai-image] Failed to fetch input image:', inputImageResponse.status)
      return null
    }

    const inputImageBytes = await inputImageResponse.arrayBuffer()
    const contentType = (inputImageResponse.headers.get('content-type') || '').split(';')[0].trim().toLowerCase()
    const mimeType = contentType.startsWith('image/') ? contentType : inferImageMimeTypeFromUrl(inputImageUrl)

    const formData = new FormData()
    formData.append('model', OPENAI_IMAGE_MODEL)
    formData.append('quality', OPENAI_IMAGE_QUALITY)
    formData.append('size', OPENAI_IMAGE_SIZE)
    formData.append('prompt', prompt)
    formData.append('image', new Blob([inputImageBytes], { type: mimeType }), 'previous-slide-input.png')

    const response = await fetch(OPENAI_EDITS_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: formData,
    })

    const payload = (await response.json()) as OpenAiImageGenerationResponse
    if (!response.ok || payload.error) {
      console.error('[openai-image] Edits API error:', payload.error?.message || `HTTP ${response.status}`)
      return null
    }

    const base64 = payload.data?.[0]?.b64_json
    if (!base64) {
      console.error('[openai-image] Edits response missing b64_json')
      return null
    }

    const buffer = Buffer.from(base64, 'base64')
    return await uploadBufferToGeneratedMedia(buffer)
  } catch (error) {
    console.error('[openai-image] Unexpected edits error:', error)
    return null
  }
}
