import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

function slugifyCelebrityName(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug || 'unknown'
}

/** Create a pending fetch job for home-PC workers. */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      celebrityName?: string
      mode?: string
      params?: Record<string, unknown>
    }

    const celebrityName = body.celebrityName?.trim() || ''
    if (!celebrityName) {
      return NextResponse.json({ error: 'celebrityName is required' }, { status: 400 })
    }

    const mode = (body.mode || 'fetch').trim().toLowerCase()
    if (!['fetch', 'replace', 'add'].includes(mode)) {
      return NextResponse.json(
        { error: 'mode must be fetch, replace, or add' },
        { status: 400 }
      )
    }

    const celebritySlug = slugifyCelebrityName(celebrityName)
    const params = {
      mode,
      celebrityName,
      ...(body.params && typeof body.params === 'object' ? body.params : {}),
    }

    // Clear in-flight rows so a new worker fetch starts clean (same as local-fetch).
    if (mode === 'fetch') {
      await supabase
        .from('celebrity_videos')
        .delete()
        .eq('celebrity_name', celebrityName)
        .in('status', ['failed', 'downloading', 'searching'])
    }

    const { data, error } = await supabase
      .from('fetch_jobs')
      .insert({
        celebrity_slug: celebritySlug,
        params,
        status: 'pending',
      })
      .select('*')
      .single()

    if (error) {
      return NextResponse.json(
        {
          error: error.message,
          details:
            error.message.includes('fetch_jobs') || error.code === '42P01'
              ? 'Apply migration 20260710140000_create_fetch_jobs.sql'
              : undefined,
        },
        { status: 500 }
      )
    }

    return NextResponse.json(
      {
        job: data,
        jobId: data.id,
        status: data.status,
      },
      { status: 202 }
    )
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Failed to enqueue fetch job',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}

/** Poll a fetch job by id (optional celebritySlug lists recent jobs). */
export async function GET(request: NextRequest) {
  try {
    const jobId = request.nextUrl.searchParams.get('jobId')?.trim() || ''
    const celebritySlug = request.nextUrl.searchParams.get('celebritySlug')?.trim() || ''

    if (jobId) {
      const { data, error } = await supabase
        .from('fetch_jobs')
        .select('*')
        .eq('id', jobId)
        .maybeSingle()

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
      if (!data) {
        return NextResponse.json({ error: 'Job not found' }, { status: 404 })
      }
      return NextResponse.json({ job: data })
    }

    if (celebritySlug) {
      const { data, error } = await supabase
        .from('fetch_jobs')
        .select('*')
        .eq('celebrity_slug', celebritySlug)
        .order('created_at', { ascending: false })
        .limit(5)

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
      return NextResponse.json({ jobs: data || [] })
    }

    return NextResponse.json(
      { error: 'jobId or celebritySlug query param is required' },
      { status: 400 }
    )
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Failed to load fetch job',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
