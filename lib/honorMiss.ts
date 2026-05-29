// ═══════════════════════════════════════════════════════════════════════════
// HONOR / MISS SLIDESHOW HELPERS
// Shared prompt builders for the /admin/social/honor-miss feature.
// ═══════════════════════════════════════════════════════════════════════════

export type HonorMissMode = 'honor' | 'miss'

export type VisualType = 'framed_photo' | 'polaroid' | 'object_only' | 'symbol'

export type SlideRole = 'intro' | 'memory' | 'closer'

export interface MemoryItem {
  item: string
  visual_type: VisualType
  image_subject: string
}

export interface HonorMissSlide {
  order: number
  role: SlideRole
  caption: string
  visual_type: VisualType
  prompt: string
  uses_reference: boolean
  s3_key: string | null
  image_url: string | null
  // Concrete visual description used by the two-step (Gemini → GPT-image-2) pipeline.
  // Optional so existing/older job records without it still parse.
  image_subject?: string
}

export const RELATION_OPTIONS = [
  'dad',
  'mom',
  'brother',
  'sister',
  'best friend',
  'grandpa',
  'grandma',
  'husband',
  'wife',
  'son',
  'daughter',
] as const

export const SLIDE_COUNT_MIN = 3
export const SLIDE_COUNT_MAX = 7

// Curated pool of objects the admin can pre-approve for the "object_only" slides.
// When the user selects from these (and/or adds their own), Claude must draw every
// object_only subject from that pool instead of defaulting to its baked-in
// examples — this is the main lever for keeping objects differentiated run-to-run.
export const OBJECT_OPTIONS = [
  'a glass Coca-Cola bottle on a kitchen counter',
  'a cast-iron skillet on a stovetop',
  'a worn Stetson cowboy hat on a hook',
  'a red Folgers coffee can on the counter',
  'a pair of leather work gloves on a workbench',
  'a wooden rocking chair on a porch',
  'a fishing rod and tackle box by the door',
  'a stack of vinyl records beside a record player',
  'a pocket watch on a dresser',
  'reading glasses resting on an open book',
  'a worn leather Bible on a nightstand',
  'a flannel shirt draped over a chair',
  'a harmonica on a windowsill',
  'a deck of well-worn playing cards on a table',
  'a porcelain tea cup and saucer',
  'a toolbox with a hammer on a garage shelf',
  'a knitting basket with yarn and needles',
  'a watering can in a garden',
] as const

// Generic presence symbols used when an item cannot be anchored visually,
// and for the quiet closer slide.
export const SYMBOL_PROMPTS: Record<string, string> = {
  windchime:
    'A weathered metal windchime hanging on a quiet porch, gentle daylight, soft bokeh background. Photorealistic, warm domestic lighting. Vertical 9:16 aspect ratio.',
  'cardinal on a branch':
    'A single red cardinal perched on a bare branch, soft morning light, softly blurred natural background. Photorealistic. Vertical 9:16 aspect ratio.',
  'single rainbow':
    'A single faint rainbow arcing over a quiet open field after rain, soft diffuse light. Photorealistic. Vertical 9:16 aspect ratio.',
  'lit candle':
    'A single lit white candle on a wooden table, warm glow, soft dark background. Photorealistic. Vertical 9:16 aspect ratio.',
  'single feather on grass':
    'A single white feather resting on green grass, soft natural light, shallow depth of field. Photorealistic. Vertical 9:16 aspect ratio.',
}

export const SYMBOL_KEYS = Object.keys(SYMBOL_PROMPTS)

// Symbols appropriate for the quiet closer slide.
const CLOSER_SYMBOLS = ['cardinal on a branch', 'lit candle', 'windchime']

const CLOSER_CAPTIONS = [
  'their memory lives on',
  'always with me',
  'forever loved, never forgotten',
]

const FRAMED_SURFACES = [
  'a wooden dresser',
  'a writing desk',
  'a living room shelf',
  'a mantel above the fireplace',
]

const POLAROID_SURFACES = ['a wooden kitchen table', 'a kitchen counter']

function pickDeterministic<T>(options: T[], seed: number): T {
  return options[seed % options.length]
}

export function relationPhrase(relation: string): string {
  return relation.trim().toLowerCase()
}

export function buildIntroCaption(mode: HonorMissMode, count: number, relation: string): string {
  const rel = relationPhrase(relation)
  return mode === 'honor'
    ? `${count} ways I honor my ${rel}`
    : `${count} things I miss about my ${rel}`
}

export function pickCloserCaption(seed: number): string {
  return pickDeterministic(CLOSER_CAPTIONS, seed)
}

