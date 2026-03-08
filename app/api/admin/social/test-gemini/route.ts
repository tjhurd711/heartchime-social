import { NextRequest, NextResponse } from 'next/server'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { v4 as uuidv4 } from 'uuid'

// S3 config
const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-east-2',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
  },
})

const S3_BUCKET = process.env.AWS_S3_BUCKET || 'heartbeat-photos-prod'

export async function POST(request: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY
  
  if (!apiKey) {
    return NextResponse.json({ error: 'GEMINI_API_KEY not set' }, { status: 500 })
  }
  
  console.log('[test-gemini] API key exists:', !!apiKey)
  
  const prompt = `Authentic vintage photograph from the 1970s. Warm faded colors, orange and brown tones, soft focus, 1970s fashion. An elderly woman with warm smile, grandmotherly presence, with her granddaughter age 8. Backyard birthday party with decorations, wide angle shot. Medium shot, not close-up. Natural candid moment. Authentic family snapshot feel. No watermarks. No text. No AI artifacts. Aspect ratio: 4:3 landscape.`

  try {
    // Use Imagen 3 model
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-generate-001:predict?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instances: [{ prompt }],
          parameters: {
            sampleCount: 1,
            aspectRatio: '4:3'
          }
        })
      }
    )
    
    const data = await response.json()
    console.log('[test-gemini] Response status:', response.status)
    
    // Check for errors
    if (data.error) {
      console.error('[test-gemini] API error:', data.error)
      return NextResponse.json({ error: data.error }, { status: 500 })
    }
    
    // Extract base64 image data
    const predictions = data.predictions
    if (!predictions || predictions.length === 0) {
      console.error('[test-gemini] No predictions in response')
      return NextResponse.json({ error: 'No image generated' }, { status: 500 })
    }
    
    const base64Image = predictions[0].bytesBase64Encoded
    if (!base64Image) {
      console.error('[test-gemini] No base64 image in prediction')
      return NextResponse.json({ error: 'No image data in response' }, { status: 500 })
    }
    
    console.log('[test-gemini] Got base64 image, length:', base64Image.length)
    
    // Convert base64 to buffer
    const buffer = Buffer.from(base64Image, 'base64')
    
    // Generate unique filename
    const filename = `social-generated/${uuidv4()}.png`
    
    // Upload to S3
    await s3Client.send(
      new PutObjectCommand({
        Bucket: S3_BUCKET,
        Key: filename,
        Body: buffer,
        ContentType: 'image/png',
        CacheControl: 'max-age=31536000',
      })
    )
    
    // Return public URL
    const imageUrl = `https://${S3_BUCKET}.s3.amazonaws.com/${filename}`
    console.log('[test-gemini] Uploaded to S3:', imageUrl)
    
    return NextResponse.json({ 
      success: true, 
      imageUrl,
      prompt,
    })
  } catch (error) {
    console.error('[test-gemini] Error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

export async function GET() {
  return NextResponse.json({
    endpoint: '/api/admin/social/test-gemini',
    method: 'POST',
    description: 'Test Gemini Imagen 3 image generation API and upload to S3',
  })
}
