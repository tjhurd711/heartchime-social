import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

interface PatchBody {
  posted_tiktok?: unknown
  posted_instagram?: unknown
  posted_facebook?: unknown
  posted_url?: unknown
  notes?: unknown
}

type BaitPostedState = {
  posted_tiktok: boolean | null
  posted_instagram: boolean | null
  posted_facebook: boolean | null
  posted_at: string | null
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean'
}

function isNullableString(value: unknown): value is string | null {
  return typeof value === 'string' || value === null
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    if (!id) {
      return NextResponse.json({ error: 'Missing bait library id.' }, { status: 400 })
    }

    const body = (await request.json()) as PatchBody
    const updates: Record<string, unknown> = {}

    if (body.posted_tiktok !== undefined) {
      if (!isBoolean(body.posted_tiktok)) {
        return NextResponse.json({ error: 'posted_tiktok must be a boolean.' }, { status: 400 })
      }
      updates.posted_tiktok = body.posted_tiktok
    }

    if (body.posted_instagram !== undefined) {
      if (!isBoolean(body.posted_instagram)) {
        return NextResponse.json({ error: 'posted_instagram must be a boolean.' }, { status: 400 })
      }
      updates.posted_instagram = body.posted_instagram
    }

    if (body.posted_facebook !== undefined) {
      if (!isBoolean(body.posted_facebook)) {
        return NextResponse.json({ error: 'posted_facebook must be a boolean.' }, { status: 400 })
      }
      updates.posted_facebook = body.posted_facebook
    }

    if (body.posted_url !== undefined) {
      if (!isNullableString(body.posted_url)) {
        return NextResponse.json({ error: 'posted_url must be a string or null.' }, { status: 400 })
      }
      updates.posted_url = body.posted_url
    }

    if (body.notes !== undefined) {
      if (!isNullableString(body.notes)) {
        return NextResponse.json({ error: 'notes must be a string or null.' }, { status: 400 })
      }
      updates.notes = body.notes
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        {
          error:
            'No valid fields provided. Supported fields: posted_tiktok, posted_instagram, posted_facebook, posted_url, notes.',
        },
        { status: 400 }
      )
    }

    const { data: currentRow, error: currentError } = await supabase
      .from('bait_library')
      .select('posted_tiktok, posted_instagram, posted_facebook, posted_at')
      .eq('id', id)
      .single<BaitPostedState>()

    if (currentError || !currentRow) {
      return NextResponse.json(
        { error: 'Failed to load bait library item.', details: currentError?.message || 'Not found.' },
        { status: currentError?.code === 'PGRST116' ? 404 : 500 }
      )
    }

    const flippedToTrue =
      (updates.posted_tiktok === true && !currentRow.posted_tiktok) ||
      (updates.posted_instagram === true && !currentRow.posted_instagram) ||
      (updates.posted_facebook === true && !currentRow.posted_facebook)

    if (!currentRow.posted_at && flippedToTrue) {
      updates.posted_at = new Date().toISOString()
    }

    const { data: updatedRow, error: updateError } = await supabase
      .from('bait_library')
      .update(updates)
      .eq('id', id)
      .select(
        'id, handle, tiktok_url, s3_key, media_type, used, created_at, posted_tiktok, posted_instagram, posted_facebook, posted_at, posted_url, notes'
      )
      .single()

    if (updateError || !updatedRow) {
      return NextResponse.json(
        { error: 'Failed to update bait library item.', details: updateError?.message || 'Unknown error.' },
        { status: 500 }
      )
    }

    return NextResponse.json({ item: updatedRow })
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Failed to update bait library item.',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
