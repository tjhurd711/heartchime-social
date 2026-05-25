import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { generateAndUploadPhoto } from '@/lib/geminiImageGen'
import { s3Client } from '@/lib/s3'

export const runtime = 'nodejs'
export const maxDuration = 300

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const LIVE_REFERENCE_SOURCE_BUCKET = 'order-by-age-uploads'
const LIVE_REFERENCE_ALLOWED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.heic', '.webp'])
const OPENAI_EDITS_ENDPOINT = 'https://api.openai.com/v1/images/edits'

const DEFAULT_STYLE_PROMPT =
  'Authentic candid vertical phone photo with awkward-real, non-polished framing. Keep natural blur, imperfect indoor/outdoor lighting, and believable everyday composition. Make this feel like a real personal snapshot (not studio, not stock).'

const CREATION_TEMPLATE_PREFERENCE = [
  'Creation Engine',
  'Creation Engine Astronaut',
  'Creation Engine Drag Path',
] as const

interface TemplateRow {
  name: string
  slides: unknown
}

interface TemplateSlide {
  order?: number
  photo_source?: string
  prompt_recipe?: string
}

interface EngineRunResult {
  ok: boolean
  imageUrl: string | null
  durationMs: number
  error: string | null
}

type EngineTestAction = 'generateBase' | 'runEditComparison'

function applyStyleOnlyReferencePrompt(prompt: string): string {
  const styleOnlyConstraint =
    'STYLE-ONLY REFERENCE LOCK (highest priority): Create another photo just like this reference photo but with different people and a slightly different setting. Other than that the photo should look the exact same - this should not look like a stock photo, if there was glare keep it, if bad lighting keep it, truly only look to make the people different and thats it. RELATIONSHIP LOCK (highest priority): Preserve the same relationship roles and composition from the reference image. Do not swap who is who (for example, father/daughter must stay father/daughter), do not flip generational roles, and do not change the apparent gender role pairing implied by the reference composition. Keep the awkwardness: imperfect lighting, awkward expressions, slight blur/soft focus, and real phone-photo messiness.'

  if (!prompt.trim()) {
    return styleOnlyConstraint
  }

  return `${styleOnlyConstraint}\n\n${prompt}`
}

function isAllowedLiveReferenceKey(key: string): boolean {
  const lower = key.toLowerCase()
  return Array.from(LIVE_REFERENCE_ALLOWED_EXTENSIONS).some((extension) => lower.endsWith(extension))
}

function inferImageMimeTypeFromKey(key: string): string {
  const lower = key.toLowerCase()
  if (lower.endsWith('.png')) return 'image/png'
  if (lower.endsWith('.webp')) return 'image/webp'
  if (lower.endsWith('.heic')) return 'image/heic'
  return 'image/jpeg'
}

function inferImageMimeTypeFromUrl(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl)
    return inferImageMimeTypeFromKey(parsed.pathname)
  } catch {
    return inferImageMimeTypeFromKey(rawUrl)
  }
}

async function mintLiveReferencePresignedUrl(key: string): Promise<string> {
  return getSignedUrl(
    s3Client,
    new GetObjectCommand({
      Bucket: LIVE_REFERENCE_SOURCE_BUCKET,
      Key: key,
    }),
    { expiresIn: 60 * 60 }
  )
}

function getPromptFromTemplateSlides(slides: unknown): string | null {
  if (!Array.isArray(slides)) return null
  const slideOne = (slides as TemplateSlide[]).find((slide) => {
    return slide.order === 1 && slide.photo_source === 'reference_live_pick'
  })
  if (!slideOne?.prompt_recipe || typeof slideOne.prompt_recipe !== 'string') return null
  return slideOne.prompt_recipe.replaceAll('{slide_1_extra_detail_clause}', ' ')
}

async function resolveDefaultStylePrompt(): Promise<string> {
  const { data, error } = await supabase
    .from('post_templates')
    .select('name, slides')
    .in('name', [...CREATION_TEMPLATE_PREFERENCE])
    .eq('is_active', true)

  if (error || !Array.isArray(data)) {
    return DEFAULT_STYLE_PROMPT
  }

  const rows = data as TemplateRow[]
  for (const preferredName of CREATION_TEMPLATE_PREFERENCE) {
    const row = rows.find((candidate) => candidate.name === preferredName)
    const prompt = getPromptFromTemplateSlides(row?.slides)
    if (prompt) return prompt
  }

  for (const row of rows) {
    const prompt = getPromptFromTemplateSlides(row.slides)
    if (prompt) return prompt
  }

  return DEFAULT_STYLE_PROMPT
}

async function runGeminiStyleGeneration(prompt: string, referenceImageUrl: string): Promise<EngineRunResult> {
  const startedAt = Date.now()
  try {
    const imageUrl = await generateAndUploadPhoto(prompt, {
      referenceImageUrl,
      referenceMode: 'style',
    })

    if (!imageUrl) {
      throw new Error('Gemini returned no image')
    }

    return {
      ok: true,
      imageUrl,
      durationMs: Date.now() - startedAt,
      error: null,
    }
  } catch (error) {
    return {
      ok: false,
      imageUrl: null,
      durationMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : 'Gemini generation failed',
    }
  }
}

