import { NextRequest, NextResponse } from 'next/server'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { v4 as uuidv4 } from 'uuid'
import { buildSelfiePrompt, SelfieParams } from '@/lib/socialPhotoPrompt'

// ═══════════════════════════════════════════════════════════════════════════
// S3 CLIENT
// ═══════════════════════════════════════════════════════════════════════════

const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-east-2',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
})

// Gemini 3 Pro Image Preview model
const GEMINI_MODEL = 'gemini-3-pro-image-preview'

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

interface GenerateSelfieRequest {
  age: number
  gender: 'male' | 'female'
  ethnicity: 'white' | 'black' | 'hispanic' | 'asian' | 'middle eastern' | 'south asian' | 'mixed'
  angle: 'from below' | 'straight on' | 'from above' | 'side tilt'
  emotion: 'neutral' | 'slight smile' | 'bittersweet' | 'sad' | 'hopeful' | 'tired' | 'peaceful'
  gaze: 'looking at camera' | 'looking away' | 'eyes down' | 'looking off to side'
  setting: 'home' | 'car' | 'outside' | 'office'
}

// ═══════════════════════════════════════════════════════════════════════════
// POST /api/admin/social/generate-selfie
// Generate a dynamic AI selfie using Gemini 3 Pro Image Preview
// ═══════════════════════════════════════════════════════════════════════════

export async function POST(request: NextRequest) {
  try {
    const body: GenerateSelfieRequest = await request.json()
    const { age, gender, ethnicity, angle, emotion, gaze, setting } = body

    // ═══════════════════════════════════════════════════════════════════════
    // VALIDATION
    // ═══════════════════════════════════════════════════════════════════════

    if (!age || age < 18 || age > 80) {
      return NextResponse.json({ error: 'Age must be between 18 and 80' }, { status: 400 })
    }
    if (!gender || !['male', 'female'].includes(gender)) {
      return NextResponse.json({ error: 'Gender must be male or female' }, { status: 400 })
    }
    if (!ethnicity) {
      return NextResponse.json({ error: 'Missing required field: ethnicity' }, { status: 400 })
    }
    if (!angle) {
      return NextResponse.json({ error: 'Missing required field: angle' }, { status: 400 })
    }
    if (!emotion) {
      return NextResponse.json({ error: 'Missing required field: emotion' }, { status: 400 })
    }
    if (!gaze) {
      return NextResponse.json({ error: 'Missing required field: gaze' }, { status: 400 })
    }
    if (!setting) {
      return NextResponse.json({ error: 'Missing required field: setting' }, { status: 400 })
    }

    console.log('[generate-selfie] Starting selfie generation for:', { age, gender, ethnicity, emotion })

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 1: Build the prompt
    // ═══════════════════════════════════════════════════════════════════════

    const selfieParams: SelfieParams = {
      age,
      gender,
      ethnicity,
      angle,
      emotion,
      gaze,
      setting,
    }

    const prompt = buildSelfiePrompt(selfieParams)
    console.log('[generate-selfie] Prompt:', prompt)

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 2: Call Gemini 3 Pro Image Preview
    // ═══════════════════════════════════════════════════════════════════════

    const apiKey = process.env.GEMINI_API_KEY

    if (!apiKey) {
      console.error('[generate-selfie] GEMINI_API_KEY not set')
      return NextResponse.json({ error: 'Image generation service not configured' }, { status: 500 })
    }

    console.log(`[generate-selfie] Using model: ${GEMINI_MODEL}`)

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [{ text: prompt }]
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
      console.error('[generate-selfie] Gemini API error:', data.error.message)
      return NextResponse.json({ error: 'Image generation failed', details: data.error.message }, { status: 500 })
    }

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 3: Extract image from response
    // ═══════════════════════════════════════════════════════════════════════

    const parts = data.candidates?.[0]?.content?.parts
    if (!parts) {
      console.error('[generate-selfie] No parts in response:', JSON.stringify(data).slice(0, 500))
      return NextResponse.json({ error: 'No image generated' }, { status: 500 })
    }

    const imagePart = parts.find((p: any) => p.inlineData?.mimeType?.startsWith('image/'))
    if (!imagePart?.inlineData?.data) {
      console.error('[generate-selfie] No image in response parts')
      return NextResponse.json({ error: 'No image in response' }, { status: 500 })
    }

    const base64 = imagePart.inlineData.data
    const buffer = Buffer.from(base64, 'base64')

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 4: Upload to S3
    // ═══════════════════════════════════════════════════════════════════════

    const key = `social-generated/selfies/${uuidv4()}.png`

    await s3Client.send(new PutObjectCommand({
      Bucket: process.env.S3_BUCKET_NAME || 'heartbeat-photos-prod',
      Key: key,
      Body: buffer,
      ContentType: 'image/png',
    }))

    const selfieUrl = `https://${process.env.S3_BUCKET_NAME || 'heartbeat-photos-prod'}.s3.amazonaws.com/${key}`
    console.log('[generate-selfie] Selfie uploaded:', selfieUrl)

    // ═══════════════════════════════════════════════════════════════════════
    // RETURN SUCCESS
    // ═══════════════════════════════════════════════════════════════════════

    return NextResponse.json({
      success: true,
      selfieUrl,
      params: selfieParams,
    })

  } catch (error) {
    console.error('[generate-selfie] Unexpected error:', error)
    return NextResponse.json(
      {
        error: 'Failed to generate selfie',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// GET - Health check / info
// ═══════════════════════════════════════════════════════════════════════════

export async function GET() {
  return NextResponse.json({
    endpoint: '/api/admin/social/generate-selfie',
    method: 'POST',
    description: 'Generate a dynamic AI selfie using Gemini 3 Pro Image Preview',
    body: {
      age: 'number (required) - 18-80',
      gender: "'male' | 'female' (required)",
      ethnicity: "'white' | 'black' | 'hispanic' | 'asian' | 'middle eastern' | 'south asian' | 'mixed' (required)",
      angle: "'from below' | 'straight on' | 'from above' | 'side tilt' (required)",
      emotion: "'neutral' | 'slight smile' | 'bittersweet' | 'sad' | 'hopeful' | 'tired' | 'peaceful' (required)",
      gaze: "'looking at camera' | 'looking away' | 'eyes down' | 'looking off to side' (required)",
      setting: "'home' | 'car' | 'outside' | 'office' (required)",
    },
    returns: {
      success: 'boolean',
      selfieUrl: 'string - S3 URL of the generated selfie',
      params: 'object - The parameters used for generation',
    },
  })
}

