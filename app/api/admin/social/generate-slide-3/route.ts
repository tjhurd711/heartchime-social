import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { renderAndUploadSlide3 } from '@/lib/socialSlide3Renderer'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

interface GenerateSlide3Request {
  postId: string
  slide3Type: 'album_art' | 'movie_poster'
  slide3ImageUrl: string
  slide3Title: string
  slide3Artist?: string
}

export async function POST(request: NextRequest) {
  try {
    const body: GenerateSlide3Request = await request.json()
    const { postId, slide3Type, slide3ImageUrl, slide3Title, slide3Artist } = body

    console.log('[generate-slide-3] Starting for post:', postId)

    if (!postId || !slide3ImageUrl || !slide3Title) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      )
    }

    // Fetch the post to verify it exists and get the card message for Slide 3
    const { data: post, error: postError } = await supabase
      .from('social_posts')
      .select('id, slide_3_url, card_message')
      .eq('id', postId)
      .single()

    if (postError || !post) {
      console.error('[generate-slide-3] Post not found:', postError)
      return NextResponse.json(
        { success: false, error: 'Post not found' },
        { status: 404 }
      )
    }

    if (post.slide_3_url) {
      return NextResponse.json(
        { success: false, error: 'Post already has a Slide 3' },
        { status: 400 }
      )
    }

    // For movies, slide3Artist is the year. For music, slide3Artist is the artist name
    const year = slide3Type === 'movie_poster' ? (slide3Artist || '') : ''
    const artist = slide3Type === 'album_art' ? (slide3Artist || '') : ''
    
    // Set category based on slide type - this determines which template is used
    // 'music' category = Spotify-style player with green play button and music bars
    // 'movies_tv' category = Movie poster style with title overlay
    const category = slide3Type === 'album_art' ? 'music' : 'movies_tv'

    // Render and upload Slide 3
    console.log('[generate-slide-3] Rendering slide 3 with category:', category)
    const slide3Url = await renderAndUploadSlide3(
      slide3ImageUrl,
      slide3Title,
      artist,
      year,
      slide3Type,
      category, // Pass category so it uses the correct template
      post.card_message || '' // Use the same message as Slide 2
    )
    console.log('[generate-slide-3] Slide 3 uploaded:', slide3Url)

    // Update the post with the new slide 3 URL
    const { error: updateError } = await supabase
      .from('social_posts')
      .update({ slide_3_url: slide3Url })
      .eq('id', postId)

    if (updateError) {
      console.error('[generate-slide-3] Failed to update post:', updateError)
      return NextResponse.json(
        { success: false, error: 'Failed to save Slide 3' },
        { status: 500 }
      )
    }

    console.log('[generate-slide-3] Complete!')
    return NextResponse.json({
      success: true,
      slide3Url,
    })
  } catch (error) {
    console.error('[generate-slide-3] Error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to generate Slide 3' },
      { status: 500 }
    )
  }
}