export function pickCloserSymbol(seed: number): string {
  return pickDeterministic(CLOSER_SYMBOLS, seed)
}

const HER_RELATIONS = ['mom', 'sister', 'grandma', 'wife', 'daughter']
const HIM_RELATIONS = ['dad', 'brother', 'grandpa', 'husband', 'son']

function subjectPronouns(relation: string): { obj: string; poss: string } {
  const r = relationPhrase(relation)
  if (HER_RELATIONS.includes(r)) return { obj: 'her', poss: 'Her' }
  if (HIM_RELATIONS.includes(r)) return { obj: 'him', poss: 'His' }
  return { obj: 'them', poss: 'Their' }
}

// Framed-photo slides use a hardcoded "I keep a photo of them" style caption
// rather than the LLM memory line, with a small pool so multiple framed slides
// don't repeat the exact same sentence.
export function buildFramedPhotoCaption(relation: string, seed: number): string {
  const { obj, poss } = subjectPronouns(relation)
  const rel = relationPhrase(relation)
  const options = [
    `I keep a photo of ${obj} on my desk`,
    `I keep a framed photo of my ${rel} on the shelf`,
    `${poss} photo still sits on my nightstand`,
    `I keep ${obj} close — ${poss.toLowerCase()} photo on the dresser`,
  ]
  return pickDeterministic(options, seed)
}

// ─────────────────────────────────────────────────────────────────────────
// LLM PROMPT — asks Claude for N concrete, sensory memory items
// ─────────────────────────────────────────────────────────────────────────

export type HonorMissPerspective = 'first_person' | 'third_person'

// Controls the person-photo composition of the memory slides:
//   both_framed_first   — guarantee ≥1 framed AND ≥1 polaroid; guaranteed slot is framed
//   both_polaroid_first — guarantee ≥1 framed AND ≥1 polaroid; guaranteed slot is polaroid
//   framed_only         — all person photos are framed (never polaroid)
//   polaroid_only       — all person photos are polaroid (never framed)
export type HonorMissPhotoStyle =
  | 'both_framed_first'
  | 'both_polaroid_first'
  | 'framed_only'
  | 'polaroid_only'

export const DEFAULT_PHOTO_STYLE: HonorMissPhotoStyle = 'both_framed_first'

// Deterministically rewrites the memory items' visual_type so the requested
// person-photo composition is guaranteed. NEVER touches the intro/anchor slide
// (slide 1) — this only operates on the LLM memory items.
//
// "Person photos" are framed_photo + polaroid. object_only / symbol items are left
// alone unless a conversion is needed to satisfy the guarantee (rare fallback).
export function enforcePhotoStyle(items: MemoryItem[], style: HonorMissPhotoStyle): MemoryItem[] {
  if (items.length === 0) return items
  const out = items.map((it) => ({ ...it }))
  const isPerson = (t: VisualType) => t === 'framed_photo' || t === 'polaroid'

  // Ensures at least one item has the target type; prefers converting an existing
  // person slide (not at `avoidIdx`), otherwise promotes the first eligible item.
  // Returns the index that now holds the target type.
  const ensureAtLeastOne = (target: VisualType, avoidIdx = -1): number => {
    const existing = out.findIndex((it, i) => i !== avoidIdx && it.visual_type === target)
    if (existing >= 0) return existing
    const personIdx = out.findIndex((it, i) => i !== avoidIdx && isPerson(it.visual_type) && it.visual_type !== target)
    const fallbackIdx = out.findIndex((_, i) => i !== avoidIdx)
    const idx = personIdx >= 0 ? personIdx : fallbackIdx
    if (idx >= 0) out[idx] = { ...out[idx], visual_type: target }
    return idx
  }

  switch (style) {
    case 'framed_only':
      out.forEach((it, i) => {
        if (isPerson(it.visual_type)) out[i] = { ...it, visual_type: 'framed_photo' }
      })
      ensureAtLeastOne('framed_photo')
      break
    case 'polaroid_only':
      out.forEach((it, i) => {
        if (isPerson(it.visual_type)) out[i] = { ...it, visual_type: 'polaroid' }
      })
      ensureAtLeastOne('polaroid')
      break
    case 'both_polaroid_first':
    case 'both_framed_first':
    default: {
      const first: VisualType = style === 'both_polaroid_first' ? 'polaroid' : 'framed_photo'
      const second: VisualType = first === 'framed_photo' ? 'polaroid' : 'framed_photo'
      const firstIdx = ensureAtLeastOne(first)
      ensureAtLeastOne(second, firstIdx)
      break
    }
  }

  return out
}