async function runGeminiEdit(prompt: string, baseImageUrl: string): Promise<EngineRunResult> {
  const startedAt = Date.now()
  try {
    const imageUrl = await generateAndUploadPhoto(prompt, {
      referenceImageUrl: baseImageUrl,
      referenceMode: 'identity',
    })

    if (!imageUrl) {
      throw new Error('Gemini returned no edited image')
    }

    return {
      ok: true,
      imageUrl,
      durationMs: Date.now() - startedAt,
      error: null,
    }
  } catch (error) {
    return {
      ok: false,
      imageUrl: null,
      durationMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : 'Gemini edit failed',
    }
  }
}

async function runGptImageEdits(prompt: string, inputImageUrl: string): Promise<EngineRunResult> {
  const startedAt = Date.now()

  try {
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY not set')
    }

    const inputImageResponse = await fetch(inputImageUrl)
    if (!inputImageResponse.ok) {
      throw new Error(`Failed to fetch input image (${inputImageResponse.status})`)
    }

    const inputImageBuffer = await inputImageResponse.arrayBuffer()
    const contentType = (inputImageResponse.headers.get('content-type') || '').split(';')[0].trim().toLowerCase()
    const mimeType = contentType.startsWith('image/') ? contentType : inferImageMimeTypeFromUrl(inputImageUrl)
    const filename = 'step1-base-input.png'

    const formData = new FormData()
    formData.append('model', 'gpt-image-2')
    formData.append('quality', 'high')
    formData.append('prompt', prompt)
    formData.append('size', '1024x1536')
    formData.append('image', new Blob([inputImageBuffer], { type: mimeType }), filename)

    const response = await fetch(OPENAI_EDITS_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: formData,
    })

    const payload = await response.json()
    if (!response.ok) {
      const message =
        payload?.error?.message ||
        payload?.message ||
        `OpenAI images edits request failed with status ${response.status}`
      throw new Error(message)
    }

    const firstResult = payload?.data?.[0]
    const imageUrl = typeof firstResult?.url === 'string' && firstResult.url.trim()
      ? firstResult.url
      : typeof firstResult?.b64_json === 'string' && firstResult.b64_json.trim()
        ? `data:image/png;base64,${firstResult.b64_json}`
        : null

    if (!imageUrl) {
      throw new Error('OpenAI edits response missing image output')
    }

    return {
      ok: true,
      imageUrl,
      durationMs: Date.now() - startedAt,
      error: null,
    }
  } catch (error) {
    return {
      ok: false,
      imageUrl: null,
      durationMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : 'gpt-image-2 generation failed',
    }
  }
}

export async function GET() {
  const defaultPrompt = await resolveDefaultStylePrompt()
  return NextResponse.json({ defaultPrompt })
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const action = typeof body?.action === 'string' ? (body.action as EngineTestAction) : null

    if (action === 'generateBase') {
      const referenceKey = typeof body?.referenceKey === 'string' ? body.referenceKey.trim() : ''
      const prompt = typeof body?.prompt === 'string' ? body.prompt.trim() : ''

      if (!referenceKey) {
        return NextResponse.json({ error: 'Missing required field: referenceKey' }, { status: 400 })
      }
      if (!prompt) {
        return NextResponse.json({ error: 'Missing required field: prompt' }, { status: 400 })
      }
      if (!isAllowedLiveReferenceKey(referenceKey)) {
        return NextResponse.json({ error: 'Unsupported reference image file type' }, { status: 400 })
      }

      const referenceImageUrl = await mintLiveReferencePresignedUrl(referenceKey)
      const styleLockedPrompt = applyStyleOnlyReferencePrompt(prompt)
      const base = await runGeminiStyleGeneration(styleLockedPrompt, referenceImageUrl)

      return NextResponse.json({
        action,
        referenceImageUrl,
        base,
      })
    }

    if (action === 'runEditComparison') {
      const baseImageUrl = typeof body?.baseImageUrl === 'string' ? body.baseImageUrl.trim() : ''
      const editPrompt = typeof body?.editPrompt === 'string' ? body.editPrompt.trim() : ''

      if (!baseImageUrl) {
        return NextResponse.json({ error: 'Missing required field: baseImageUrl' }, { status: 400 })
      }
      if (!editPrompt) {
        return NextResponse.json({ error: 'Missing required field: editPrompt' }, { status: 400 })
      }

      const [gemini, gptImage2] = await Promise.all([
        runGeminiEdit(editPrompt, baseImageUrl),
        runGptImageEdits(editPrompt, baseImageUrl),
      ])

      return NextResponse.json({
        action,
        inputImageUrl: baseImageUrl,
        geminiInputImageUrl: baseImageUrl,
        gptImage2InputImageUrl: baseImageUrl,
        gptImage2Endpoint: OPENAI_EDITS_ENDPOINT,
        gemini,
        gptImage2,
      })
    }

    return NextResponse.json(
      { error: 'Invalid action. Expected "generateBase" or "runEditComparison".' },
      { status: 400 }
    )
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Failed to run engine test',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
