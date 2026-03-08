// ═══════════════════════════════════════════════════════════════════════════
// AI UGC SYSTEM - TypeScript Types
// ═══════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════
// DATABASE TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface AiUgcPersona {
  id: string
  name: string
  age: number
  birth_year: number
  gender: string | null
  ethnicity: string | null
  location: string | null
  job: string | null
  vibe: string | null
  master_photo_url: string
  elevenlabs_voice_id: string | null
  instagram_handle: string | null
  tiktok_handle: string | null
  created_at: string
  updated_at: string
}

export interface AiUgcLovedOne {
  id: string
  persona_id: string
  name: string
  relationship: string
  gender: string | null
  age_at_death: number
  birth_year: number
  death_year: number
  master_photo_url: string
  keywords: string[] | null
  personality_traits: string[] | null
  created_at: string
  updated_at: string
}

export type AssetType = 'persona_solo' | 'loved_one_solo' | 'together' | 'generic'

export interface AiUgcAsset {
  id: string
  persona_id: string | null
  loved_one_id: string | null
  asset_type: AssetType
  era: string | null
  context: string | null
  s3_url: string
  thumbnail_url: string | null
  prompt_used: string | null
  is_favorite: boolean
  tags: string[] | null
  created_at: string
}

export type PostStatus = 'draft' | 'ready' | 'posted'
export type PostType = 'carousel' | 'single_photo' | 'video_script'
export type Platform = 'tiktok' | 'instagram' | 'both'

export interface SlideDefinition {
  slideNumber: number
  type: 'persona_photo' | 'loved_one_photo' | 'together_photo' | 'generic_photo' | 'heartchime_card'
  era?: string | null
  context?: string | null
  caption?: string | null
  assetUrl?: string | null // if using existing asset
  generatedUrl?: string | null // if newly generated
  cardMessage?: string | null // for heartchime_card type
}

export interface AiUgcPost {
  id: string
  persona_id: string
  platform: Platform | null
  post_type: PostType | null
  status: PostStatus
  slides: SlideDefinition[] | null
  caption: string | null
  hook_text: string | null
  card_message: string | null
  scheduled_for: string | null
  posted_at: string | null
  post_url: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

// ═══════════════════════════════════════════════════════════════════════════
// JOINED/EXTENDED TYPES (for API responses)
// ═══════════════════════════════════════════════════════════════════════════

export interface AiUgcPersonaWithLovedOne extends AiUgcPersona {
  loved_ones?: AiUgcLovedOne[]
  asset_count?: number
  post_count?: number
}

export interface AiUgcAssetWithRelations extends AiUgcAsset {
  persona?: AiUgcPersona | null
  loved_one?: AiUgcLovedOne | null
}

export interface AiUgcPostWithPersona extends AiUgcPost {
  persona?: AiUgcPersona | null
}

export interface Trend {
  id: string
  keyword: string
  why_trending: string | null
  heartchime_fit: string | null
  fit_reasoning: string | null
  suggested_angle: string | null
  google_trends_url: string | null
  related_topics?: string[] | null
  traffic_estimate?: string | null
  trending_date: string
  batch_id?: string | null
  created_at?: string | null
}

// ═══════════════════════════════════════════════════════════════════════════
// API REQUEST/RESPONSE TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface GeneratePhotoRequest {
  personaId: string
  photoType: AssetType
  era?: string | null
  context?: string | null
}

export interface GeneratePhotoResponse {
  success: boolean
  asset?: AiUgcAsset
  error?: string
}

export interface ParsePostRequest {
  personaId: string
  naturalLanguageDescription: string
}

export interface ParsePostResponse {
  success: boolean
  slides?: SlideDefinition[]
  caption?: string
  error?: string
}

export interface GeneratePostRequest {
  personaId: string
  slides: SlideDefinition[]
  caption?: string
  platform?: Platform
}

export interface GeneratePostResponse {
  success: boolean
  post?: AiUgcPost
  slideUrls?: string[]
  error?: string
}

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

export const ERA_OPTIONS = [
  '1950s',
  '1960s',
  '1970s',
  '1980s',
  '1990s',
  '2000s',
  '2010s',
  '2020s',
] as const

export const ASSET_TYPE_LABELS: Record<AssetType, string> = {
  persona_solo: 'Persona Only',
  loved_one_solo: 'Loved One Only',
  together: 'Together',
  generic: 'Generic (No People)',
}

export const POST_STATUS_LABELS: Record<PostStatus, string> = {
  draft: 'Draft',
  ready: 'Ready to Post',
  posted: 'Posted',
}

export const PLATFORM_LABELS: Record<Platform, string> = {
  tiktok: 'TikTok',
  instagram: 'Instagram',
  both: 'Both',
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Calculate what age someone would be in a given era
 */
export function calculateAgeInEra(birthYear: number, era: string): number {
  const eraYear = parseInt(era.slice(0, 4)) + 5 // middle of decade
  return eraYear - birthYear
}

/**
 * Check if someone was alive in a given era
 */
export function wasAliveInEra(birthYear: number, deathYear: number | null, era: string): boolean {
  const eraYear = parseInt(era.slice(0, 4)) + 5
  if (eraYear < birthYear) return false
  if (deathYear && eraYear > deathYear) return false
  return true
}

/**
 * Get pronouns based on gender
 */
export function getPronouns(gender: string | null): { 
  subject: string
  object: string
  possessive: string 
} {
  if (gender?.toLowerCase() === 'male') {
    return { subject: 'he', object: 'him', possessive: 'his' }
  }
  if (gender?.toLowerCase() === 'female') {
    return { subject: 'she', object: 'her', possessive: 'her' }
  }
  return { subject: 'they', object: 'them', possessive: 'their' }
}