export function buildItemsPrompt(params: {
  mode: HonorMissMode
  relation: string
  count: number
  anchors: string[]
  lovedOneName?: string | null
  lovedOneDetails?: string | null
  // Optional third-person tribute framing. When omitted/first_person, output is
  // byte-for-byte identical to the original first-person prompt.
  perspective?: HonorMissPerspective
  subjectName?: string | null
  // Optional admin-approved pool of objects for object_only slides. When provided,
  // every object_only subject must be drawn from this list (kept differentiated).
  objectPool?: string[]
  // Controls the framed vs polaroid composition of the person photos.
  photoStyle?: HonorMissPhotoStyle
}): string {
  const { mode, relation, count, anchors, lovedOneName, lovedOneDetails, perspective, subjectName, objectPool, photoStyle } =
    params
  const subject = (subjectName || '').trim()
  const isThirdPerson = perspective === 'third_person' && subject.length > 0

  const frame = isThirdPerson
    ? mode === 'honor'
      ? `ways the narrator honors ${subject} (their late ${relationPhrase(relation)})`
      : `things the narrator misses about ${subject} (their late ${relationPhrase(relation)})`
    : mode === 'honor'
      ? `ways the narrator honors their late ${relationPhrase(relation)}`
      : `things the narrator misses about their late ${relationPhrase(relation)}`

  const subjectBlock = isThirdPerson
    ? `\nThe subject of this tribute is ${subject}. Write every memory item about ${subject}.`
    : ''

  const anchorBlock =
    anchors.filter((a) => a.trim()).length > 0
      ? `\nGROUNDING DETAILS (weave these in naturally where they fit — do not force all of them):\n${anchors
          .filter((a) => a.trim())
          .map((a) => `- ${a.trim()}`)
          .join('\n')}\n`
      : ''

  const nameBlock = lovedOneName ? `\nThe loved one's name is ${lovedOneName}.` : ''
  const detailBlock = lovedOneDetails ? `\nBackground on them: ${lovedOneDetails}` : ''

  const photoStyleInstruction = (() => {
    switch (photoStyle) {
      case 'framed_only':
        return 'For every person photo use ONLY "framed_photo" (never "polaroid"). At least ONE item MUST be "framed_photo".'
      case 'polaroid_only':
        return 'For every person photo use ONLY "polaroid" (never "framed_photo"). At least ONE item MUST be "polaroid".'
      case 'both_polaroid_first':
        return 'You MUST include at least ONE "polaroid" AND at least ONE "framed_photo" — both types must appear among the items. Mix them.'
      case 'both_framed_first':
      default:
        return 'You MUST include at least ONE "framed_photo" AND at least ONE "polaroid" — both types must appear among the items. Mix them.'
    }
  })()

  const objects = (objectPool || []).map((o) => o.trim()).filter(Boolean)
  const objectPoolBlock =
    objects.length > 0
      ? `\nOBJECT POOL (STRICT — applies ONLY to "object_only" items): Every "object_only" item MUST use an object chosen from this list, and nothing else:\n${objects
          .map((o) => `- ${o}`)
          .join(
            '\n'
          )}\nUse a DIFFERENT object from this list for each object_only slide — do not repeat an object unless there are more object_only slides than listed objects. Do NOT invent other objects, and do NOT fall back on the generic example objects mentioned elsewhere in these instructions (e.g. Coca-Cola, Folgers can, Stetson hat, cast-iron griddle) unless they actually appear in this list. This rule does NOT affect framed_photo, polaroid, or symbol items.\n`
      : ''

  return `You are writing the content for a heartfelt social media slideshow about ${frame}.${nameBlock}${detailBlock}${subjectBlock}
${anchorBlock}
Write exactly ${count} memory items.

HARD RULE: Each item MUST contain at least one concrete noun — a physical object, brand, place, food, or sound. NO abstract emotions. Never write things like "his laugh", "the way she made me feel safe", or "his big heart".

TONE: Warm, specific, and grounded — the way a real person describes a real loss. Small, ordinary, sensory details that feel true.

EXAMPLES OF GOOD ITEMS:
- "His Stetson hat resting on the truck dashboard"
- "Reading the sports page out loud at the breakfast table"
- "The smell of Old Spice and sawdust in the workshop"

OBJECT ITEMS come in TWO flavors — use a MIX of both across the slideshow:
- KEPT (something of theirs the narrator still has / holds onto): "His red Folgers coffee can full of loose change, still on the kitchen counter" / "Glass Coca-Cola bottles — the old ones he kept in the garage fridge"
- RITUAL (an object tied to something the narrator still DOES in their honor): "I still grab a glass-bottle Coca-Cola now and then — those were his favorite" / "Every Sunday I make his pancakes on the old cast-iron griddle"
Lean toward RITUAL for "honor" framing and KEPT for "miss" framing, but either works for either.

EXAMPLES OF BAD ITEMS (never do this):
- "His warm hugs"
- "The way he made me feel"
- "His big heart"
- "Her endless love"

For EACH item also classify the best visual:
- "framed_photo": a framed photo of the person doing the memory (use when the memory centers on the person doing something)
- "polaroid": a polaroid snapshot of the person (casual candid memories)
- "object_only": a specific physical object/scene with no person — either an object of theirs the narrator KEPT, or an object tied to a RITUAL the narrator still does in their honor (mix both flavors across the slideshow)
- "symbol": ONLY if the item truly cannot be anchored to a person or object visually

IMPORTANT: Across the ${count} items, include a MIX of visual types. ${photoStyleInstruction}
${objectPoolBlock}
Also provide "image_subject": a short, concrete visual description for an image generator.
- For framed_photo / polaroid: describe what the person is doing (e.g. "reading a newspaper at a kitchen table, morning light").
- For object_only: describe ONLY the object/scene concretely with no person in frame — even for RITUAL items (e.g. for "I still grab a Coca-Cola in his honor" the image_subject is just "a cold glass Coca-Cola bottle on a kitchen counter, condensation on the glass").
- For symbol: leave as an empty string.

RESPOND WITH ONLY VALID JSON — an array, no markdown, no commentary:
[
  { "item": "string (the caption shown on the slide)", "visual_type": "framed_photo | polaroid | object_only | symbol", "image_subject": "string" }
]`
}

