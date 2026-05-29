import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { v4 as uuidv4 } from 'uuid'

const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-east-2',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
})

// Gemini 3 Pro Image Preview model
const GEMINI_MODEL = 'gemini-3.1-flash-image-preview'

interface GeminiResponsePart {
  inlineData?: {
    mimeType?: string
    data?: string
  }
}

function inferImageMimeTypeFromUrl(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl)
    const pathname = parsed.pathname.toLowerCase()
    if (pathname.endsWith('.png')) return 'image/png'
    if (pathname.endsWith('.webp')) return 'image/webp'
    if (pathname.endsWith('.heic')) return 'image/heic'
    if (pathname.endsWith('.heif')) return 'image/heif'
    return 'image/jpeg'
  } catch {
    const lower = rawUrl.toLowerCase()
    if (lower.endsWith('.png')) return 'image/png'
    if (lower.endsWith('.webp')) return 'image/webp'
    if (lower.endsWith('.heic')) return 'image/heic'
    if (lower.endsWith('.heif')) return 'image/heif'
    return 'image/jpeg'
  }
}

function normalizeReferenceMimeType(contentTypeHeader: string | null, referenceUrl: string): string {
  const raw = (contentTypeHeader || '').split(';')[0].trim().toLowerCase()
  if (raw.startsWith('image/')) {
    return raw
  }
  return inferImageMimeTypeFromUrl(referenceUrl)
}

export async function generateAndUploadPhoto(
  prompt: string,
  options: { referenceImageUrl?: string | null; referenceMode?: 'identity' | 'style' | 'identity-transform'; key?: string } = {}
): Promise<string | null> {
  const apiKey = process.env.GEMINI_API_KEY
  
  if (!apiKey) {
    console.error('[gemini] GEMINI_API_KEY not set')
    return null
  }
  
  try {
    console.log('[gemini] Generating image with prompt:', prompt.slice(0, 100) + '...')
    console.log(`[gemini] Using model: ${GEMINI_MODEL}`)

    const requestParts: Array<Record<string, unknown>> = []
    if (options.referenceImageUrl) {
      try {
        const referenceResponse = await fetch(options.referenceImageUrl)
        if (referenceResponse.ok) {
          const contentType = normalizeReferenceMimeType(
            referenceResponse.headers.get('content-type'),
            options.referenceImageUrl
          )
          const referenceBuffer = Buffer.from(await referenceResponse.arrayBuffer())
          requestParts.push({
            inlineData: {
              mimeType: contentType,
              data: referenceBuffer.toString('base64'),
            },
          })
          if (options.referenceMode === 'style') {
            requestParts.push({
              text: 'Use the attached image as style/composition reference only. Generate different people who do not resemble the person/people in the reference. Keep only the amateur camera look, composition, lighting awkwardness, and blur characteristics.',
            })
          } else if (options.referenceMode === 'identity-transform') {
            requestParts.push({
              text: 'Use the attached image to preserve composition and camera characteristics, but transform the person/people into a clearly different identity as requested by the prompt.',
            })
          } else {
            requestParts.push({
              text: 'Use the attached image as identity reference where requested by the prompt.',
            })
          }
        } else {
          console.warn('[gemini] Failed to fetch reference image:', referenceResponse.status)
        }
      } catch (referenceError) {
        console.warn('[gemini] Failed to load reference image:', referenceError)
      }
    }
    requestParts.push({ text: prompt })
    
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: requestParts
            }
          ],
          generationConfig: {
            temperature: 0.8,
            responseModalities: ['IMAGE', 'TEXT']
          }
        })
      }
    )
    
    const data = await response.json()
    
    if (data.error) {
      console.error('[gemini] API error:', data.error.message)
      return null
    }
    
    // Extract image from Gemini 3 Pro response format
    // Response: candidates[0].content.parts[] where part has inlineData
    const responseParts = data.candidates?.[0]?.content?.parts
    if (responseParts) {
      const imagePart = (responseParts as GeminiResponsePart[]).find((part) => part.inlineData?.mimeType?.startsWith('image/'))
      if (imagePart?.inlineData?.data) {
        const base64 = imagePart.inlineData.data
        const buffer = Buffer.from(base64, 'base64')
        
        const key = options.key || `social-generated/${uuidv4()}.png`
        await s3Client.send(new PutObjectCommand({
          Bucket: process.env.S3_BUCKET_NAME || 'heartbeat-photos-prod',
          Key: key,
          Body: buffer,
          ContentType: 'image/png',
        }))
        
        const url = `https://${process.env.S3_BUCKET_NAME || 'heartbeat-photos-prod'}.s3.us-east-2.amazonaws.com/${key}`
        console.log('[gemini] Image uploaded:', url)
        
        return url
      }
    }
    
    console.error('[gemini] No image in response:', JSON.stringify(data).slice(0, 500))
    return null
  } catch (error) {
    console.error('[gemini] Error:', error)
    return null
  }
}
