import { NextRequest, NextResponse } from 'next/server'
import { renderSlide1, renderAndUploadSlide1, TextStyle } from '@/lib/socialSlide1Renderer'

// ═══════════════════════════════════════════════════════════════════════════
// POST /api/admin/social/render-slide1
// Render Slide 1 (recipient photo + hook text) as 1080x1920 PNG
// ═══════════════════════════════════════════════════════════════════════════

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { 
      recipientPhotoUrl, 
      hookText, 
      style = 'snapchat',
      uploadToS3 = true,
      eventDate  // Optional — ISO date string for Live Past date stamp
    } = body

    // Validate required fields
    if (!recipientPhotoUrl) {
      return NextResponse.json(
        { error: 'Missing required field: recipientPhotoUrl' },
        { status: 400 }
      )
    }

    if (!hookText) {
      return NextResponse.json(
        { error: 'Missing required field: hookText' },
        { status: 400 }
      )
    }

    // Validate style
    const validStyles: TextStyle[] = ['snapchat', 'clean']
    if (!validStyles.includes(style)) {
      return NextResponse.json(
        { error: `Invalid style. Must be one of: ${validStyles.join(', ')}` },
        { status: 400 }
      )
    }

    // If uploadToS3 is true (default), render and upload, return URL
    if (uploadToS3) {
      const url = await renderAndUploadSlide1(recipientPhotoUrl, hookText, style, eventDate)
      
      return NextResponse.json({
        success: true,
        url,
        style,
        ...(eventDate && { eventDate }),
      })
    }

    // Otherwise, render and return the buffer directly as PNG
    const buffer = await renderSlide1(recipientPhotoUrl, hookText, style, eventDate)

    return new NextResponse(buffer as unknown as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        'Content-Disposition': 'attachment; filename="slide1.png"',
        'Cache-Control': 'no-cache',
      },
    })

  } catch (error) {
    console.error('[render-slide1] Error:', error)
    
    return NextResponse.json(
      { 
        error: 'Failed to render slide 1',
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
    endpoint: '/api/admin/social/render-slide1',
    method: 'POST',
    description: 'Render Slide 1 (recipient photo + hook text overlay) as 1080x1920 PNG',
    body: {
      recipientPhotoUrl: 'string (required) - URL of the recipient photo',
      hookText: 'string (required) - The hook text to overlay on the photo',
      style: "'snapchat' | 'clean' (default: 'snapchat') - Text overlay style",
      uploadToS3: 'boolean (default: true) - If true, uploads to S3 and returns URL',
      eventDate: 'string (optional) - ISO date for Live Past date stamp overlay (e.g. "2012-02-11")',
    },
    styles: {
      snapchat: 'White text with black stroke, slight rotation, bold casual font',
      clean: 'White uppercase text with semi-transparent black pill background',
    },
    response: {
      withUpload: '{ success: true, url: "https://...", style: "snapchat" }',
      withoutUpload: 'Raw PNG buffer',
    },
  })
}

