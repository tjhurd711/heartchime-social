import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

function classifyTrendsError(error: { code?: string; message?: string }): string {
  if (error.code === '42P01' || error.message?.toLowerCase().includes('relation "social_trends" does not exist')) {
    return 'missing_table'
  }

  if (
    error.code === '42703' ||
    error.message?.toLowerCase().includes('column') ||
    error.message?.toLowerCase().includes('caption_lines')
  ) {
    return 'schema_mismatch'
  }

  if (
    error.code === '42501' ||
    error.message?.toLowerCase().includes('permission denied') ||
    error.message?.toLowerCase().includes('row-level security')
  ) {
    return 'rls_or_permission'
  }

  return 'unknown'
}

export async function GET() {
  try {
    const { data, error } = await supabase
      .from('social_trends')
      .select('*')
      .eq('is_active', true)
      .order('created_at', { ascending: true })

    if (error) {
      const cause = classifyTrendsError(error)
      console.error('[admin/social/trends] query failed', {
        cause,
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code,
      })

      return NextResponse.json(
        {
          error: 'Failed to load trends',
          cause,
          details: error.message,
          pg: {
            code: error.code ?? null,
            hint: error.hint ?? null,
            details: error.details ?? null,
          },
        },
        { status: 500 }
      )
    }

    return NextResponse.json(data || [])
  } catch (error) {
    console.error('[admin/social/trends] unhandled exception', error)

    return NextResponse.json(
      {
        error: 'Failed to load trends',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
