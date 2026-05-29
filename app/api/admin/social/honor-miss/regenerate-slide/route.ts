import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { generateAndUploadPhoto } from '@/lib/geminiImageGen'
import { HonorMissSlide, s3KeyForSlide } from '@/lib/honorMiss'

export const runtime = 'nodejs'
export const maxDuration = 120

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

interface RegenerateBody {
  jobId?: string
  order?: number
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as RegenerateBody
    const jobId = body.jobId
    const order = Number(body.order)

    if (!jobId) {
      return NextResponse.json({ error: 'jobId is required' }, { status: 400 })
    }
    if (!Number.isInteger(order) || order < 1) {
      return NextResponse.json({ error: 'order must be a positive integer' }, { status: 400 })
    }

    const { data: job, error: jobError } = await supabase
      .from('honor_miss_jobs')
      .select('*')
      .eq('id', jobId)
      .single()

    if (jobError || !job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 })
    }

    const slides = (job.slides || []) as HonorMissSlide[]
    const slide = slides.find((s) => s.order === order)
    if (!slide) {
      return NextResponse.json({ error: `Slide ${order} not found in job` }, { status: 404 })
    }

    // Regenerate into a versioned key so caches/CDNs do not serve the stale image.
    const key = `${s3KeyForSlide(jobId, order).replace(/\.png$/, '')}-r${Date.now()}.png`

    const url = await generateAndUploadPhoto(slide.prompt, {
      key,
      referenceImageUrl: slide.uses_reference ? job.master_photo_url : null,
      referenceMode: slide.uses_reference ? 'identity' : undefined,
    })

    if (!url) {
      return NextResponse.json({ error: 'Image generation failed' }, { status: 502 })
    }

    const updatedSlides = slides.map((s) =>
      s.order === order ? { ...s, s3_key: key, image_url: url } : s
    )

    const { data: updatedJob, error: updateError } = await supabase
      .from('honor_miss_jobs')
      .update({ slides: updatedSlides })
      .eq('id', jobId)
      .select()
      .single()

    if (updateError) {
      return NextResponse.json(
        { error: 'Regenerated image but failed to persist', details: updateError.message, image_url: url },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true, order, image_url: url, s3_key: key, job: updatedJob })
  } catch (error) {
    console.error('[honor-miss/regenerate-slide] Unexpected error:', error)
    return NextResponse.json(
      { error: 'Failed to regenerate slide', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
