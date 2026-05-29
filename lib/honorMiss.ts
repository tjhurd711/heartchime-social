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

// ─────────────────────────────────────────────────────────────────────────
// LLM PROMPT — asks Claude for N concrete, sensory memory items
// ─────────────────────────────────────────────────────────────────────────

export function buildItemsPrompt(params: {
  mode: HonorMissMode
  relation: string
  count: number
  anchors: string[]
  lovedOneName?: string | null
  lovedOneDetails?: string | null
}): string {
  const { mode, relation, count, anchors, lovedOneName, lovedOneDetails } = params
  const frame =
    mode === 'honor'
      ? `ways the narrator honors their late ${relationPhrase(relation)}`
      : `things the narrator misses about their late ${relationPhrase(relation)}`

  const anchorBlock =
    anchors.filter((a) => a.trim()).length > 0
      ? `\nGROUNDING DETAILS (weave these in naturally where they fit — do not force all of them):\n${anchors
          .filter((a) => a.trim())
          .map((a) => `- ${a.trim()}`)
          .join('\n')}\n`
      : ''

  const nameBlock = lovedOneName ? `\nThe loved one's name is ${lovedOneName}.` : ''
  const detailBlock = lovedOneDetails ? `\nBackground on them: ${lovedOneDetails}` : ''

  return `You are writing the content for a heartfelt social media slideshow about ${frame}.${nameBlock}${detailBlock}
${anchorBlock}
Write exactly ${count} memory items.

HARD RULE: Each item MUST contain at least one concrete noun — a physical object, brand, place, food, or sound. NO abstract emotions. Never write things like "his laugh", "the way she made me feel safe", or "his big heart".

TONE: Warm, specific, and grounded — the way a real person describes a real loss. Small, ordinary, sensory details that feel true.

EXAMPLES OF GOOD ITEMS:
- "Glass Coca-Cola bottles — the old ones he kept in the garage fridge"
- "His Stetson hat resting on the truck dashboard"
- "Reading the sports page out loud at the breakfast table"
- "The smell of Old Spice and sawdust in the workshop"

EXAMPLES OF BAD ITEMS (never do this):
- "His warm hugs"
- "The way he made me feel"
- "His big heart"
- "Her endless love"

For EACH item also classify the best visual:
- "framed_photo": a framed photo of the person doing the memory (use when the memory centers on the person doing something)
- "polaroid": a polaroid snapshot of the person (casual candid memories)
- "object_only": a specific physical object/scene with no person (use when the memory is anchored to a clear object, food, or place)
- "symbol": ONLY if the item truly cannot be anchored to a person or object visually

Also provide "image_subject": a short, concrete visual description for an image generator.
- For framed_photo / polaroid: describe what the person is doing (e.g. "reading a newspaper at a kitchen table, morning light").
- For object_only: describe the object/scene concretely (e.g. "a cold glass Coca-Cola bottle on a kitchen counter, condensation on the glass").
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

export function buildIntroImagePrompt(): string {
  return `A warm, natural portrait of ${PERSON_REF}, looking gently toward the camera with a soft, peaceful expression. Cozy domestic background, soft natural window light. Photorealistic, true to the reference identity. Vertical 9:16 aspect ratio.`
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
        prompt: `${subject}. Photorealistic, warm domestic lighting, shallow depth of field, no people in frame. Vertical 9:16 aspect ratio.`,
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
