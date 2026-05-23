import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

interface GenerateCreationRequest {
  trend_id: string
  slide_count: number
  include_memorial: boolean
  reference_pick_key: string
  add_detail: boolean
  detail_text?: string
  scene_2: string
  scene_3?: string
  scene_4?: string
  note_lines: string[]
  live_photo_slide_orders?: number[]
  sound_name?: string
  sound_url?: string
  memorial_settings?: {
    memorial_scene_type?: string
    memorial_location?: string
    memorial_camera_angle?: string
    memorial_camera_distance?: string
    memorial_inscription?: string
    memorial_headstone_flower_design?: string
    memorial_urn_color?: string
    memorial_keepsake?: string
  }
}

function coalesceLine(lines: string[], index: number): string {
  const value = lines[index]
  return typeof value === 'string' ? value : ''
}

export async function POST(request: NextRequest) {
  try {
    const body: GenerateCreationRequest = await request.json()

    if (!body.trend_id) {
      return NextResponse.json({ error: 'Missing required field: trend_id' }, { status: 400 })
    }
    if (!body.reference_pick_key?.trim()) {
      return NextResponse.json({ error: 'Missing required field: reference_pick_key' }, { status: 400 })
    }
    if (!body.scene_2?.trim()) {
      return NextResponse.json({ error: 'Missing required field: scene_2' }, { status: 400 })
    }

    const slideCount = Math.max(2, Math.min(4, Math.floor(body.slide_count || 4)))
    const includeSlide3 = slideCount >= 3
    const includeSlide4 = slideCount >= 4

    const { data: trend, error: trendError } = await supabase
      .from('social_trends')
      .select('id, sound_name, sound_url')
      .eq('id', body.trend_id)
      .eq('is_active', true)
      .single()

    if (trendError || !trend) {
      return NextResponse.json({ error: 'Trend not found or inactive' }, { status: 404 })
    }

    const { data: engineTemplate, error: templateError } = await supabase
      .from('post_templates')
      .select('id')
      .eq('name', 'Creation Engine')
      .eq('is_active', true)
      .single()

    if (templateError || !engineTemplate?.id) {
      return NextResponse.json(
        { error: 'Creation Engine template not found. Run migrations first.' },
        { status: 500 }
      )
    }

    const detailClause =
      body.add_detail && body.detail_text?.trim()
        ? `Additional requested detail: ${body.detail_text.trim()}.`
        : ' '

    const variables: Record<string, string> = {
      slide_1_reference_pick_key: body.reference_pick_key.trim(),
      slide_1_extra_detail_clause: detailClause,
      scene_2: body.scene_2.trim(),
      scene_3: body.scene_3?.trim() || body.scene_2.trim(),
      scene_4: body.scene_4?.trim() || body.scene_3?.trim() || body.scene_2.trim(),
      include_slide_3: includeSlide3 ? 'yes' : 'no',
      include_slide_4: includeSlide4 ? 'yes' : 'no',
      include_memorial_slide: body.include_memorial ? 'yes' : 'no',
      note_line_1: coalesceLine(body.note_lines || [], 0),
      note_line_2: coalesceLine(body.note_lines || [], 1),
      note_line_3: coalesceLine(body.note_lines || [], 2),
      note_line_4: coalesceLine(body.note_lines || [], 3),
      note_line_5: coalesceLine(body.note_lines || [], 4),
      memorial_scene_type: body.memorial_settings?.memorial_scene_type || 'headstone_classic',
      memorial_location: body.memorial_settings?.memorial_location || 'cemetery',
      memorial_camera_angle: body.memorial_settings?.memorial_camera_angle || 'left',
      memorial_camera_distance: body.memorial_settings?.memorial_camera_distance || 'far',
      memorial_inscription: body.memorial_settings?.memorial_inscription || 'Love you forever',
      memorial_headstone_flower_design:
        body.memorial_settings?.memorial_headstone_flower_design || 'small rose or lily relief',
      memorial_urn_color:
        body.memorial_settings?.memorial_urn_color || 'deep navy blue ceramic with subtle gold accents',
      memorial_keepsake: body.memorial_settings?.memorial_keepsake || '',
    }

    const livePhotoOrders = Array.isArray(body.live_photo_slide_orders)
      ? [...new Set(body.live_photo_slide_orders.filter((order) => [1, 2, 3, 4].includes(order)))]
      : []

    const generateResponse = await fetch(new URL('/api/admin/social/generate-from-template', request.url), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        template_id: engineTemplate.id,
        account_type: 'business',
        variables,
        live_photo_slide_orders: livePhotoOrders,
      }),
    })

    const generated = await generateResponse.json()
    if (!generateResponse.ok) {
      return NextResponse.json(generated, { status: generateResponse.status })
    }

    if (generated?.post_id) {
      await supabase
        .from('social_posts')
        .update({
          audio_track_name: body.sound_name ?? trend.sound_name ?? null,
          audio_track_url: body.sound_url ?? trend.sound_url ?? null,
        })
        .eq('id', generated.post_id)
    }

    return NextResponse.json(generated)
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Failed to generate creation post',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
