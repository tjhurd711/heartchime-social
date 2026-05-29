import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import { v4 as uuidv4 } from 'uuid'
import { generateAndUploadPhoto } from '@/lib/geminiImageGen'
import {
  HonorMissMode,
  HonorMissSlide,
  MemoryItem,
  RELATION_OPTIONS,
  SLIDE_COUNT_MAX,
  SLIDE_COUNT_MIN,
  VisualType,
  buildCloserImagePrompt,
  buildIntroCaption,
  buildIntroImagePrompt,
  buildItemsPrompt,
  buildMemoryImagePrompt,
  pickCloserCaption,
  s3KeyForSlide,
} from '@/lib/honorMiss'

export const runtime = 'nodejs'
export const maxDuration = 300

// ═══════════════════════════════════════════════════════════════════════════
// CLIENTS
// ═══════════════════════════════════════════════════════════════════════════

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || '',
})

const VALID_VISUAL_TYPES: VisualType[] = ['framed_photo', 'polaroid', 'object_only', 'symbol']

interface GenerateBody {
  mode?: HonorMissMode
  relation?: string
  lovedOneId?: string
  slideCount?: number
  anchors?: string[]
}

function parseItems(raw: string): MemoryItem[] | null {
  let jsonStr = raw.trim()
  if (jsonStr.startsWith('```')) {
    jsonStr = jsonStr.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')
  }
  try {
    const parsed = JSON.parse(jsonStr)
    if (!Array.isArray(parsed)) return null
    return parsed
      .filter((p) => p && typeof p.item === 'string')
      .map((p) => ({
        item: String(p.item).trim(),
        visual_type: VALID_VISUAL_TYPES.includes(p.visual_type) ? p.visual_type : 'symbol',
        image_subject: typeof p.image_subject === 'string' ? p.image_subject.trim() : '',
      }))
  } catch {
    return null
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as GenerateBody
    const mode = body.mode
    const relation = (body.relation || '').trim()
    const slideCount = Number(body.slideCount)
    const anchors = Array.isArray(body.anchors) ? body.anchors.filter((a) => typeof a === 'string') : []

    // ─── Validation ───────────────────────────────────────────────────────
    if (mode !== 'honor' && mode !== 'miss') {
      return NextResponse.json({ error: "mode must be 'honor' or 'miss'" }, { status: 400 })
    }
    if (!relation) {
      return NextResponse.json({ error: 'relation is required' }, { status: 400 })
    }
    if (!Number.isInteger(slideCount) || slideCount < SLIDE_COUNT_MIN || slideCount > SLIDE_COUNT_MAX) {
      return NextResponse.json(
        { error: `slideCount must be an integer between ${SLIDE_COUNT_MIN} and ${SLIDE_COUNT_MAX}` },
        { status: 400 }
      )
    }
    if (!body.lovedOneId) {
      return NextResponse.json({ error: 'lovedOneId is required' }, { status: 400 })
    }

    // ─── Persona / loved one reference ──────────────────────────────────────
    const { data: lovedOne, error: lovedOneError } = await supabase
      .from('ai_ugc_loved_ones')
      .select('*')
      .eq('id', body.lovedOneId)
      .single()

    if (lovedOneError || !lovedOne) {
      return NextResponse.json({ error: 'Persona (loved one) not found' }, { status: 404 })
    }
    if (!lovedOne.master_photo_url) {
      return NextResponse.json({ error: 'Selected persona has no master_photo_url' }, { status: 400 })
    }

    const referenceUrl: string = lovedOne.master_photo_url
    const jobId = uuidv4()

    console.log('[honor-miss/generate] Starting job', jobId, { mode, relation, slideCount })

    // ─── STEP 1: LLM content items ──────────────────────────────────────────
    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({ error: 'LLM service not configured' }, { status: 500 })
    }

    const lovedOneDetails = [lovedOne.occupation, lovedOne.personality]
      .filter(Boolean)
      .join('; ') || null

    const itemsPrompt = buildItemsPrompt({
      mode,
      relation,
      count: slideCount,
      anchors,
      lovedOneName: lovedOne.name,
      lovedOneDetails,
    })

    const llmResponse = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      messages: [{ role: 'user', content: itemsPrompt }],
    })

    const textContent = llmResponse.content.find((c) => c.type === 'text')
    if (!textContent || textContent.type !== 'text') {
      return NextResponse.json({ error: 'No response from LLM' }, { status: 500 })
    }

    const items = parseItems(textContent.text)
    if (!items || items.length === 0) {
      return NextResponse.json(
        { error: 'Failed to parse LLM items', rawResponse: textContent.text },
        { status: 500 }
      )
    }

    const memoryItems = items.slice(0, slideCount)

    // ─── STEP 2: Build slide plan (intro + memories + closer) ───────────────
    const introCaption = buildIntroCaption(mode, slideCount, relation)
    const closerCaption = pickCloserCaption(jobId.charCodeAt(0) + slideCount)
    const totalSlides = memoryItems.length + 2

    const slides: HonorMissSlide[] = []

    // Slide 1 — persona intro selfie
    slides.push({
      order: 1,
      role: 'intro',
      caption: introCaption,
      visual_type: 'framed_photo',
      prompt: buildIntroImagePrompt(),
      uses_reference: true,
      s3_key: null,
      image_url: null,
    })

    // Memory slides
    memoryItems.forEach((item, idx) => {
      const order = idx + 2
      const { prompt, usesReference } = buildMemoryImagePrompt(item, jobId.charCodeAt(idx % jobId.length) + idx)
      slides.push({
        order,
        role: 'memory',
        caption: item.item,
        visual_type: item.visual_type,
        prompt,
        uses_reference: usesReference,
        s3_key: null,
        image_url: null,
      })
    })

    // Final slide — quiet closer
    slides.push({
      order: totalSlides,
      role: 'closer',
      caption: closerCaption,
      visual_type: 'symbol',
      prompt: buildCloserImagePrompt(jobId.charCodeAt(1) + totalSlides),
      uses_reference: false,
      s3_key: null,
      image_url: null,
    })

    // ─── STEP 3: Generate + upload each image ───────────────────────────────
    for (const slide of slides) {
      const key = s3KeyForSlide(jobId, slide.order)
      const url = await generateAndUploadPhoto(slide.prompt, {
        key,
        referenceImageUrl: slide.uses_reference ? referenceUrl : null,
        referenceMode: slide.uses_reference ? 'identity' : undefined,
      })
      if (url) {
        slide.s3_key = key
        slide.image_url = url
      } else {
        console.error('[honor-miss/generate] Image failed for slide', slide.order)
      }
    }

    // ─── STEP 4: Persist job ────────────────────────────────────────────────
    const { data: savedJob, error: insertError } = await supabase
      .from('honor_miss_jobs')
      .insert({
        id: jobId,
        mode,
        relation,
        slide_count: slideCount,
        loved_one_id: lovedOne.id,
        persona_name: lovedOne.name,
        master_photo_url: referenceUrl,
        anchors: anchors.filter((a) => a.trim()),
        items: memoryItems,
        slides,
        intro_caption: introCaption,
        closer_caption: closerCaption,
        status: 'generated',
      })
      .select()
      .single()

    if (insertError) {
      console.error('[honor-miss/generate] Insert error:', insertError)
      return NextResponse.json(
        { error: 'Generated slides but failed to persist job', details: insertError.message, jobId, slides },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true, job: savedJob })
  } catch (error) {
    console.error('[honor-miss/generate] Unexpected error:', error)
    return NextResponse.json(
      { error: 'Failed to generate slideshow', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

export async function GET() {
  return NextResponse.json({
    endpoint: 'POST /api/admin/social/honor-miss/generate',
    body: {
      mode: "'honor' | 'miss'",
      relation: `one of: ${RELATION_OPTIONS.join(', ')}`,
      lovedOneId: 'uuid of an ai_ugc_loved_ones record (provides master_photo_url)',
      slideCount: `${SLIDE_COUNT_MIN}-${SLIDE_COUNT_MAX} memory items (total images = slideCount + 2)`,
      anchors: 'optional string[] of grounding details',
    },
  })
}