// ─────────────────────────────────────────────────────────────────────────
// IMAGE PROMPT BUILDERS
// ─────────────────────────────────────────────────────────────────────────

const PERSON_REF = 'the same person shown in the attached reference photo'

// The intro/anchor replicates the picked reference photo's composition but with
// DIFFERENT people — same approach as the platform's other S3 "style" references.
export function buildIntroImagePrompt(): string {
  return `STYLE-ONLY REFERENCE LOCK (highest priority): Create another photo just like this reference photo but with completely different people with different clothing and a slightly different setting. Other than that the photo should look the exact same — this should not look like a stock photo; if there was glare keep it, if bad lighting keep it, truly only make the people different and that's it. RACE/ETHNICITY LOCK (highest priority): Each new person MUST match the same race, ethnicity, and skin tone as the corresponding person they replace in the reference photo, as well as their approximate age and gender. Only the specific facial identity should change — never their race, ethnicity, or skin tone. RELATIONSHIP LOCK (highest priority): Preserve the same relationship roles and composition from the reference image. Do not swap who is who, do not flip generational roles, and do not change the apparent gender role pairing implied by the reference composition. Keep the awkwardness: imperfect lighting, awkward expressions, slight blur/soft focus, and real phone-photo messiness. Vertical 9:16 aspect ratio.`
}

export function buildMemoryImagePrompt(item: MemoryItem, seed: number): { prompt: string; usesReference: boolean } {
  const subject = item.image_subject?.trim() || item.item.trim()

  switch (item.visual_type) {
    case 'framed_photo': {
      const surface = pickDeterministic(FRAMED_SURFACES, seed)
      return {
        prompt: `A framed photograph of ${PERSON_REF}, ${subject}. The framed photo is sitting on ${surface}. Soft natural light. Photorealistic, warm domestic tones, true to the reference identity. Vertical 9:16 aspect ratio.`,
        usesReference: true,
      }
    }
    case 'polaroid': {
      const surface = pickDeterministic(POLAROID_SURFACES, seed)
      return {
        prompt: `A polaroid photo of ${PERSON_REF}, ${subject}. The polaroid is lying on ${surface}. Photorealistic, warm light, true to the reference identity. Vertical 9:16 aspect ratio.`,
        usesReference: true,
      }
    }
    case 'object_only': {
      return {
        prompt: `${subject}. Shot like a casual photo someone snapped on their phone — natural, slightly imperfect framing with the object seen at a normal distance within its everyday surroundings, NOT a tight studio product close-up. Photorealistic, warm domestic lighting, no people in frame. Vertical 9:16 aspect ratio.`,
        usesReference: false,
      }
    }
    case 'symbol':
    default: {
      const symbol = pickDeterministic(SYMBOL_KEYS, seed)
      return {
        prompt: SYMBOL_PROMPTS[symbol],
        usesReference: false,
      }
    }
  }
}

