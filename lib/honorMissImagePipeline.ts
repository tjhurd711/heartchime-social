// ═══════════════════════════════════════════════════════════════════════════
// HONOR / MISS — TWO-MODEL IMAGE PIPELINE (additive)
//
// Routes each slide to the best generation path based on role + visual_type:
//   • intro (persona anchor) → single Gemini identity call (clean subject photo)
//   • object_only / symbol   → single GPT-image-2 call (no reference)
//   • framed_photo / polaroid→ two-step: Gemini identity (person doing action)
//                              then GPT-image-2 edit (frame/polaroid + faded interior)
//
// Every path falls back to the ORIGINAL single Gemini call (generateAndUploadPhoto)
// if the preferred path fails, so the previously-working single-model flow is
// always preserved.
// ═══════════════════════════════════════════════════════════════════════════

import { generateAndUploadPhoto } from './geminiImageGen'
import { generateAndUploadGptImage, generateAndUploadGptImageEdit } from './openaiImageGen'
import {
  HonorMissSlide,
  buildFramedTransformPrompt,
  buildPersonActionPrompt,
  buildPolaroidTransformPrompt,
  s3KeyForAnchor,
  s3KeyForSlide,
  s3KeyForStepA,
} from './honorMiss'

export type HonorMissPipelineKind =
  | 'gemini-anchor' // intro persona anchor (single Gemini identity call)
  | 'gpt-direct' // object_only / symbol (single GPT-image-2 call)
  | 'two-step' // framed_photo / polaroid (Gemini → GPT-image-2 edit)
  | 'gemini-fallback' // any path that fell back to the original single Gemini call

export interface SlideImageResult {
  url: string | null
  s3Key: string | null
  pipeline: HonorMissPipelineKind
}

interface GenerateArgs {
  jobId: string
  slide: HonorMissSlide
  // Narrating persona reference — used for the intro anchor and for first-person memory slides.
  referenceUrl: string | null
  // Optional tribute-subject reference (third-person mode). When set, framed_photo
  // and polaroid memory slides render this subject instead of the persona. The
  // intro anchor always uses the persona referenceUrl.
  subjectReferenceUrl?: string | null
  // 1–10 blurriness level applied to the faded interior of framed/polaroid photos.
  blurLevel?: number
  // Optional key suffix (inserted before ".png") used for cache-busting on regenerate.
  keySuffix?: string
}

function withSuffix(key: string, suffix?: string): string {
  if (!suffix) return key
  return key.replace(/\.png$/, `${suffix}.png`)
}

// The original single-call Gemini path (preserved as the universal fallback).
async function geminiSingleCall(
  slide: HonorMissSlide,
  referenceUrl: string | null,
  finalKey: string
): Promise<SlideImageResult> {
  const url = await generateAndUploadPhoto(slide.prompt, {
    key: finalKey,
    referenceImageUrl: slide.uses_reference ? referenceUrl : null,
    referenceMode: slide.uses_reference ? 'identity' : undefined,
  })
  return { url, s3Key: url ? finalKey : null, pipeline: 'gemini-fallback' }
}

export async function generateHonorMissSlideImage(args: GenerateArgs): Promise<SlideImageResult> {
  const { jobId, slide, referenceUrl, subjectReferenceUrl, blurLevel, keySuffix } = args

  try {
    // ── Subject anchor (intro) ──────────────────────────────────────────────
    // Third-person tributes anchor on the chosen subject reference; first-person
    // anchors on the persona (which is the subject in that mode).
    const anchorReference = subjectReferenceUrl || referenceUrl
    if (slide.role === 'intro') {
      const finalKey = withSuffix(s3KeyForAnchor(jobId), keySuffix)
      const url = await generateAndUploadPhoto(slide.prompt, {
        key: finalKey,
        referenceImageUrl: anchorReference,
        referenceMode: 'identity',
      })
      if (url) return { url, s3Key: finalKey, pipeline: 'gemini-anchor' }
      // Fallback uses the standard slide key so it still renders if the anchor key fails.
      return geminiSingleCall(slide, anchorReference, withSuffix(s3KeyForSlide(jobId, slide.order), keySuffix))
    }

    const finalKey = withSuffix(s3KeyForSlide(jobId, slide.order), keySuffix)

    // ── Two-step: framed_photo / polaroid ───────────────────────────────────
    if (slide.visual_type === 'framed_photo' || slide.visual_type === 'polaroid') {
      // Third-person tributes render the subject in memory slides; first-person
      // uses the persona reference (unchanged behavior).
      const memoryReference = subjectReferenceUrl || referenceUrl
      const subject = (slide.image_subject || '').trim() || slide.caption
      const stepAPrompt = buildPersonActionPrompt(subject)
      const stepAKey = withSuffix(s3KeyForStepA(jobId, slide.order), keySuffix)

      const stepAUrl = await generateAndUploadPhoto(stepAPrompt, {
        key: stepAKey,
        referenceImageUrl: memoryReference,
        referenceMode: 'identity',
      })

      if (stepAUrl) {
        const stepBPrompt =
          slide.visual_type === 'framed_photo'
            ? buildFramedTransformPrompt(slide.order, blurLevel)
            : buildPolaroidTransformPrompt(slide.order, blurLevel)

        const finalUrl = await generateAndUploadGptImageEdit(stepBPrompt, stepAUrl, { key: finalKey })
        if (finalUrl) return { url: finalUrl, s3Key: finalKey, pipeline: 'two-step' }
      }

      // Either step failed — fall back to the original single Gemini call,
      // using the same (subject or persona) reference as the two-step path.
      console.warn('[honor-miss/pipeline] two-step failed, falling back for slide', slide.order)
      return geminiSingleCall(slide, memoryReference, finalKey)
    }

    // ── Single GPT-image-2 call: object_only / symbol ───────────────────────
    if (slide.visual_type === 'object_only' || slide.visual_type === 'symbol') {
      const gptUrl = await generateAndUploadGptImage(slide.prompt, { key: finalKey })
      if (gptUrl) return { url: gptUrl, s3Key: finalKey, pipeline: 'gpt-direct' }
      console.warn('[honor-miss/pipeline] gpt-direct failed, falling back for slide', slide.order)
      return geminiSingleCall(slide, referenceUrl, finalKey)
    }

    // ── Anything else → original single Gemini call ─────────────────────────
    return geminiSingleCall(slide, referenceUrl, finalKey)
  } catch (error) {
    console.error('[honor-miss/pipeline] Unexpected error, falling back for slide', slide.order, error)
    return geminiSingleCall(slide, referenceUrl, withSuffix(s3KeyForSlide(jobId, slide.order), keySuffix))
  }
}
