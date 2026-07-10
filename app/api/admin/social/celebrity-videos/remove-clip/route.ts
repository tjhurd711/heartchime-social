import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

/**
 * Soft-remove a clip from the reel lineup (status=removed).
 * Keeps the S3 object so undo / re-fetch of the same video_id remains possible.
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      clipId?: string
      celebrityName?: string
    }

    const clipId = body.clipId?.trim() || ''
    const celebrityName = body.celebrityName?.trim() || ''

    if (!clipId || !celebrityName) {
      return NextResponse.json(
        { error: 'clipId and celebrityName are required' },
        { status: 400 }
      )
    }

    const { data: target, error: targetError } = await supabase
      .from('celebrity_videos')
      .select('id, phase, status, video_id, celebrity_name')
      .eq('id', clipId)
      .eq('celebrity_name', celebrityName)
      .maybeSingle()

    if (targetError) {
      return NextResponse.json({ error: targetError.message }, { status: 500 })
    }
    if (!target) {
      return NextResponse.json({ error: 'Clip not found' }, { status: 404 })
    }
    if (target.status === 'removed') {
      return NextResponse.json({ ok: true, alreadyRemoved: true, clipId })
    }

    const { data: siblings, error: siblingsError } = await supabase
      .from('celebrity_videos')
      .select('id, phase, status, created_at')
      .eq('celebrity_name', celebrityName)
      .neq('status', 'removed')

    if (siblingsError) {
      return NextResponse.json({ error: siblingsError.message }, { status: 500 })
    }

    const active = (siblings || []).filter((row) => row.id !== clipId)
    if (active.length === 0) {
      return NextResponse.json(
        { error: 'Cannot delete the last remaining clip.' },
        { status: 400 }
      )
    }

    const { error: removeError } = await supabase
      .from('celebrity_videos')
      .update({ status: 'removed', updated_at: new Date().toISOString() })
      .eq('id', clipId)
      .eq('celebrity_name', celebrityName)

    if (removeError) {
      // Fallback when status check constraint does not yet allow 'removed'.
      const { error: deleteError } = await supabase
        .from('celebrity_videos')
        .delete()
        .eq('id', clipId)
        .eq('celebrity_name', celebrityName)
      if (deleteError) {
        return NextResponse.json(
          {
            error: removeError.message,
            details: `Soft-remove failed; row delete also failed: ${deleteError.message}. Apply migration 20260710130000_celebrity_videos_status_removed.sql`,
          },
          { status: 500 }
        )
      }
    }

    let promotedIntroId: string | null = null
    if (target.phase === 'intro') {
      const nextIntro = [...active].sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      )[0]
      if (nextIntro && nextIntro.phase !== 'intro') {
        const { error: promoteError } = await supabase
          .from('celebrity_videos')
          .update({ phase: 'intro', updated_at: new Date().toISOString() })
          .eq('id', nextIntro.id)
        if (promoteError) {
          return NextResponse.json({ error: promoteError.message }, { status: 500 })
        }
        promotedIntroId = nextIntro.id
      }
    }

    return NextResponse.json({
      ok: true,
      clipId,
      promotedIntroId,
    })
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Failed to remove clip',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
