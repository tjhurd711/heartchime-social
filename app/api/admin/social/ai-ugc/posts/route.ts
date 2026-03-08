import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// ═══════════════════════════════════════════════════════════════════════════
// SUPABASE CLIENT
// ═══════════════════════════════════════════════════════════════════════════

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// ═══════════════════════════════════════════════════════════════════════════
// GET /api/admin/social/ai-ugc/posts
// List posts with optional filters
// ═══════════════════════════════════════════════════════════════════════════

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const personaId = searchParams.get('persona_id')
    const status = searchParams.get('status')
    const platform = searchParams.get('platform')

    let query = supabase
      .from('ai_ugc_posts')
      .select(`
        *,
        ai_ugc_personas (id, name, master_photo_url)
      `)
      .order('created_at', { ascending: false })

    if (personaId) {
      query = query.eq('persona_id', personaId)
    }
    if (status) {
      query = query.eq('status', status)
    }
    if (platform) {
      query = query.eq('platform', platform)
    }

    const { data: posts, error } = await query

    if (error) {
      console.error('[ai-ugc/posts] Error fetching:', error)
      return NextResponse.json({ error: 'Failed to fetch posts' }, { status: 500 })
    }

    // Transform to include persona at top level
    const transformedPosts = posts?.map(post => ({
      ...post,
      persona: post.ai_ugc_personas,
      ai_ugc_personas: undefined,
    }))

    return NextResponse.json({ posts: transformedPosts })
  } catch (error) {
    console.error('[ai-ugc/posts] Unexpected error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch posts', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// POST /api/admin/social/ai-ugc/posts
// Create a new post
// ═══════════════════════════════════════════════════════════════════════════

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      persona_id,
      platform,
      post_type,
      slides,
      caption,
      hook_text,
      card_message,
      scheduled_for,
      notes,
    } = body

    if (!persona_id) {
      return NextResponse.json(
        { error: 'Missing required field: persona_id' },
        { status: 400 }
      )
    }

    const { data: post, error } = await supabase
      .from('ai_ugc_posts')
      .insert({
        persona_id,
        platform,
        post_type: post_type || 'carousel',
        status: 'draft',
        slides,
        caption,
        hook_text,
        card_message,
        scheduled_for,
        notes,
      })
      .select()
      .single()

    if (error) {
      console.error('[ai-ugc/posts] Error creating:', error)
      return NextResponse.json({ error: 'Failed to create post' }, { status: 500 })
    }

    return NextResponse.json({ success: true, post })
  } catch (error) {
    console.error('[ai-ugc/posts] Unexpected error:', error)
    return NextResponse.json(
      { error: 'Failed to create post', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// PATCH /api/admin/social/ai-ugc/posts
// Update a post
// ═══════════════════════════════════════════════════════════════════════════

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json()
    const { id, ...updates } = body

    if (!id) {
      return NextResponse.json({ error: 'Missing post ID' }, { status: 400 })
    }

    const { data: post, error } = await supabase
      .from('ai_ugc_posts')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('[ai-ugc/posts] Error updating:', error)
      return NextResponse.json({ error: 'Failed to update post' }, { status: 500 })
    }

    return NextResponse.json({ success: true, post })
  } catch (error) {
    console.error('[ai-ugc/posts] Unexpected error:', error)
    return NextResponse.json(
      { error: 'Failed to update post', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// DELETE /api/admin/social/ai-ugc/posts
// Delete a post
// ═══════════════════════════════════════════════════════════════════════════

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: 'Missing post ID' }, { status: 400 })
    }

    const { error } = await supabase
      .from('ai_ugc_posts')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('[ai-ugc/posts] Error deleting:', error)
      return NextResponse.json({ error: 'Failed to delete post' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[ai-ugc/posts] Unexpected error:', error)
    return NextResponse.json(
      { error: 'Failed to delete post', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

