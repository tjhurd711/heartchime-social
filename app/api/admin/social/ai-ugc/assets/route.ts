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
// GET /api/admin/social/ai-ugc/assets
// List assets with optional filters
// ═══════════════════════════════════════════════════════════════════════════

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const personaId = searchParams.get('persona_id')
    const lovedOneId = searchParams.get('loved_one_id')
    const assetType = searchParams.get('asset_type')
    const era = searchParams.get('era')

    let query = supabase
      .from('ai_ugc_assets')
      .select('*')
      .order('created_at', { ascending: false })

    if (personaId) {
      query = query.eq('persona_id', personaId)
    }
    if (lovedOneId) {
      query = query.eq('loved_one_id', lovedOneId)
    }
    if (assetType) {
      query = query.eq('asset_type', assetType)
    }
    if (era) {
      query = query.eq('era', era)
    }

    const { data: assets, error } = await query

    if (error) {
      console.error('[ai-ugc/assets] Error fetching:', error)
      return NextResponse.json({ error: 'Failed to fetch assets' }, { status: 500 })
    }

    return NextResponse.json({ assets })
  } catch (error) {
    console.error('[ai-ugc/assets] Unexpected error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch assets', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// POST /api/admin/social/ai-ugc/assets
// Create a new asset (manual upload, not generated)
// ═══════════════════════════════════════════════════════════════════════════

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      persona_id,
      loved_one_id,
      asset_type,
      era,
      context,
      s3_url,
      thumbnail_url,
      prompt_used,
      tags,
    } = body

    if (!s3_url || !asset_type) {
      return NextResponse.json(
        { error: 'Missing required fields: s3_url, asset_type' },
        { status: 400 }
      )
    }

    const { data: asset, error } = await supabase
      .from('ai_ugc_assets')
      .insert({
        persona_id,
        loved_one_id,
        asset_type,
        era,
        context,
        s3_url,
        thumbnail_url,
        prompt_used,
        tags: tags || [],
      })
      .select()
      .single()

    if (error) {
      console.error('[ai-ugc/assets] Error creating:', error)
      return NextResponse.json({ error: 'Failed to create asset' }, { status: 500 })
    }

    return NextResponse.json({ success: true, asset })
  } catch (error) {
    console.error('[ai-ugc/assets] Unexpected error:', error)
    return NextResponse.json(
      { error: 'Failed to create asset', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// PATCH /api/admin/social/ai-ugc/assets
// Update an asset (e.g., toggle favorite, add tags)
// ═══════════════════════════════════════════════════════════════════════════

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json()
    const { id, ...updates } = body

    if (!id) {
      return NextResponse.json({ error: 'Missing asset ID' }, { status: 400 })
    }

    const { data: asset, error } = await supabase
      .from('ai_ugc_assets')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('[ai-ugc/assets] Error updating:', error)
      return NextResponse.json({ error: 'Failed to update asset' }, { status: 500 })
    }

    return NextResponse.json({ success: true, asset })
  } catch (error) {
    console.error('[ai-ugc/assets] Unexpected error:', error)
    return NextResponse.json(
      { error: 'Failed to update asset', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// DELETE /api/admin/social/ai-ugc/assets
// Delete an asset
// ═══════════════════════════════════════════════════════════════════════════

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: 'Missing asset ID' }, { status: 400 })
    }

    const { error } = await supabase
      .from('ai_ugc_assets')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('[ai-ugc/assets] Error deleting:', error)
      return NextResponse.json({ error: 'Failed to delete asset' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[ai-ugc/assets] Unexpected error:', error)
    return NextResponse.json(
      { error: 'Failed to delete asset', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