export function buildCloserImagePrompt(seed: number): string {
  const symbol = pickCloserSymbol(seed)
  return SYMBOL_PROMPTS[symbol]
}

export function s3KeyForSlide(jobId: string, order: number): string {
  return `social-generated/honor-miss/${jobId}/slide-${order}.png`
}

// ═══════════════════════════════════════════════════════════════════════════
// TWO-MODEL PIPELINE (Gemini identity → GPT-image-2) — additive
// framed_photo + polaroid use a two-step transform; object_only + symbol use a
// single GPT-image-2 call; the persona anchor (intro) uses a single Gemini call.
// All paths fall back to the original single Gemini call on failure.
// ═══════════════════════════════════════════════════════════════════════════

// Reuses the SAME 1–10 blurriness scale convention used elsewhere in the app
// (see lib/socialPhotoStyle.ts: 1 = clear, 10 = very blurry, clamped + integer).
// This default is tuned for the faded interior of framed/polaroid photos.
export const DEFAULT_INTERIOR_BLUR_LEVEL = 6

// Maps a 1–10 blurriness level to an explicit soft-focus instruction for the
// GPT-image-2 framed/polaroid transform. The softness applies ONLY to the photo
// of the person inside the frame, never the surrounding domestic scene.
export function buildInteriorSoftFocusInstruction(level?: number): string {
  const raw = typeof level === 'number' ? level : DEFAULT_INTERIOR_BLUR_LEVEL
  const clamped = Number.isNaN(raw) ? DEFAULT_INTERIOR_BLUR_LEVEL : Math.min(10, Math.max(1, Math.floor(raw)))

  let wording: string
  if (clamped <= 1) {
    wording = 'barely any softness, mostly clear print'
  } else if (clamped <= 3) {
    wording = 'lightly soft-focus and faintly faded, like a fairly recent print'
  } else if (clamped <= 6) {
    wording = 'noticeably soft-focus but the face still clearly readable, gently faded like an older printed photo'
  } else if (clamped <= 8) {
    wording = 'strongly soft-focus and faded, the face still recognizable but not crisp'
  } else {
    wording = 'heavily faded and blurry, only general features readable'
  }

  return `Interior blurriness level: ${clamped}/10 — ${wording}. Apply this faded soft-focus look ONLY to the photo of the person inside the frame/polaroid, not to the surrounding scene or objects.`
}

// Step A prompt: a clean photo of the person doing the memory action (Gemini identity).
export function buildPersonActionPrompt(subject: string): string {
  const s = (subject || '').trim()
  return `A candid, natural photo of ${PERSON_REF}${s ? `, ${s}` : ''}. The person is clearly visible. Photorealistic, warm natural light, true to the reference identity. Vertical 9:16 aspect ratio.`
}

// Step B prompt (framed): GPT-image-2 transforms the Step A photo into a framed photo in a domestic scene.
export function buildFramedTransformPrompt(seed: number, blurLevel?: number): string {
  const surface = pickDeterministic(FRAMED_SURFACES, seed)
  return `Transform this image into a framed photograph sitting on ${surface} in a warm domestic scene. The photo inside the frame should look slightly faded, soft-focus, slightly blurry — like an older printed photo. The frame itself is wooden or metal, sitting at a slight angle. Surrounding objects: a lamp, a small plant, a coffee mug, and similar cozy details. ${buildInteriorSoftFocusInstruction(blurLevel)} Preserve the identity of the person from the input image. Photorealistic, warm domestic tones. Vertical 9:16 aspect ratio.`
}

// Step B prompt (polaroid): GPT-image-2 transforms the Step A photo into a polaroid lying flat.
export function buildPolaroidTransformPrompt(seed: number, blurLevel?: number): string {
  const surface = pickDeterministic(POLAROID_SURFACES, seed)
  return `Transform this image into a polaroid photo lying flat on ${surface}. The polaroid has a white border, slight wear at the corners, and the photo inside is slightly faded and soft-focus. ${buildInteriorSoftFocusInstruction(blurLevel)} Preserve the identity of the person from the input image. Photorealistic, warm light. Vertical 9:16 aspect ratio.`
}

// Persona/subject anchor (slide 1) — clean photorealistic photo, stored distinctly.
export function s3KeyForAnchor(jobId: string): string {
  return `social-generated/honor-miss/${jobId}/slide-0-anchor.png`
}

// Temporary Step A output for the two-step framed/polaroid transform.
export function s3KeyForStepA(jobId: string, order: number): string {
  return `social-generated/honor-miss/${jobId}/slide-${order}-stepA.png`
}
