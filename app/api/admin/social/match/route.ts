import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { extractPlatformPostId, getPublishedUrlWarnings, MatchPlatform } from '@/lib/socialMatch'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

interface SlideBundleItem {
  order?: number
  url?: string
  image_url?: string
  overlay_text?: string | null
}

interface MatchPost {
  id: string
  created_at: string | null
  pipeline: string | null
  post_type: string | null
  hook_text: string | null
  media_title?: string | null
  template_id?: string | null
  slide_bundle: SlideBundleItem[] | null
  published_url: string | null
  platform: string | null
  platform_post_id: string | null
  posted_at: string | null
}

function parseSlideBundle(slideBundle: unknown): SlideBundleItem[] {
  return Array.isArray(slideBundle) ? slideBundle as SlideBundleItem[] : []
}

function formatTrendName(post: MatchPost, templateName?: string | null): string {
  if (templateName) return templateName
  if (post.media_title) return post.media_title
  if (post.pipeline) return post.pipeline.replace(/_/g, ' ')
  if (post.post_type) return post.post_type.replace(/_/g, ' ')
  return 'Generated post'
}

function summarizePost(post: MatchPost, templateName?: string | null) {
  const slides = parseSlideBundle(post.slide_bundle)
  const orderedSlides = [...slides].sort((a, b) => (a.order || 0) - (b.order || 0))

  return {
    id: post.id,
    created_at: post.created_at,
    trend_name: formatTrendName(post, templateName),
    slide_1_thumbnail: orderedSlides[0]?.image_url || orderedSlides[0]?.url || null,
    overlay_texts: orderedSlides
      .map((slide) => ({
        order: slide.order,
        overlay_text: slide.overlay_text || '',
      }))
      .filter((slide) => slide.overlay_text.trim().length > 0),
    published_url: post.published_url,
    platform: post.platform,
    platform_post_id: post.platform_post_id,
    posted_at: post.posted_at,
  }
}

async function getTemplateName(templateId?: string | null): Promise<string | null> {
  if (!templateId) return null

  const { data } = await supabase
    .from('post_templates')
    .select('name')
    .eq('id', templateId)
    .maybeSingle()

  return data?.name || null
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)

    if (searchParams.get('recent') === 'true') {
      const { data, error } = await supabase
        .from('social_posts')
        .select('*')
        .not('published_url', 'is', null)
        .order('posted_at', { ascending: false, nullsFirst: false })
        .limit(10)

      if (error) {
        return NextResponse.json({ error: 'Failed to fetch recent matches', details: error.message }, { status: 500 })
      }

      const recent = await Promise.all(
        (data || []).map(async (post) => summarizePost(post as MatchPost, await getTemplateName((post as MatchPost).template_id)))
      )

      return NextResponse.json({ recent })
    }

    const postId = searchParams.get('postId')?.trim()
    if (!postId) {
      return NextResponse.json({ error: 'Missing postId' }, { status: 400 })
    }

    const { data: post, error } = await supabase
      .from('social_posts')
      .select('*')
      .eq('id', postId)
      .maybeSingle()

    if (error) {
      return NextResponse.json({ error: 'Failed to fetch post', details: error.message }, { status: 500 })
    }

    if (!post) {
      return NextResponse.json({ post: null })
    }

    const typedPost = post as MatchPost
    return NextResponse.json({ post: summarizePost(typedPost, await getTemplateName(typedPost.template_id)) })
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Failed to load match data',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const postId = String(body.postId || '').trim()
    const platform = String(body.platform || 'tiktok') as MatchPlatform
    const publishedUrl = String(body.publishedUrl || '').trim()
    const overwrite = Boolean(body.overwrite)

    if (!postId) {
      return NextResponse.json({ error: 'Missing postId' }, { status: 400 })
    }

    if (platform !== 'tiktok' && platform !== 'instagram') {
      return NextResponse.json({ error: 'Platform must be tiktok or instagram' }, { status: 400 })
    }

    if (!publishedUrl) {
      return NextResponse.json({ error: 'Missing publishedUrl' }, { status: 400 })
    }

    const { data: existingPost, error: existingError } = await supabase
      .from('social_posts')
      .select('*')
      .eq('id', postId)
      .maybeSingle()

    if (existingError) {
      return NextResponse.json({ error: 'Failed to fetch post', details: existingError.message }, { status: 500 })
    }

    if (!existingPost) {
      return NextResponse.json({ error: 'No post with that ID.' }, { status: 404 })
    }

    const typedExistingPost = existingPost as MatchPost
    if (typedExistingPost.published_url && !overwrite) {
      return NextResponse.json(
        {
          error: 'already_matched',
          existingUrl: typedExistingPost.published_url,
          message: `This post is already matched to ${typedExistingPost.published_url} — overwrite?`,
        },
        { status: 409 }
      )
    }

    const platformPostId = extractPlatformPostId(platform, publishedUrl)
    const warnings = getPublishedUrlWarnings(platform, publishedUrl, platformPostId)

    const { data: updatedPost, error: updateError } = await supabase
      .from('social_posts')
      .update({
        platform,
        published_url: publishedUrl,
        platform_post_id: platformPostId,
        posted_at: new Date().toISOString(),
      })
      .eq('id', postId)
      .select('*')
      .single()

    if (updateError || !updatedPost) {
      return NextResponse.json(
        { error: 'Failed to save match', details: updateError?.message || 'Unknown error' },
        { status: 500 }
      )
    }

    const typedUpdatedPost = updatedPost as MatchPost
    return NextResponse.json({
      success: true,
      warnings,
      post: summarizePost(typedUpdatedPost, await getTemplateName(typedUpdatedPost.template_id)),
    })
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Failed to save match',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
