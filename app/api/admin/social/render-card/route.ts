import { NextRequest, NextResponse } from 'next/server'
import { renderSocialCard, renderAndUploadSocialCard } from '@/lib/socialCardRenderer'

// ═══════════════════════════════════════════════════════════════════════════
// POST /api/admin/social/render-card
// Render a HeartChime card as a 1080x1920 PNG for TikTok/Instagram
// ═══════════════════════════════════════════════════════════════════════════

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { photoUrl, message, uploadToS3 = true } = body

    // Validate required fields
    if (!message) {
      return NextResponse.json(
        { error: 'Missing required field: message' },
        { status: 400 }
      )
    }

    // If uploadToS3 is true (default), render and upload, return URL
    if (uploadToS3) {
      const url = await renderAndUploadSocialCard(photoUrl || '', message)
      
      return NextResponse.json({
        success: true,
        url,
      })
    }

    // Otherwise, render and return the buffer directly as PNG
    const buffer = await renderSocialCard(photoUrl || '', message)

    return new NextResponse(buffer as unknown as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        'Content-Disposition': 'attachment; filename="heartchime-card.png"',
        'Cache-Control': 'no-cache',
      },
    })

  } catch (error) {
    console.error('[render-card] Error:', error)
    
    return NextResponse.json(
      { 
        error: 'Failed to render card',
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
    endpoint: '/api/admin/social/render-card',
    method: 'POST',
    description: 'Render a HeartChime card as a 1080x1920 PNG',
    body: {
      photoUrl: 'string (optional) - URL of the photo to display',
      message: 'string (required) - The message text for the card',
      uploadToS3: 'boolean (default: true) - If true, uploads to S3 and returns URL; if false, returns PNG buffer directly',
    },
    response: {
      withUpload: '{ success: true, url: "https://..." }',
      withoutUpload: 'Raw PNG buffer',
    },
  })
}

