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
// GET /api/admin/social/ai-ugc/personas
// List all personas with their loved ones and stats
// ═══════════════════════════════════════════════════════════════════════════

export async function GET() {
  try {
    // Fetch personas with loved ones
    const { data: personas, error: personasError } = await supabase
      .from('ai_ugc_personas')
      .select(`
        *,
        ai_ugc_loved_ones (*)
      `)
      .order('created_at', { ascending: false })

    if (personasError) {
      console.error('[ai-ugc/personas] Error fetching personas:', personasError)
      return NextResponse.json({ error: 'Failed to fetch personas' }, { status: 500 })
    }

    // Get asset counts for each persona
    const personaIds = personas?.map(p => p.id) || []
    
    const { data: assetCounts } = await supabase
      .from('ai_ugc_assets')
      .select('persona_id')
      .in('persona_id', personaIds)

    const { data: postCounts } = await supabase
      .from('ai_ugc_posts')
      .select('persona_id')
      .in('persona_id', personaIds)

    // Count assets and posts per persona
    const assetCountMap: Record<string, number> = {}
    const postCountMap: Record<string, number> = {}

    assetCounts?.forEach(a => {
      if (a.persona_id) {
        assetCountMap[a.persona_id] = (assetCountMap[a.persona_id] || 0) + 1
      }
    })

    postCounts?.forEach(p => {
      if (p.persona_id) {
        postCountMap[p.persona_id] = (postCountMap[p.persona_id] || 0) + 1
      }
    })

    // Combine data
    const personasWithStats = personas?.map(persona => ({
      ...persona,
      loved_ones: persona.ai_ugc_loved_ones || [],
      asset_count: assetCountMap[persona.id] || 0,
      post_count: postCountMap[persona.id] || 0,
    }))

    return NextResponse.json({ personas: personasWithStats })
  } catch (error) {
    console.error('[ai-ugc/personas] Unexpected error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch personas', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// POST /api/admin/social/ai-ugc/personas
// Create a new persona
// ═══════════════════════════════════════════════════════════════════════════

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      name,
      age,
      birth_year,
      gender,
      ethnicity,
      location,
      job,
      vibe,
      master_photo_url,
      elevenlabs_voice_id,
      instagram_handle,
      tiktok_handle,
    } = body

    // Validate required fields
    if (!name || !age || !birth_year || !master_photo_url) {
      return NextResponse.json(
        { error: 'Missing required fields: name, age, birth_year, master_photo_url' },
        { status: 400 }
      )
    }

    const { data: persona, error } = await supabase
      .from('ai_ugc_personas')
      .insert({
        name,
        age,
        birth_year,
        gender: gender || 'female',
        ethnicity,
        location,
        job,
        vibe,
        master_photo_url,
        elevenlabs_voice_id,
        instagram_handle,
        tiktok_handle,
      })
      .select()
      .single()

    if (error) {
      console.error('[ai-ugc/personas] Error creating persona:', error)
      return NextResponse.json({ error: 'Failed to create persona' }, { status: 500 })
    }

    return NextResponse.json({ success: true, persona })
  } catch (error) {
    console.error('[ai-ugc/personas] Unexpected error:', error)
    return NextResponse.json(
      { error: 'Failed to create persona', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// PATCH /api/admin/social/ai-ugc/personas
// Update an existing persona
// ═══════════════════════════════════════════════════════════════════════════

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json()
    const { id, ...updates } = body

    if (!id) {
      return NextResponse.json({ error: 'Missing persona ID' }, { status: 400 })
    }

    const { data: persona, error } = await supabase
      .from('ai_ugc_personas')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('[ai-ugc/personas] Error updating persona:', error)
      return NextResponse.json({ error: 'Failed to update persona' }, { status: 500 })
    }

    return NextResponse.json({ success: true, persona })
  } catch (error) {
    console.error('[ai-ugc/personas] Unexpected error:', error)
    return NextResponse.json(
      { error: 'Failed to update persona', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// DELETE /api/admin/social/ai-ugc/personas
// Delete a persona
// ═══════════════════════════════════════════════════════════════════════════

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: 'Missing persona ID' }, { status: 400 })
    }

    const { error } = await supabase
      .from('ai_ugc_personas')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('[ai-ugc/personas] Error deleting persona:', error)
      return NextResponse.json({ error: 'Failed to delete persona' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[ai-ugc/personas] Unexpected error:', error)
    return NextResponse.json(
      { error: 'Failed to delete persona', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

