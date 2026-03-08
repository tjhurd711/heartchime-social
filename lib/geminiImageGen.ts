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
const GEMINI_MODEL = 'gemini-3-pro-image-preview'

export async function generateAndUploadPhoto(
  prompt: string
): Promise<string | null> {
  const apiKey = process.env.GEMINI_API_KEY
  
  if (!apiKey) {
    console.error('[gemini] GEMINI_API_KEY not set')
    return null
  }
  
  try {
    console.log('[gemini] Generating image with prompt:', prompt.slice(0, 100) + '...')
    console.log(`[gemini] Using model: ${GEMINI_MODEL}`)
    
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [
                { text: prompt }
              ]
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
    const parts = data.candidates?.[0]?.content?.parts
    if (parts) {
      const imagePart = parts.find((p: any) => p.inlineData?.mimeType?.startsWith('image/'))
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
        
        const url = `https://${process.env.S3_BUCKET_NAME || 'heartbeat-photos-prod'}.s3.amazonaws.com/${key}`
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
