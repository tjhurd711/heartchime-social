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
// GET /api/admin/social/ai-ugc/loved-ones
// List loved ones (optionally filtered by persona)
// ═══════════════════════════════════════════════════════════════════════════

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const personaId = searchParams.get('persona_id')

    let query = supabase
      .from('ai_ugc_loved_ones')
      .select('*')
      .order('created_at', { ascending: false })

    if (personaId) {
      query = query.eq('persona_id', personaId)
    }

    const { data: lovedOnes, error } = await query

    if (error) {
      console.error('[ai-ugc/loved-ones] Error fetching:', error)
      return NextResponse.json({ error: 'Failed to fetch loved ones' }, { status: 500 })
    }

    return NextResponse.json({ loved_ones: lovedOnes })
  } catch (error) {
    console.error('[ai-ugc/loved-ones] Unexpected error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch loved ones', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// POST /api/admin/social/ai-ugc/loved-ones
// Create a new loved one
// ═══════════════════════════════════════════════════════════════════════════

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      persona_id,
      name,
      relationship,
      gender,
      age_at_death,
      birth_year,
      death_year,
      master_photo_url,
      keywords,
      personality_traits,
    } = body

    // Validate required fields
    if (!persona_id || !name || !relationship || !age_at_death || !birth_year || !death_year || !master_photo_url) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    const { data: lovedOne, error } = await supabase
      .from('ai_ugc_loved_ones')
      .insert({
        persona_id,
        name,
        relationship,
        gender: gender || 'female',
        age_at_death,
        birth_year,
        death_year,
        master_photo_url,
        keywords: keywords || [],
        personality_traits: personality_traits || [],
      })
      .select()
      .single()

    if (error) {
      console.error('[ai-ugc/loved-ones] Error creating:', error)
      return NextResponse.json({ error: 'Failed to create loved one' }, { status: 500 })
    }

    return NextResponse.json({ success: true, loved_one: lovedOne })
  } catch (error) {
    console.error('[ai-ugc/loved-ones] Unexpected error:', error)
    return NextResponse.json(
      { error: 'Failed to create loved one', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// PATCH /api/admin/social/ai-ugc/loved-ones
// Update an existing loved one
// ═══════════════════════════════════════════════════════════════════════════

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json()
    const { id, ...updates } = body

    if (!id) {
      return NextResponse.json({ error: 'Missing loved one ID' }, { status: 400 })
    }

    const { data: lovedOne, error } = await supabase
      .from('ai_ugc_loved_ones')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('[ai-ugc/loved-ones] Error updating:', error)
      return NextResponse.json({ error: 'Failed to update loved one' }, { status: 500 })
    }

    return NextResponse.json({ success: true, loved_one: lovedOne })
  } catch (error) {
    console.error('[ai-ugc/loved-ones] Unexpected error:', error)
    return NextResponse.json(
      { error: 'Failed to update loved one', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// DELETE /api/admin/social/ai-ugc/loved-ones
// Delete a loved one
// ═══════════════════════════════════════════════════════════════════════════

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: 'Missing loved one ID' }, { status: 400 })
    }

    const { error } = await supabase
      .from('ai_ugc_loved_ones')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('[ai-ugc/loved-ones] Error deleting:', error)
      return NextResponse.json({ error: 'Failed to delete loved one' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[ai-ugc/loved-ones] Unexpected error:', error)
    return NextResponse.json(
      { error: 'Failed to delete loved one', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

