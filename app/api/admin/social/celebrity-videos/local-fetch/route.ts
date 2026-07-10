import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import {
  isLocalClipFetchEnabled,
  runLocalCelebrityClipFetch,
} from '@/lib/localCelebrityClipFetch'

export const runtime = 'nodejs'
export const maxDuration = 300

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function GET() {
  return NextResponse.json({ available: isLocalClipFetchEnabled() })
}

export async function POST(request: NextRequest) {
  if (!isLocalClipFetchEnabled()) {
    return NextResponse.json(
      { error: 'Local clip fetch is only available in development.' },
      { status: 403 }
    )
  }

  try {
    const body = (await request.json()) as { celebrityName?: string }
    const celebrityName = body.celebrityName?.trim() || ''

    if (!celebrityName) {
      return NextResponse.json({ error: 'celebrityName is required' }, { status: 400 })
    }

    await supabase
      .from('celebrity_videos')
      .delete()
      .eq('celebrity_name', celebrityName)
      .in('status', ['failed', 'downloading', 'searching'])

    const outcome = runLocalCelebrityClipFetch(celebrityName)

    if (!outcome.ok) {
      return NextResponse.json(
        {
          error: outcome.error || 'Local clip fetch failed',
          cookiesPath: outcome.cookiesPath,
          result: outcome.result,
        },
        { status: 502 }
      )
    }

    return NextResponse.json({
      celebrityName,
      status: 'ready',
      source: 'local',
      cookiesPath: outcome.cookiesPath,
      readyCount: outcome.result?.readyCount ?? 0,
      result: outcome.result,
    })
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Local clip fetch failed',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
