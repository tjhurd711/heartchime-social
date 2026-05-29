import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import { v4 as uuidv4 } from 'uuid'
import {
  HonorMissMode,
  HonorMissPerspective,
  HonorMissSlide,
  MemoryItem,
  RELATION_OPTIONS,
  SLIDE_COUNT_MAX,
  SLIDE_COUNT_MIN,
  VisualType,
  buildCloserImagePrompt,
  buildFramedPhotoCaption,
  buildIntroCaption,
  buildIntroImagePrompt,
  buildItemsPrompt,
  buildMemoryImagePrompt,
  pickCloserCaption,
} from '@/lib/honorMiss'
import { generateHonorMissSlideImage } from '@/lib/honorMissImagePipeline'

export const runtime = 'nodejs'
export const maxDuration = 600

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
  // Optional 1–10 blurriness level for the faded interior of framed/polaroid photos.
  blurLevel?: number
  // Tribute perspective. 'first_person' (default) = persona is the griever, persona
  // face everywhere. 'third_person' = persona narrates, subject reference used for
  // framed/polaroid memory slides.
  perspective?: HonorMissPerspective
  subjectName?: string
  subjectMasterPhotoUrl?: string
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
    const perspective: HonorMissPerspective = body.perspective === 'third_person' ? 'third_person' : 'first_person'
    const subjectName = (body.subjectName || '').trim()
    const subjectMasterPhotoUrl = (body.subjectMasterPhotoUrl || '').trim()

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
    if (perspective === 'third_person' && !subjectMasterPhotoUrl) {
      return NextResponse.json(
        { error: 'subjectMasterPhotoUrl is required for third-person tribute mode' },
        { status: 400 }
      )
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
      perspective,
      subjectName: subjectName || null,
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

    // The intro anchor is a style replica (not a real framed photo), so guarantee
    // at least one genuine framed_photo among the memory slides. Prefer promoting a
    // polaroid (also a person-centered shot); otherwise promote the first item.
    if (memoryItems.length > 0 && !memoryItems.some((it) => it.visual_type === 'framed_photo')) {
      const polaroidIdx = memoryItems.findIndex((it) => it.visual_type === 'polaroid')
      const promoteIdx = polaroidIdx >= 0 ? polaroidIdx : 0
      memoryItems[promoteIdx] = { ...memoryItems[promoteIdx], visual_type: 'framed_photo' }
    }

    // ─── STEP 2: Build slide plan (intro + memories + closer) ───────────────
    const introCaption = buildIntroCaption(mode, slideCount, relation)
    const closerCaption = pickCloserCaption(jobId.charCodeAt(0) + slideCount)
    const totalSlides = memoryItems.length + 2

    const slides: HonorMissSlide[] = []

    // Slide 1 — persona/subject anchor (clean Gemini identity photo)
    slides.push({
      order: 1,
      role: 'intro',
      caption: introCaption,
      visual_type: 'framed_photo',
      prompt: buildIntroImagePrompt(),
      uses_reference: true,
      s3_key: null,
      image_url: null,
      image_subject: '',
    })

    // Memory slides
    memoryItems.forEach((item, idx) => {
      const order = idx + 2
      const seed = jobId.charCodeAt(idx % jobId.length) + idx
      const { prompt, usesReference } = buildMemoryImagePrompt(item, seed)
      // Framed photos get a hardcoded "photo of them" caption; others use the LLM line.
      const caption = item.visual_type === 'framed_photo' ? buildFramedPhotoCaption(relation, seed) : item.item
      slides.push({
        order,
        role: 'memory',
        caption,
        visual_type: item.visual_type,
        prompt,
        uses_reference: usesReference,
        s3_key: null,
        image_url: null,
        image_subject: item.image_subject || '',
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
      image_subject: '',
    })

    // ─── STEP 3: Generate + upload each image (two-model pipeline) ───────────
    const blurLevel = Number.isFinite(Number(body.blurLevel)) ? Number(body.blurLevel) : undefined
    // Third-person tributes render the subject in framed/polaroid memory slides;
    // the intro anchor always uses the persona reference.
    const subjectReferenceUrl = perspective === 'third_person' ? subjectMasterPhotoUrl : null

    // One failing slide must not fail the whole job; failures are surfaced so the
    // user can regenerate those slides individually.
    const failedSlides: number[] = []
    const applyResult = (slide: HonorMissSlide, settled: PromiseSettledResult<Awaited<ReturnType<typeof generateHonorMissSlideImage>>>) => {
      if (settled.status === 'fulfilled' && settled.value.url) {
        slide.s3_key = settled.value.s3Key
        slide.image_url = settled.value.url
      } else {
        failedSlides.push(slide.order)
        if (settled.status === 'rejected') {
          console.error('[honor-miss/generate] Image generation rejected for slide', slide.order, settled.reason)
        } else {
          console.error('[honor-miss/generate] Image failed for slide', slide.order)
        }
      }
    }

    // Generate the intro/anchor FIRST so its generated "copy" (different people)
    // can serve as the identity reference for every framed_photo/polaroid memory
    // slide. This keeps the whole slideshow on one consistent fictional face
    // instead of re-referencing the original S3 photo (the real person).
    const introSlide = slides.find((s) => s.role === 'intro')
    let anchorImageUrl: string | null = null
    if (introSlide) {
      const [introSettled] = await Promise.allSettled([
        generateHonorMissSlideImage({ jobId, slide: introSlide, referenceUrl, subjectReferenceUrl, blurLevel }),
      ])
      applyResult(introSlide, introSettled)
      anchorImageUrl = introSlide.image_url
    }

    // Then run the remaining slides concurrently, referencing the anchor copy.
    // S3 keys are deterministic per slide order, so execution order does not
    // matter — only the awaited results.
    const restSlides = slides.filter((s) => s.role !== 'intro')
    const restResults = await Promise.allSettled(
      restSlides.map((slide) =>
        generateHonorMissSlideImage({ jobId, slide, referenceUrl, subjectReferenceUrl, anchorImageUrl, blurLevel })
      )
    )
    restResults.forEach((settled, idx) => applyResult(restSlides[idx], settled))
    failedSlides.sort((a, b) => a - b)

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
        subject_name: subjectName || null,
        subject_master_photo_url: subjectMasterPhotoUrl || null,
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

    return NextResponse.json({ success: true, job: savedJob, failedSlides })
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
      perspective: "'first_person' (default) | 'third_person'",
      subjectName: 'optional subject name for third-person tributes (e.g. "Dad")',
      subjectMasterPhotoUrl: 'required for third_person — S3 URL of the subject reference photo',
    },
  })
}
