import { NextRequest, NextResponse } from 'next/server'
import { generateAndUploadPhoto } from '@/lib/geminiImageGen'
import { generateAndUploadGptImageEdit } from '@/lib/openaiImageGen'
import { mintLiveReferencePresignedUrl } from '@/lib/socialReferenceS3'
import { applyPhotoGenerationStyle } from '@/lib/socialPhotoStyle'

type ImageProvider = 'google' | 'openai'
type CameraDistance = 'further' | 'same' | 'closer'

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
  cameraDistance?: CameraDistance
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

// These models tend to drift closer / zoom in on the subjects. This lock forces
// the generated photo to keep the SAME camera-to-subject distance and framing as
// the reference so the perceived distance stays consistent across every slide.
const FRAMING_DISTANCE_LOCK =
  'CAMERA DISTANCE LOCK (highest priority): Match the exact same camera-to-subject distance, framing, and zoom level as the reference image. The people must occupy the same proportion of the frame as in the reference - do NOT zoom in, do NOT move the camera closer, do NOT crop tighter on faces or bodies, do NOT create a close-up. Preserve the same shot scale (wide/medium/full-body), the same headroom, and the same amount of surrounding background as the reference so the subjects look just as far away as in the original.'

function buildAgeDeltaClause(ageDeltaYears: number): string {
  if (ageDeltaYears === 0) return ''
  if (ageDeltaYears > 0) {
    return ` Make them look about ${ageDeltaYears} years older than in the reference image.`
  }
  return ` Make them look about ${Math.abs(ageDeltaYears)} years younger than in the reference image.`
}

function buildCameraDistanceClause(distance: CameraDistance): string {
  if (distance === 'closer') {
    return ' Take this photo from closer to the subjects than the reference image (a bit more zoomed in), while still looking like a natural casual phone photo.'
  }
  if (distance === 'further') {
    return ' Take this photo from further away than the reference image, so the people appear smaller in the frame with more of the surroundings visible.'
  }
  return ' Keep roughly the same camera-to-subject distance as the reference image (do not zoom into a tight close-up).'
}

function buildIdentityLockedPrompt(
  scenePrompt: string,
  activityPrompt: string,
  detailPrompt: string,
  ageDeltaYears: number,
  cameraDistance: CameraDistance
): string {
  const activityClause = activityPrompt
    ? ` They are actively ${activityPrompt} — let this activity drive their pose, body position, hands, and expression.`
    : ' Let their pose and expression come naturally from a candid moment.'
  const detailClause = detailPrompt
    ? ` Specific detail to include: ${detailPrompt}.`
    : ''
  const ageClause = buildAgeDeltaClause(ageDeltaYears)
  const cameraClause = buildCameraDistanceClause(cameraDistance)
  return (
    'Photorealistic candid phone photo of the EXACT same people from the reference image — same faces, same identities, same ages. ' +
    `Scene: ${scenePrompt}.${activityClause}${detailClause}${ageClause} ` +
    'Give them a new, different pose and body position that fits what they are doing — do NOT reuse or copy the pose from the reference image. ' +
    'They are wearing completely different clothes from the reference, and their worn accessories must change to match the new outfit too: change or remove hats, sunglasses, glasses, and jewelry rather than keeping the same ones from the reference. ' +
    'Super realistic, natural casual phone-photo quality, not stylized.' +
    cameraClause
  )
}

function buildStyleLockedPrompt(detailPrompt: string, ageDeltaYears: number): string {
  const styleOnlyConstraint =
    'STYLE-ONLY REFERENCE LOCK (highest priority): Create another photo just like this reference photo but with completely different people with different clothing and a slightly different setting. Other than that the photo should look the exact same - this should not look like a stock photo, if there was glare keep it, if bad lighting keep it, truly only look to make the people different and thats it. RELATIONSHIP LOCK (highest priority): Preserve the same relationship roles and composition from the reference image. Do not swap who is who (for example, father/daughter must stay father/daughter), do not flip generational roles, and do not change the apparent gender role pairing implied by the reference composition. Keep the awkwardness: imperfect lighting, awkward expressions, slight blur/soft focus, and real phone-photo messiness.'
  const detail = detailPrompt.trim()
  const ageClause = buildAgeDeltaClause(ageDeltaYears).trim()
  const base = `${styleOnlyConstraint} ${FRAMING_DISTANCE_LOCK}`
  if (!detail && !ageClause) {
    return base
  }
  const extras: string[] = []
  if (detail) {
    extras.push(`Additional requested detail: ${detail}.`)
  }
  if (ageClause) {
    extras.push(ageClause)
  }
  return `${base}\n\n${extras.join(' ')}`
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
    const cameraDistance: CameraDistance =
      body.cameraDistance === 'closer' || body.cameraDistance === 'further'
        ? body.cameraDistance
        : 'same'
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
      : buildIdentityLockedPrompt(prompt, activity, detail, ageDeltaYears, cameraDistance)
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
