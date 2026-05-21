import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { data, error } = await supabase
      .from('post_templates')
      .select('id, name, category, account_type, slide_count, description, variables_schema, slides, live_photo_supported, audio_track_name, audio_track_url, reference_video_url, reference_photos')
      .eq('id', id)
      .eq('is_active', true)
      .single()

    if (error || !data) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 })
    }

    return NextResponse.json(data)
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Failed to fetch template',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}

interface ReferencePhoto {
  order?: number
  url: string
  label?: string
}

interface UpdateTemplateBody {
  audio_track_name?: string | null
  audio_track_url?: string | null
  reference_video_url?: string | null
  reference_photos?: ReferencePhoto[]
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body: UpdateTemplateBody = await request.json()
    const {
      audio_track_name = null,
      audio_track_url = null,
      reference_video_url = null,
      reference_photos = [],
    } = body

    const normalizedPhotos = Array.isArray(reference_photos)
      ? reference_photos
          .filter((photo) => photo && typeof photo.url === 'string' && photo.url.trim().length > 0)
          .map((photo, index) => ({
            order: typeof photo.order === 'number' ? photo.order : index + 1,
            url: photo.url.trim(),
            label: typeof photo.label === 'string' ? photo.label.trim() : '',
          }))
      : []

    const { data, error } = await supabase
      .from('post_templates')
      .update({
        audio_track_name: audio_track_name?.trim() || null,
        audio_track_url: audio_track_url?.trim() || null,
        reference_video_url: reference_video_url?.trim() || null,
        reference_photos: normalizedPhotos,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select('id')
      .single()

    if (error || !data) {
      return NextResponse.json(
        { error: 'Failed to update template', details: error?.message || 'Template not found' },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true, id: data.id })
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Failed to update template',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
