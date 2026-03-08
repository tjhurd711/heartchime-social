import { NextRequest, NextResponse } from 'next/server'
import { renderSlide3, renderAndUploadSlide3, Slide3Type, Slide3Category } from '@/lib/socialSlide3Renderer'

// ═══════════════════════════════════════════════════════════════════════════
// POST /api/admin/social/render-slide3
// Render Slide 3 as 1080x1920 PNG (same as main HeartChime card)
// Two templates based on category:
//   - Music Player (category === 'music') - with Spotify-style overlay
//   - Video Preview (category === 'movies_tv' or 'people') - with title overlay
// ═══════════════════════════════════════════════════════════════════════════

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      mediaImageUrl,
      mediaTitle,
      mediaArtist,
      year,
      slide3Type = 'album_art',
      category,  // Determines which template to render
      message = '',  // The heartchime message (same as Slide 2)
      uploadToS3 = true
    } = body

    // Validate required fields
    if (!mediaImageUrl) {
      return NextResponse.json(
        { error: 'Missing required field: mediaImageUrl' },
        { status: 400 }
      )
    }

    if (!mediaTitle) {
      return NextResponse.json(
        { error: 'Missing required field: mediaTitle' },
        { status: 400 }
      )
    }

    if (!mediaArtist) {
      return NextResponse.json(
        { error: 'Missing required field: mediaArtist' },
        { status: 400 }
      )
    }

    if (!year) {
      return NextResponse.json(
        { error: 'Missing required field: year' },
        { status: 400 }
      )
    }

    // Validate slide3Type
    const validTypes: Slide3Type[] = ['album_art', 'movie_poster']
    if (!validTypes.includes(slide3Type)) {
      return NextResponse.json(
        { error: `Invalid slide3Type. Must be one of: ${validTypes.join(', ')}` },
        { status: 400 }
      )
    }

    // If uploadToS3 is true (default), render and upload, return URL
    if (uploadToS3) {
      const url = await renderAndUploadSlide3(
        mediaImageUrl,
        mediaTitle,
        mediaArtist,
        year,
        slide3Type,
        category as Slide3Category,
        message
      )

      return NextResponse.json({
        success: true,
        url,
        slide3Type,
        category,
      })
    }

    // Otherwise, render and return the buffer directly as PNG
    const buffer = await renderSlide3(
      mediaImageUrl,
      mediaTitle,
      mediaArtist,
      year,
      slide3Type,
      category as Slide3Category,
      message
    )

    return new NextResponse(buffer as unknown as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        'Content-Disposition': 'attachment; filename="slide3.png"',
        'Cache-Control': 'no-cache',
      },
    })

  } catch (error) {
    console.error('[render-slide3] Error:', error)

    return NextResponse.json(
      {
        error: 'Failed to render slide 3',
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
    endpoint: '/api/admin/social/render-slide3',
    method: 'POST',
    description: 'Render Slide 3 as 1080x1920 PNG matching HeartChime card design',
    body: {
      mediaImageUrl: 'string (required) - URL of the album art, movie poster, or person image',
      mediaTitle: 'string (required) - Title of the song, album, movie, or event',
      mediaArtist: 'string (required) - Artist, band, actor, or person name',
      year: 'string (required) - Release year or event year (e.g. "2012")',
      slide3Type: "'album_art' | 'movie_poster' (default: 'album_art')",
      category: "'music' | 'movies_tv' | 'people' (optional) - Determines which template to render",
      message: 'string (optional) - The heartchime message (same as Slide 2)',
      uploadToS3: 'boolean (default: true) - If true, uploads to S3 and returns URL',
    },
    templates: {
      music: 'HeartChime card with Spotify-style overlay (play button, music bars, track info)',
      movies_tv: 'HeartChime card with title overlay on image',
      people: 'HeartChime card with title overlay on image',
    },
    dimensions: '1080x1920 (same as main HeartChime card)',
    response: {
      withUpload: '{ success: true, url: "https://...", slide3Type: "album_art", category: "music" }',
      withoutUpload: 'Raw PNG buffer',
    },
  })
}

