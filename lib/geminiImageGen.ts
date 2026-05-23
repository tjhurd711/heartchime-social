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

export async function generateAndUploadPhoto(
  prompt: string,
  options: { referenceImageUrl?: string | null } = {}
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
          const contentType = referenceResponse.headers.get('content-type') || 'image/jpeg'
          const referenceBuffer = Buffer.from(await referenceResponse.arrayBuffer())
          requestParts.push({
            inlineData: {
              mimeType: contentType,
              data: referenceBuffer.toString('base64'),
            },
          })
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
        
        const key = `social-generated/${uuidv4()}.png`
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
