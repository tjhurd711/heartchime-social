import { NextRequest, NextResponse } from 'next/server'
import { generateAndUploadPhoto } from '@/lib/geminiImageGen'
import { generateAndUploadGptImageEdit } from '@/lib/openaiImageGen'
import { mintLiveReferencePresignedUrl } from '@/lib/socialReferenceS3'
import { applyPhotoGenerationStyle } from '@/lib/socialPhotoStyle'

type ImageProvider = 'google' | 'openai'

interface GenerateReferencePhotoRequest {
  referenceKey?: string
  referenceImageUrl?: string
  prompt?: string
  activity?: string
  detail?: string
  blurLevel?: number
  ageDeltaYears?: number
  photoFilterStyle?: 'none' | 'black_and_white' | 'old_timey' | 'faded_film'
  mode?: 'style' | 'identity'
  provider?: ImageProvider
  jobId?: string
}

function parseS3KeyFromUrl(rawUrl: string): string | null {
  try {
    const parsed = new URL(rawUrl)
    const key = decodeURIComponent(parsed.pathname.replace(/^\/+/, ''))
    return key || null
  } catch {
    return null
  }
}

function clampBlurLevel(raw: number | undefined): number {
  if (!Number.isFinite(raw)) return 1
  return Math.min(10, Math.max(1, Math.floor(raw || 1)))
}

function clampAgeDeltaYears(raw: number | undefined): number {
  if (!Number.isFinite(raw)) return 0
  return Math.min(60, Math.max(-60, Math.floor(raw || 0)))
}

function buildAgeDeltaClause(ageDeltaYears: number): string {
  if (ageDeltaYears === 0) return ''
  if (ageDeltaYears > 0) {
    return ` Make them look about ${ageDeltaYears} years older than in the reference image.`
  }
  return ` Make them look about ${Math.abs(ageDeltaYears)} years younger than in the reference image.`
}

function buildIdentityLockedPrompt(
  scenePrompt: string,
  activityPrompt: string,
  detailPrompt: string,
  ageDeltaYears: number
): string {
  const activityClause = activityPrompt
    ? ` Activity they are doing: ${activityPrompt}.`
    : ' Activity they are doing: a natural candid moment.'
  const detailClause = detailPrompt
    ? ` Specific detail to include: ${detailPrompt}.`
    : ''
  const ageClause = buildAgeDeltaClause(ageDeltaYears)
  return (
    'Establish a high-fidelity identity lock on the subjects in the reference image. ' +
    'Photorealistic candid phone photo. Keep these EXACT same people - same faces, same identities, same ages - ' +
    `from the reference image. New scene: ${scenePrompt}.${activityClause}${detailClause}${ageClause} ` +
    'They are wearing different clothes/outfits from the reference. Super realistic, natural casual phone-photo quality, not stylized.'
  )
}

function buildStyleLockedPrompt(detailPrompt: string, ageDeltaYears: number): string {
  const styleOnlyConstraint =
    'STYLE-ONLY REFERENCE LOCK (highest priority): Create another photo just like this reference photo but with completely different people with different clothing and a slightly different setting. Other than that the photo should look the exact same - this should not look like a stock photo, if there was glare keep it, if bad lighting keep it, truly only look to make the people different and thats it. RELATIONSHIP LOCK (highest priority): Preserve the same relationship roles and composition from the reference image. Do not swap who is who (for example, father/daughter must stay father/daughter), do not flip generational roles, and do not change the apparent gender role pairing implied by the reference composition. Keep the awkwardness: imperfect lighting, awkward expressions, slight blur/soft focus, and real phone-photo messiness.'
  const detail = detailPrompt.trim()
  const ageClause = buildAgeDeltaClause(ageDeltaYears).trim()
  if (!detail && !ageClause) {
    return styleOnlyConstraint
  }
  const extras: string[] = []
  if (detail) {
    extras.push(`Additional requested detail: ${detail}.`)
  }
  if (ageClause) {
    extras.push(ageClause)
  }
  return `${styleOnlyConstraint}\n\n${extras.join(' ')}`
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as GenerateReferencePhotoRequest
    const referenceKey = body.referenceKey?.trim() || ''
    const referenceImageUrlFromBody = body.referenceImageUrl?.trim() || ''
    const prompt = body.prompt?.trim() || ''
    const activity = body.activity?.trim() || ''
    const detail = body.detail?.trim() || ''
    const blurLevel = clampBlurLevel(body.blurLevel)
    const ageDeltaYears = clampAgeDeltaYears(body.ageDeltaYears)
    const photoFilterStyle = body.photoFilterStyle || 'none'
    const mode = body.mode === 'style' ? 'style' : 'identity'
    const provider: ImageProvider = body.provider === 'openai' ? 'openai' : 'google'
    const jobId = body.jobId?.trim() || ''

    if (!referenceKey && !referenceImageUrlFromBody) {
      return NextResponse.json(
        { error: 'referenceKey or referenceImageUrl is required' },
        { status: 400 }
      )
    }
    if (mode === 'identity' && !prompt) {
      return NextResponse.json({ error: 'prompt is required for identity mode' }, { status: 400 })
    }
    if (!jobId) {
      return NextResponse.json({ error: 'jobId is required' }, { status: 400 })
    }

    const referenceImageUrl = referenceKey
      ? await mintLiveReferencePresignedUrl(referenceKey)
      : referenceImageUrlFromBody
    const basePrompt = mode === 'style'
      ? buildStyleLockedPrompt(detail, ageDeltaYears)
      : buildIdentityLockedPrompt(prompt, activity, detail, ageDeltaYears)
    const styledPrompt = applyPhotoGenerationStyle(basePrompt, {
      photo_blur_level: String(blurLevel),
      photo_filter_style: photoFilterStyle,
    })
    const generatedUrl = provider === 'openai'
      ? await generateAndUploadGptImageEdit(styledPrompt, referenceImageUrl)
      : await generateAndUploadPhoto(styledPrompt, {
          referenceImageUrl,
          referenceMode: mode,
        })

    if (!generatedUrl) {
      return NextResponse.json(
        { error: 'Failed to generate reference-based photo' },
        { status: 500 }
      )
    }

    const key = parseS3KeyFromUrl(generatedUrl)
    if (!key) {
      return NextResponse.json(
        { error: 'Generated URL did not include a valid S3 key', details: generatedUrl },
        { status: 500 }
      )
    }

    return NextResponse.json({
      key,
      url: generatedUrl,
    })
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Failed to generate reference-based photo',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
