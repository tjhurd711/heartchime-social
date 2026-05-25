import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { generateAndUploadPhoto } from '@/lib/geminiImageGen'
import { generateAndUploadGptImageEdit, generateAndUploadTextArtifact } from '@/lib/openaiImageGen'
import { renderAndUploadSocialCard } from '@/lib/socialCardRenderer'
import { renderAndUploadSlide1, TextStyle } from '@/lib/socialSlide1Renderer'
import { buildPhotoPrompt } from '@/lib/socialPhotoPrompt'
import { s3Client } from '@/lib/s3'

export const maxDuration = 300
export const runtime = 'nodejs'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

type TemplateCategory = 'evergreen' | 'trend'
type TemplateAccountType = 'business' | 'persona' | 'both'
type RequestAccountType = 'business' | 'persona'
type OverlayStyle = 'hook' | 'caption' | 'lyric' | 'none'
type SlideType =
  | 'selfie'
  | 'vintage'
  | 'gravesite'
  | 'object'
  | 'ai_generated'
  | 'text_artifact'
  | 'gpt_edit'
  | 'gemini_custom'
  | 'text_card'
  | 'heartchime_card'
  | 'photo_upload_display'
  | 'before_after'
type LegacyEvergreenPostType = 'birthday' | 'passing_anniversary' | 'wedding_anniversary' | 'user_birthday'
type CharacterKey = 'alive' | 'deceased'
type PhotoSource =
  | 'generated'
  | 'variable'
  | 'variable_or_generated'
  | 'reference_previous'
  | 'reference_anchor'
  | 'reference_live_pick'
  | 'upload_transform'
type MotionStyle = 'ai_subtle' | 'kenburns' | 'static_hold'
type LivePhotoOutputOrientation = 'vertical' | 'horizontal'
type LivePhotoFramingMode = 'fill' | 'fit' | 'blur'
type SubjectStatus = 'alive' | 'deceased'
type SubjectGender = 'male' | 'female'
type SubjectRelationship =
  | 'father'
  | 'mother'
  | 'son'
  | 'daughter'
  | 'husband'
  | 'wife'
  | 'brother'
  | 'sister'
  | 'grandfather'
  | 'grandmother'
  | 'grandson'
  | 'granddaughter'
  | 'friend'
  | 'self'
type TemplateVariableValue = string | TemplateSubject[] | undefined
type TemplateVariables = Record<string, TemplateVariableValue>

interface TemplateSubject {
  age_decade: string
  gender: SubjectGender
  ethnicity: string
  status: SubjectStatus
  relationship: SubjectRelationship
}

interface SubjectsConfig {
  enabled: boolean
  min: number
  max: number
  require_one_deceased: boolean
}

interface GenerateFromTemplateRequest {
  template_id: string
  variables: TemplateVariables
  account_type: RequestAccountType
  persona_id?: string
  generate_live_photos?: boolean
  live_photo_slide_orders?: number[]
  live_photo_settings?: Record<string, {
    output_orientation?: LivePhotoOutputOrientation
    framing_mode?: LivePhotoFramingMode
  }>
}

interface PostTemplateSlide {
  order: number
  slide_type: SlideType
  prompt_recipe?: string
  text_overlay?: string
  overlay_style?: OverlayStyle
  motion_hint?: string
  motion_style?: MotionStyle
  live_photo_eligible?: boolean
  live_photo_default?: boolean
  live_photo_output_orientation?: LivePhotoOutputOrientation
  live_photo_framing_mode?: LivePhotoFramingMode
  subjects_config?: SubjectsConfig
  characters?: CharacterKey[]
  photo_source?: PhotoSource
  photo_variable?: string
  photo_variable_name?: string
  variable_name?: string
  note_overlay_variable?: string
  reference_anchor_order?: number
  extra_slide_options?: {
    enabled_variable?: string
    enabled_when_value?: string
  }
}

interface LivePhotoResult {
  order: number
  pvt_zip_url: string
  photo_url: string
  video_url: string
}

interface LivePhotoResponse {
  slide_order: number
  urls: {
    pvt_zip_url: string
    photo_url: string
    video_url: string
  }
}

interface SlideBundleItem {
  order: number
  url: string
  image_url: string
  slide_type: SlideType
  overlay_text: string | null
  live_photo_pvt_url?: string
  reference_pick_key?: string
}

interface PostTemplateRow {
  id: string
  name: string
  category: TemplateCategory
  account_type: TemplateAccountType
  audio_track_name: string | null
  audio_track_url: string | null
  slide_count: number
  slides: unknown
  variables_needed: string[]
  live_photo_supported: boolean
  is_active: boolean
}

const SAILOR_SONG_HARDCODED_NOTE_LINES = {
  note_line_1: 'I sleep so I can see you',
  note_line_2: "'cause I hate to wait so long",
  note_line_3: 'I sleep so that I can see you',
  note_line_4: 'and I hate to wait so long',
} as const

const TRANSPARENT_PX =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WlAbQAAAABJRU5ErkJggg=='
const CURRENT_YEAR = 2026
const LIVE_REFERENCE_SOURCE_BUCKET = 'order-by-age-uploads'
const LIVE_REFERENCE_ALLOWED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.heic', '.webp'])
const UPLOAD_TRANSFORM_ALLOWED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.heic', '.heif', '.webp', '.avif'])
const GENERATED_MEDIA_BUCKET = process.env.S3_BUCKET_NAME || 'heartbeat-photos-prod'

const SUBJECT_RELATIONSHIPS = new Set<SubjectRelationship>([
  'father',
  'mother',
  'son',
  'daughter',
  'husband',
  'wife',
  'brother',
  'sister',
  'grandfather',
  'grandmother',
  'grandson',
  'granddaughter',
  'friend',
  'self',
])

function getStringVariable(variables: TemplateVariables, key: string): string {
  const value = variables[key]
  return typeof value === 'string' ? value : ''
}

function getStringRecordValue(values: Record<string, unknown>, key: string): string {
  const value = values[key]
  return typeof value === 'string' ? value : ''
}

function interpolatePrompt(recipe: string, variables: Record<string, unknown>): string {
  return recipe.replace(/\{([^}]+)\}/g, (_full, rawKey: string) => {
    const key = rawKey.trim()
    const value = variables[key]
    if (value === undefined || value === null || value === '') {
      throw new Error(`Missing template variable: ${key}`)
    }
    if (typeof value !== 'string' && typeof value !== 'number') {
      throw new Error(`Template variable ${key} must be a string`)
    }
    return String(value)
  })
}

function parseSlides(raw: unknown): PostTemplateSlide[] {
  if (!Array.isArray(raw)) {
    throw new Error('Template slides must be an array')
  }

  const slides = raw as PostTemplateSlide[]
  for (const slide of slides) {
    if (typeof slide?.order !== 'number' || !slide?.slide_type) {
      throw new Error('Template slide is missing required fields: order, slide_type')
    }
  }

  return slides.sort((a, b) => a.order - b.order)
}

function normalizeEthnicity(value: string): string {
  return value.replace(/_/g, ' ')
}

function genderToNoun(value: string): string {
  if (value === 'male') return 'man'
  if (value === 'female') return 'woman'
  return value
}

function buildCharacterDescriptions(
  slide: PostTemplateSlide,
  variables: TemplateVariables
): Record<string, string> {
  const interpolationContext: Record<string, string> = {}
  const characters = slide.characters || []

  for (const character of characters) {
    const age = getStringVariable(variables, `${character}_age`)
    const gender = getStringVariable(variables, `${character}_gender`)
    const ethnicity = getStringVariable(variables, `${character}_ethnicity`)

    if (age && gender && ethnicity) {
      interpolationContext[`${character}_description`] =
        `a ${age} ${genderToNoun(gender)}, ${normalizeEthnicity(ethnicity)}`
    }
  }

  return interpolationContext
}

function getSlideSubjectsVariableName(slide: PostTemplateSlide): string {
  return `slide_${slide.order}_subjects`
}

function getSlideSubjects(slide: PostTemplateSlide, variables: TemplateVariables): TemplateSubject[] {
  const value = variables[getSlideSubjectsVariableName(slide)]
  return Array.isArray(value) ? value : []
}

function ageDecadeToPromptAge(value: string): string {
  if (value === '0-12') return 'young'
  if (value === 'teens') return 'teenage'

  const decade = value.match(/^(\d+)s$/)
  if (decade) {
    return `${decade[1]}-year-old`
  }

  return value
}

function subjectPronoun(subject: TemplateSubject): 'his' | 'her' {
  return subject.gender === 'female' ? 'her' : 'his'
}

function describeAnchorSubject(subject: TemplateSubject): string {
  return `A ${ageDecadeToPromptAge(subject.age_decade)} ${normalizeEthnicity(subject.ethnicity)} ${genderToNoun(subject.gender)}`
}

function describeRelatedSubject(subject: TemplateSubject): string {
  const age = ageDecadeToPromptAge(subject.age_decade)
  const agePrefix = age === 'young' || age === 'teenage' ? age : `${age} ${normalizeEthnicity(subject.ethnicity)}`
  return `${agePrefix} ${subject.relationship}`
}

function buildSubjectsDescription(subjects: TemplateSubject[]): string {
  const deceasedSubject = subjects.find((subject) => subject.status === 'deceased') || subjects[0]
  const relatedSubjects = subjects.filter((subject) => subject !== deceasedSubject)
  const anchorDescription = describeAnchorSubject(deceasedSubject)
  const pronoun = subjectPronoun(deceasedSubject)

  if (relatedSubjects.length === 0) {
    return anchorDescription
  }

  if (relatedSubjects.length === 1) {
    return `${anchorDescription} standing next to ${pronoun} ${describeRelatedSubject(relatedSubjects[0])}`
  }

  const relatedDescriptions = relatedSubjects.map((subject) => `${pronoun} ${describeRelatedSubject(subject)}`)
  const lastDescription = relatedDescriptions.pop()
  return `${anchorDescription} with ${relatedDescriptions.join(', ')} and ${lastDescription}`
}

function buildSubjectsContext(
  slide: PostTemplateSlide,
  variables: TemplateVariables
): Record<string, string> {
  if (!slide.subjects_config?.enabled) {
    return {}
  }

  return {
    subjects_description: buildSubjectsDescription(getSlideSubjects(slide, variables)),
  }
}

function expectedPeopleCountForSlide(
  slide: PostTemplateSlide,
  slidesByOrder: Map<number, PostTemplateSlide>,
  variables: TemplateVariables
): number | null {
  if (slide.subjects_config?.enabled) {
    const count = getSlideSubjects(slide, variables).length
    return count > 0 ? count : null
  }

  if (slide.photo_source === 'reference_anchor' && typeof slide.reference_anchor_order === 'number') {
    const anchorSlide = slidesByOrder.get(slide.reference_anchor_order)
    if (!anchorSlide?.subjects_config?.enabled) {
      return null
    }
    const count = getSlideSubjects(anchorSlide, variables).length
    return count > 0 ? count : null
  }

  return null
}

function applyPeopleCountConstraint(
  prompt: string,
  slide: PostTemplateSlide,
  slidesByOrder: Map<number, PostTemplateSlide>,
  variables: TemplateVariables
): string {
  const expectedCount = expectedPeopleCountForSlide(slide, slidesByOrder, variables)
  if (!expectedCount || !prompt.trim()) {
    return prompt
  }

  const personLabel = expectedCount === 1 ? 'person' : 'people'
  const strictConstraint =
    `People-count lock: Show exactly ${expectedCount} ${personLabel} in total. ` +
    'Do not add extra people anywhere in the frame (foreground or background), no bystanders, no crowds, no extra faces, and no reflections of additional people.'
  const compositionConstraint = expectedCount === 1
    ? 'Framing/composition lock: Keep the person at an everyday medium or medium-wide distance, not a tight close-up. Subject should occupy roughly 20-35% of the frame height, with clear surrounding environment visible.'
    : 'Framing/composition lock: Keep people naturally spaced (not shoulder-to-shoulder pressed together) with visible space between bodies. Use a medium-wide candid phone framing so the group occupies only about 25-45% of the frame, with lots of environment around them.'
  const referenceOutfitConstraint = slide.photo_source === 'reference_anchor'
    ? 'Make sure the person or people are in different outfits than the ones in the original photo.'
    : ''
  const constraintParts = [strictConstraint, compositionConstraint, referenceOutfitConstraint]
    .filter((part) => part.trim().length > 0)

  return `${prompt}\n\n${constraintParts.join('\n')}`
}

function buildPhotoBlurDescription(variables: TemplateVariables, slideOrder?: number): string {
  const perSlideKey = typeof slideOrder === 'number' ? `photo_blur_level_${slideOrder}` : null
  const rawValue = perSlideKey ? getStringVariable(variables, perSlideKey) : null
  const fallbackRawValue = getStringVariable(variables, 'photo_blur_level')
  const rawLevel = Number.parseInt(rawValue || fallbackRawValue, 10)
  const level = Number.isNaN(rawLevel) ? 1 : Math.min(10, Math.max(1, rawLevel))

  if (level <= 1) {
    return 'Blur level 1/10: mostly clear handheld phone photo, no intentional blur.'
  }

  if (level <= 3) {
    return `Blur level ${level}/10: slight natural softness and minor motion blur on edges.`
  }

  if (level <= 6) {
    return `Blur level ${level}/10: noticeable handheld blur across people and background; avoid tack-sharp edges.`
  }

  if (level <= 8) {
    return `Blur level ${level}/10: strong handheld motion blur and soft focus; faces and clothing should not look crisp.`
  }

  return `Blur level ${level}/10: very strong blur with heavy motion smear; scene still recognizable but no sharp facial detail.`
}

function buildPhotoFilterDescription(variables: TemplateVariables): string {
  const filterStyle = getStringVariable(variables, 'photo_filter_style')

  if (!filterStyle || filterStyle === 'none') {
    return ''
  }

  if (filterStyle === 'black_and_white') {
    return 'Filter: black-and-white monochrome with realistic grayscale contrast.'
  }

  if (filterStyle === 'old_timey') {
    return 'Filter: old-timey vintage film with soft sepia, gentle grain, and lightly faded highlights.'
  }

  if (filterStyle === 'faded_film') {
    return 'Filter: faded film look with mild desaturation, warm highlights, soft contrast, and light grain.'
  }

  return ''
}

function applyPhotoGenerationStyle(prompt: string, variables: TemplateVariables, slideOrder?: number): string {
  if (!prompt.trim()) {
    return prompt
  }

  const filterDescription = buildPhotoFilterDescription(variables)
  const blurDescription = buildPhotoBlurDescription(variables, slideOrder)
  const styleParts = [filterDescription, blurDescription].filter((part) => part.trim().length > 0)

  if (styleParts.length === 0) {
    return prompt
  }

  const styleLock = `STYLE LOCK (high priority): ${styleParts.join(' ')}`
  return `${styleLock}\n\n${prompt}`
}

function applyTemplateOrientationConstraint(
  prompt: string,
  templateName: string,
  slide: PostTemplateSlide
): string {
  if (!prompt.trim()) {
    return prompt
  }

  if (templateName !== 'Sailor Song' || slide.slide_type !== 'ai_generated') {
    return prompt
  }

  const orientationLock =
    'ORIENTATION LOCK (high priority): Generate a horizontal landscape image (not vertical portrait). Use wide landscape composition with a broad scene.'

  return `${orientationLock}\n\n${prompt}`
}

function parseEraStartYear(value: string): number | null {
  const match = value.match(/^(\d{4})s$/)
  return match ? Number(match[1]) : null
}

function estimateSubjectAgeInPhoto(ageDecade: string): number | null {
  if (ageDecade === '0-12') return 4
  if (ageDecade === 'teens') return 16

  const decade = ageDecade.match(/^(\d+)s$/)
  if (decade) {
    return Number(decade[1]) + 5
  }

  const parsed = Number.parseInt(ageDecade, 10)
  return Number.isNaN(parsed) ? null : parsed
}

function pluralizePeople(count: number): string {
  if (count === 1) return 'one person'
  if (count === 2) return 'two people'
  if (count === 3) return 'three people'
  return `${count} people`
}

function describeMemorialAttendee(subject: TemplateSubject, yearsSincePhoto: number): string {
  const estimatedPhotoAge = estimateSubjectAgeInPhoto(subject.age_decade)
  const currentAge = estimatedPhotoAge === null ? null : estimatedPhotoAge + yearsSincePhoto
  const ageDescription = currentAge === null ? '' : `, now around ${currentAge} years old`

  return `a ${normalizeEthnicity(subject.ethnicity)} ${subject.relationship}${ageDescription}`
}

function parseSelectedMemorialSubjectIndexes(value: string): number[] {
  return value
    .split(',')
    .map((index) => Number.parseInt(index.trim(), 10))
    .filter((index) => !Number.isNaN(index))
}

function buildMemorialAttendeesDescription(
  slide: PostTemplateSlide,
  variables: TemplateVariables
): string {
  const slideOneSubjects = getSlideSubjects({ ...slide, order: 1 }, variables)
  const selectedIndexes = parseSelectedMemorialSubjectIndexes(
    getStringVariable(variables, `slide_${slide.order}_memorial_attendee_indices`)
  )
  const selectedSubjects = selectedIndexes
    .map((index) => slideOneSubjects[index])
    .filter((subject): subject is TemplateSubject => !!subject && subject.status !== 'deceased')

  if (selectedSubjects.length === 0) {
    return 'No people are visible; only the memorial/headstone, flowers, unlit candles, and quiet surroundings are shown'
  }

  const eraStartYear = parseEraStartYear(getStringVariable(variables, 'era')) ?? CURRENT_YEAR
  const yearsSincePhoto = Math.max(0, CURRENT_YEAR - eraStartYear)
  const attendeeDescriptions = selectedSubjects.map((subject) => describeMemorialAttendee(subject, yearsSincePhoto))

  return `${pluralizePeople(selectedSubjects.length)} from the earlier photo are present at the memorial: ${attendeeDescriptions.join(', ')}. Their faces must not be visible; show backs turned, hands placing flowers, shoulders cropped below the face, silhouettes, or a blurred side/back view only`
}

function buildMemorialSceneDescription(variables: TemplateVariables): string {
  const sceneType = getStringVariable(variables, 'memorial_scene_type') || 'headstone_classic'
  const location = getStringVariable(variables, 'memorial_location') || 'cemetery'
  const inscription = getStringVariable(variables, 'memorial_inscription') || 'Love you forever, Jimmy'
  const urnColor = getStringVariable(variables, 'memorial_urn_color') || 'deep navy blue ceramic with subtle gold accents'
  const keepsake = getStringVariable(variables, 'memorial_keepsake')
  const headstoneFlowerDesign = getStringVariable(variables, 'memorial_headstone_flower_design') || 'small rose or lily relief'
  const cameraAngle = getStringVariable(variables, 'memorial_camera_angle') || 'left'
  const cameraDistance = getStringVariable(variables, 'memorial_camera_distance') || 'far'

  const locationDescription: Record<string, string> = {
    cemetery: 'in a quiet cemetery',
    backyard: 'in a peaceful backyard memorial area',
    roadside: 'at a small roadside memorial',
    park: 'in a quiet park memorial area',
    home_garden: 'in a small home garden memorial area',
    shelf: 'displayed on a shelf or mantelpiece indoors, with soft home lighting',
  }
  const setting = locationDescription[location] || location.replace(/_/g, ' ')
  const cameraAngleDescription: Record<string, string> = {
    left: 'The photo is taken from a clear left-side angle instead of straight-on, with the memorial off-center like an imperfect phone snapshot.',
    'center left': 'The photo is taken from a subtle center-left angle, almost straight-on but slightly offset, with the memorial off-center like an imperfect phone snapshot.',
    'center right': 'The photo is taken from a subtle center-right angle, almost straight-on but slightly offset, with the memorial off-center like an imperfect phone snapshot.',
    right: 'The photo is taken from a clear right-side angle instead of straight-on, with the memorial off-center like an imperfect phone snapshot.',
  }
  const cameraAnglePrompt = cameraAngleDescription[cameraAngle] || cameraAngleDescription.left
  const cameraDistanceDescription: Record<string, string> = {
    close: 'Camera distance: close, about 6-10 feet away. The memorial can occupy about 30-40% of the image height.',
    medium: 'Camera distance: medium, about 12-18 feet away. The memorial should occupy about 20-30% of the image height.',
    far: 'Camera distance: far, about 20-30 feet away. The memorial should occupy only about 10-20% of the image height, with lots of surrounding environment visible.',
    'very far': 'Camera distance: very far, about 30-45 feet away. The memorial should be small in the frame, only about 5-12% of the image height, with most of the image showing surrounding environment and open space.',
  }
  const cameraDistancePrompt = cameraDistanceDescription[cameraDistance] || cameraDistanceDescription.far
  const keepsakeSentence = keepsake ? ` Include a personal keepsake placed near the memorial: ${keepsake}.` : ''

  if (sceneType === 'headstone_rounded') {
    return `A rounded-top stone headstone ${setting}, fully visible from an amateur documentary phone-photo distance. ${cameraDistancePrompt} ${cameraAnglePrompt} The headstone is engraved with exactly this inscription: "${inscription}". The inscription is carved into the stone in an elegant serif script, not printed or overlaid. Add a subtle carved flower design near the inscription: ${headstoneFlowerDesign}. Flowers, unlit candles, grass or path, and surrounding environment are visible.${keepsakeSentence}`
  }

  if (sceneType === 'headstone_flat') {
    return `A low flat grave marker or beveled stone memorial ${setting}, photographed from an amateur documentary phone-photo distance. ${cameraDistancePrompt} ${cameraAnglePrompt} The marker is engraved with exactly this inscription: "${inscription}". The inscription is carved into the stone in an elegant serif script, not printed or overlaid. Add a subtle carved flower design on the stone: ${headstoneFlowerDesign}. Flowers, unlit candles, grass or path, and surrounding environment are visible.${keepsakeSentence}`
  }

  if (sceneType === 'urn') {
    const urnPlacement = location === 'shelf'
      ? 'placed on a shelf or mantelpiece with flowers, a framed photo, and unlit candles nearby'
      : 'placed on a small table, stone base, or memorial cloth with flowers and unlit candles around it'

    return `A respectful urn memorial ${setting}, photographed from an amateur documentary phone-photo distance. ${cameraDistancePrompt} ${cameraAnglePrompt} The urn is ${urnColor}, ${urnPlacement}. A small tasteful card or plaque may be present, but any writing is too small or too far away to read. No readable names, dates, or inscriptions.`
  }

  if (sceneType === 'bouquet') {
    const bouquetKeepsake = keepsake ? `, with a personal keepsake beside them: ${keepsake}` : ''
    return `A bouquet-of-flowers memorial ${setting}, photographed from an amateur documentary phone-photo distance. ${cameraDistancePrompt} ${cameraAnglePrompt} Fresh flowers are arranged as the main memorial, with unlit candles${bouquetKeepsake}. A small tasteful card or ribbon may be present, but any writing is too small or too far away to read. Frame the bouquet memorial and open surroundings only; no headstones, grave markers, cemetery stones, or stone monuments anywhere in the image, including the background. No readable names, dates, or inscriptions.`
  }

  return `A classic upright stone headstone ${setting}, fully visible from an amateur documentary phone-photo distance. ${cameraDistancePrompt} ${cameraAnglePrompt} The headstone is engraved with exactly this inscription: "${inscription}". The inscription is carved into the stone in an elegant serif script, not printed or overlaid. Add a subtle carved flower design on the headstone beside the inscription: ${headstoneFlowerDesign}. Flowers, unlit candles, grass or path, and surrounding environment are visible.${keepsakeSentence}`
}

function buildMemorialContext(
  slide: PostTemplateSlide,
  variables: TemplateVariables
): Record<string, string> {
  return {
    memorial_attendees_description: buildMemorialAttendeesDescription(slide, variables),
    memorial_scene_description: buildMemorialSceneDescription(variables),
  }
}

function validateSlideSubjects(slide: PostTemplateSlide, variables: TemplateVariables): string | null {
  const config = slide.subjects_config
  if (!config?.enabled) {
    return null
  }

  const subjects = getSlideSubjects(slide, variables)
  const variableName = getSlideSubjectsVariableName(slide)

  if (subjects.length < config.min || subjects.length > config.max) {
    return `${variableName} must include between ${config.min} and ${config.max} subject(s)`
  }

  for (const [index, subject] of subjects.entries()) {
    if (
      !subject.age_decade ||
      !subject.gender ||
      !subject.ethnicity ||
      !subject.status ||
      !subject.relationship
    ) {
      return `${variableName}[${index}] is missing required subject fields`
    }
    if (subject.status !== 'alive' && subject.status !== 'deceased') {
      return `${variableName}[${index}].status must be alive or deceased`
    }
    if (subject.gender !== 'male' && subject.gender !== 'female') {
      return `${variableName}[${index}].gender must be male or female`
    }
    if (!SUBJECT_RELATIONSHIPS.has(subject.relationship)) {
      return `${variableName}[${index}].relationship is not supported`
    }
  }

  if (config.require_one_deceased) {
    const deceasedCount = subjects.filter((subject) => subject.status === 'deceased').length
    if (deceasedCount !== 1) {
      return `${variableName} must include exactly one deceased subject`
    }
  }

  return null
}

function resolvePhotoVariableName(slide: PostTemplateSlide): string | null {
  return slide.photo_variable || slide.photo_variable_name || slide.variable_name || null
}

function isSlideEnabled(slide: PostTemplateSlide, variables: TemplateVariables): boolean {
  const enabledVariable = slide.extra_slide_options?.enabled_variable
  if (!enabledVariable) {
    return true
  }

  const expectedValue = slide.extra_slide_options?.enabled_when_value ?? 'true'
  return getStringVariable(variables, enabledVariable) === expectedValue
}

function getLiveReferenceVariableName(slideOrder: number): string {
  return `slide_${slideOrder}_reference_pick_key`
}

function getUploadTransformVariableName(slideOrder: number): string {
  return `slide_${slideOrder}_upload_key`
}

type GeminiCustomReferenceSource = 'none' | 'previous'

function getGeminiCustomReferenceSourceVariableName(slideOrder: number): string {
  return `slide_${slideOrder}_reference_source`
}

function resolveGeminiCustomReferenceSource(value: string): GeminiCustomReferenceSource {
  return value === 'previous' ? 'previous' : 'none'
}

function isAllowedLiveReferenceKey(key: string): boolean {
  const lower = key.toLowerCase()
  return Array.from(LIVE_REFERENCE_ALLOWED_EXTENSIONS).some((extension) => lower.endsWith(extension))
}

function isAllowedUploadTransformKey(key: string): boolean {
  if (!key.startsWith('social-uploads/')) {
    return false
  }
  const lower = key.toLowerCase()
  return Array.from(UPLOAD_TRANSFORM_ALLOWED_EXTENSIONS).some((extension) => lower.endsWith(extension))
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

async function mintUploadTransformPresignedUrl(key: string): Promise<string> {
  return getSignedUrl(
    s3Client,
    new GetObjectCommand({
      Bucket: GENERATED_MEDIA_BUCKET,
      Key: key,
    }),
    { expiresIn: 60 * 60 }
  )
}

function applyStyleOnlyReferencePrompt(prompt: string): string {
  const styleOnlyConstraint =
    'STYLE-ONLY REFERENCE LOCK (highest priority): Create another photo just like this reference photo but with different people and a slightly different setting. Other than that the photo should look the exact same - this should not look like a stock photo, if there was glare keep it, if bad lighting keep it, truly only look to make the people different and thats it. RELATIONSHIP LOCK (highest priority): Preserve the same relationship roles and composition from the reference image. Do not swap who is who (for example, father/daughter must stay father/daughter), do not flip generational roles, and do not change the apparent gender role pairing implied by the reference composition. Keep the awkwardness: imperfect lighting, awkward expressions, slight blur/soft focus, and real phone-photo messiness.'

  if (!prompt.trim()) {
    return styleOnlyConstraint
  }

  return `${styleOnlyConstraint}\n\n${prompt}`
}

function applyIdentityTransformReferencePrompt(prompt: string): string {
  const transformLead =
    'Recreate this exact photo as a completely different person — new face/identity — keeping the same selfie composition, framing, bland lighting, and amateur quality.'

  if (!prompt.trim()) {
    return transformLead
  }

  return `${transformLead}\n\n${prompt}`
}

function applyReferencePreviousEditPrompt(prompt: string): string {
  const referenceLead =
    'Edit the attached image from the previous slide as the starting frame. Preserve identity and visual continuity unless the prompt explicitly asks to change something.'

  if (!prompt.trim()) {
    return referenceLead
  }

  return `${referenceLead}\n\n${prompt}`
}

function resolveOverlayText(
  slide: PostTemplateSlide,
  variables: Record<string, unknown>,
  interpolatedPrompt?: string
): string | null {
  const style = slide.overlay_style ?? 'none'
  if (style === 'none') {
    return null
  }

  if (style === 'hook') {
    return getStringRecordValue(variables, 'hook') || (slide.text_overlay ? interpolatePrompt(slide.text_overlay, variables) : null)
  }

  if (slide.text_overlay) {
    return interpolatePrompt(slide.text_overlay, variables)
  }

  return interpolatedPrompt || null
}

function resolveNoteOverlayText(slide: PostTemplateSlide, variables: Record<string, unknown>): string | null {
  if (!slide.note_overlay_variable) {
    return null
  }

  return getStringRecordValue(variables, slide.note_overlay_variable) || null
}

function normalizeLivePhotoDownloadUrl(downloadUrl: string, livePhotoServerUrl: string): string {
  const baseUrl = livePhotoServerUrl.replace(/\/$/, '')

  try {
    const parsedDownloadUrl = new URL(downloadUrl)
    // For live-photo download endpoints, always use the configured server base.
    // This guarantees pvt_zip_url is anchored to LIVE_PHOTO_SERVER_URL.
    if (parsedDownloadUrl.pathname.startsWith('/download/')) {
      return `${baseUrl}${parsedDownloadUrl.pathname}${parsedDownloadUrl.search}${parsedDownloadUrl.hash}`
    }

    // For non-download absolute URLs (e.g. signed external storage links), keep unchanged.
    return parsedDownloadUrl.toString()
  } catch {
    const path = downloadUrl.startsWith('/') ? downloadUrl : `/${downloadUrl}`
    return `${baseUrl}${path}`
  }
}

function parseS3ObjectFromUrl(rawUrl: string): { bucket: string; key: string } | null {
  try {
    const parsed = new URL(rawUrl)
    const host = parsed.hostname
    const key = parsed.pathname.replace(/^\/+/, '')
    if (!key) return null

    const regionalHostMatch = host.match(/^(.+)\.s3\.[^.]+\.amazonaws\.com$/)
    if (regionalHostMatch?.[1]) {
      return { bucket: regionalHostMatch[1], key }
    }

    const legacyHostMatch = host.match(/^(.+)\.s3\.amazonaws\.com$/)
    if (legacyHostMatch?.[1]) {
      return { bucket: legacyHostMatch[1], key }
    }

    return null
  } catch {
    return null
  }
}

async function toLivePhotoSourceImageUrl(imageUrl: string): Promise<string> {
  const s3Target = parseS3ObjectFromUrl(imageUrl)
  if (!s3Target) {
    return imageUrl
  }

  // Use a short-lived signed URL so the live-photo service can always fetch source images,
  // even if bucket/object public access policies change.
  return getSignedUrl(
    s3Client,
    new GetObjectCommand({
      Bucket: s3Target.bucket || GENERATED_MEDIA_BUCKET,
      Key: s3Target.key,
    }),
    { expiresIn: 60 * 30 }
  )
}

function isLivePhotoContentPolicyViolation(status: number, responseText: string): boolean {
  if (status !== 422) return false
  return /content policy violation/i.test(responseText)
}

function overlayStyleToTextStyle(style: OverlayStyle | undefined): TextStyle {
  if (style === 'lyric') return 'lyric'
  return style === 'caption' ? 'clean' : 'snapchat'
}

function resolveEvergreenLegacyPrompt(
  templateCategory: TemplateCategory,
  slideType: SlideType,
  variables: TemplateVariables
): string | null {
  if (templateCategory !== 'evergreen') return null
  if (slideType !== 'selfie' && slideType !== 'vintage') return null

  const relationship = getStringVariable(variables, 'relationship')
  const era = getStringVariable(variables, 'era')
  if (!relationship || !era) return null

  const requestedPostType = getStringVariable(variables, 'post_type') as LegacyEvergreenPostType | ''
  const postType: LegacyEvergreenPostType =
    requestedPostType && ['birthday', 'passing_anniversary', 'wedding_anniversary', 'user_birthday'].includes(requestedPostType)
      ? requestedPostType
      : 'birthday'

  // Preserve legacy evergreen vintage-photo prompt generation exactly.
  return buildPhotoPrompt(postType, relationship, 'female', '40s', era, undefined)
}

export async function POST(request: NextRequest) {
  try {
    const body: GenerateFromTemplateRequest = await request.json()
    const {
      template_id,
      variables,
      account_type,
      persona_id,
      generate_live_photos = false,
      live_photo_slide_orders,
      live_photo_settings,
    } = body

    if (!template_id) {
      return NextResponse.json({ error: 'Missing required field: template_id' }, { status: 400 })
    }
    if (!variables || typeof variables !== 'object') {
      return NextResponse.json({ error: 'Missing required field: variables' }, { status: 400 })
    }
    if (!account_type || !['business', 'persona'].includes(account_type)) {
      return NextResponse.json({ error: 'Invalid account_type. Must be business or persona' }, { status: 400 })
    }
    if (account_type === 'persona' && !persona_id) {
      return NextResponse.json({ error: 'persona_id is required when account_type is persona' }, { status: 400 })
    }

    const { data: template, error: templateError } = await supabase
      .from('post_templates')
      .select('*')
      .eq('id', template_id)
      .eq('is_active', true)
      .single()

    if (templateError || !template) {
      return NextResponse.json({ error: 'Template not found or inactive' }, { status: 404 })
    }

    const typedTemplate = template as PostTemplateRow
    if (typedTemplate.name === 'Sailor Song') {
      Object.assign(variables, SAILOR_SONG_HARDCODED_NOTE_LINES)
    }

    if (typedTemplate.account_type !== 'both' && typedTemplate.account_type !== account_type) {
      return NextResponse.json(
        { error: `Template account_type ${typedTemplate.account_type} does not support ${account_type}` },
        { status: 400 }
      )
    }
    if ((generate_live_photos || (live_photo_slide_orders && live_photo_slide_orders.length > 0)) && !typedTemplate.live_photo_supported) {
      return NextResponse.json(
        { error: 'This template does not support live photo generation' },
        { status: 400 }
      )
    }

    const slides = parseSlides(typedTemplate.slides)
    const activeSlides = slides.filter((slide) => isSlideEnabled(slide, variables))
    const activeSlidesByOrder = new Map(activeSlides.map((slide) => [slide.order, slide]))
    if (activeSlides.length === 0) {
      return NextResponse.json({ error: 'No enabled slides found for this template request' }, { status: 400 })
    }
    const subjectDrivenDemographicFields = new Set<string>()
    for (const slide of activeSlides) {
      if (!slide.subjects_config?.enabled) {
        continue
      }

      for (const character of slide.characters || []) {
        subjectDrivenDemographicFields.add(`${character}_age`)
        subjectDrivenDemographicFields.add(`${character}_gender`)
        subjectDrivenDemographicFields.add(`${character}_ethnicity`)
      }
    }

    const missingVariables = (typedTemplate.variables_needed || [])
      .filter((name) => !subjectDrivenDemographicFields.has(name))
      .filter((name) => {
        const value = variables[name]
        return typeof value !== 'string' || value.trim() === ''
      })

    const slideDerivedMissing = new Set<string>()
    for (const slide of activeSlides) {
      const subjectValidationError = validateSlideSubjects(slide, variables)
      if (subjectValidationError) {
        return NextResponse.json({ error: subjectValidationError }, { status: 400 })
      }

      if (!slide.subjects_config?.enabled) {
        for (const character of slide.characters || []) {
          slideDerivedMissing.add(`${character}_age`)
          slideDerivedMissing.add(`${character}_gender`)
          slideDerivedMissing.add(`${character}_ethnicity`)
        }
      }

      if (slide.photo_source === 'variable' || slide.slide_type === 'photo_upload_display') {
        const photoVariableName = resolvePhotoVariableName(slide)
        if (!photoVariableName) {
          return NextResponse.json(
            { error: `Slide order ${slide.order} uses photo_source=variable but is missing photo variable name` },
            { status: 400 }
          )
        }
        slideDerivedMissing.add(photoVariableName)
      } else if (slide.photo_source === 'variable_or_generated') {
        const photoVariableName = resolvePhotoVariableName(slide)
        if (!photoVariableName) {
          return NextResponse.json(
            { error: `Slide order ${slide.order} uses photo_source=variable_or_generated but is missing photo variable name` },
            { status: 400 }
          )
        }
      } else if (slide.photo_source === 'reference_live_pick') {
        const liveReferenceKeyVariable = getLiveReferenceVariableName(slide.order)
        const referencePickKey = getStringVariable(variables, liveReferenceKeyVariable)
        if (!referencePickKey) {
          return NextResponse.json(
            { error: `Slide order ${slide.order} uses photo_source=reference_live_pick but is missing ${liveReferenceKeyVariable}` },
            { status: 400 }
          )
        }
        if (!isAllowedLiveReferenceKey(referencePickKey)) {
          return NextResponse.json(
            { error: `Slide order ${slide.order} has invalid reference pick key extension: ${referencePickKey}` },
            { status: 400 }
          )
        }
      } else if (slide.photo_source === 'upload_transform') {
        const uploadTransformVariable = getUploadTransformVariableName(slide.order)
        const uploadTransformKey = getStringVariable(variables, uploadTransformVariable)
        if (!uploadTransformKey) {
          return NextResponse.json(
            {
              error: `Slide order ${slide.order} uses photo_source=upload_transform but is missing ${uploadTransformVariable}`,
            },
            { status: 400 }
          )
        }
        if (!isAllowedUploadTransformKey(uploadTransformKey)) {
          return NextResponse.json(
            {
              error: `Slide order ${slide.order} has invalid upload transform key: ${uploadTransformKey}`,
            },
            { status: 400 }
          )
        }
      }
    }

    const allMissingVariables = [...new Set([...missingVariables, ...slideDerivedMissing])].filter((name) => {
      const value = variables[name]
      return typeof value !== 'string' || value.trim() === ''
    })

    if (allMissingVariables.length > 0) {
      return NextResponse.json(
        { error: `Missing required variables: ${allMissingVariables.join(', ')}` },
        { status: 400 }
      )
    }

    const slideResults: Array<{ order: number; url: string; slide_type: SlideType; overlay_text: string | null }> = []
    let latestImageUrl: string | null = null
    let evergreenCardPhotoUrl: string | null = null
    const referenceImageBySlideOrder = new Map<number, string>()
    const referencePickKeyBySlideOrder = new Map<number, string>()

    for (const slide of activeSlides) {
      const interpolationContext = {
        ...variables,
        ...buildCharacterDescriptions(slide, variables),
        ...buildSubjectsContext(slide, variables),
        ...buildMemorialContext(slide, variables),
      }

      let interpolatedPrompt = slide.prompt_recipe
        ? interpolatePrompt(slide.prompt_recipe, interpolationContext)
        : ''
      const legacyEvergreenPrompt = resolveEvergreenLegacyPrompt(
        typedTemplate.category,
        slide.slide_type,
        variables
      )
      if (legacyEvergreenPrompt) {
        interpolatedPrompt = legacyEvergreenPrompt
      }
      interpolatedPrompt = applyPeopleCountConstraint(interpolatedPrompt, slide, activeSlidesByOrder, variables)
      interpolatedPrompt = applyTemplateOrientationConstraint(interpolatedPrompt, typedTemplate.name, slide)
      const noteOverlayText = resolveNoteOverlayText(slide, interpolationContext)

      if (slide.slide_type === 'heartchime_card') {
        if (typedTemplate.category === 'evergreen' && !evergreenCardPhotoUrl) {
          const cardPhotoPrompt = resolveEvergreenLegacyPrompt(
            typedTemplate.category,
            'vintage',
            variables
          )
          if (cardPhotoPrompt) {
            evergreenCardPhotoUrl = await generateAndUploadPhoto(applyPhotoGenerationStyle(cardPhotoPrompt, variables, slide.order))
          }
        }

        const photoVariableName = slide.photo_source === 'variable' ? resolvePhotoVariableName(slide) : null
        const variablePhoto = photoVariableName ? getStringRecordValue(interpolationContext, photoVariableName) : null
        const cardPhoto = variablePhoto || evergreenCardPhotoUrl || latestImageUrl || ''
        const cardMessage =
          interpolatedPrompt ||
          getStringVariable(variables, 'card_message') ||
          `Remembering ${getStringVariable(variables, 'deceased_name') || 'your loved one'} with love.`
        const cardUrl = await renderAndUploadSocialCard(cardPhoto, cardMessage)
        slideResults.push({ order: slide.order, url: cardUrl, slide_type: slide.slide_type, overlay_text: noteOverlayText })
        latestImageUrl = cardUrl
        referenceImageBySlideOrder.set(slide.order, cardPhoto || cardUrl)
        continue
      }

      if (slide.slide_type === 'selfie' && getStringVariable(variables, 'selfie_url')) {
        const overlayText = resolveOverlayText(slide, interpolationContext, interpolatedPrompt)
        const selfieUrl = overlayText && overlayText.trim()
          ? await renderAndUploadSlide1(
              getStringVariable(variables, 'selfie_url'),
              overlayText,
              overlayStyleToTextStyle(slide.overlay_style)
            )
          : getStringVariable(variables, 'selfie_url')

        slideResults.push({ order: slide.order, url: selfieUrl, slide_type: slide.slide_type, overlay_text: noteOverlayText })
        latestImageUrl = selfieUrl
        referenceImageBySlideOrder.set(slide.order, selfieUrl)
        continue
      }

      if (slide.slide_type === 'text_card') {
        const textBody = interpolatedPrompt || slide.text_overlay || getStringRecordValue(interpolationContext, 'hook') || 'HeartChime'
        const textCardUrl = await renderAndUploadSlide1(
          TRANSPARENT_PX,
          textBody,
          overlayStyleToTextStyle(slide.overlay_style)
        )
        slideResults.push({ order: slide.order, url: textCardUrl, slide_type: slide.slide_type, overlay_text: noteOverlayText })
        latestImageUrl = textCardUrl
        referenceImageBySlideOrder.set(slide.order, textCardUrl)
        continue
      }

      if (slide.slide_type === 'photo_upload_display') {
        const photoVariableName = resolvePhotoVariableName(slide)
        if (!photoVariableName) {
          throw new Error(`Slide order ${slide.order} (photo_upload_display) is missing photo variable name`)
        }

        const sourcePhotoUrl = getStringRecordValue(interpolationContext, photoVariableName)
        if (!sourcePhotoUrl) {
          throw new Error(`Slide order ${slide.order} is missing required photo variable: ${photoVariableName}`)
        }

        const overlayText = resolveOverlayText(slide, interpolationContext, interpolatedPrompt)
        const finalUrl =
          overlayText && overlayText.trim()
            ? await renderAndUploadSlide1(sourcePhotoUrl, overlayText, overlayStyleToTextStyle(slide.overlay_style))
            : sourcePhotoUrl

        slideResults.push({ order: slide.order, url: finalUrl, slide_type: slide.slide_type, overlay_text: noteOverlayText })
        latestImageUrl = finalUrl
        referenceImageBySlideOrder.set(slide.order, sourcePhotoUrl)
        continue
      }

      if (slide.slide_type === 'text_artifact') {
        const artifactUrl = await generateAndUploadTextArtifact(interpolatedPrompt)
        if (!artifactUrl) {
          throw new Error(`Failed to generate text artifact image for slide order ${slide.order}`)
        }

        const overlayText = resolveOverlayText(slide, interpolationContext, interpolatedPrompt)
        const finalUrl =
          overlayText && overlayText.trim()
            ? await renderAndUploadSlide1(artifactUrl, overlayText, overlayStyleToTextStyle(slide.overlay_style))
            : artifactUrl

        slideResults.push({ order: slide.order, url: finalUrl, slide_type: slide.slide_type, overlay_text: noteOverlayText })
        latestImageUrl = finalUrl
        referenceImageBySlideOrder.set(slide.order, artifactUrl)
        continue
      }

      if (slide.slide_type === 'gpt_edit') {
        const previousSlideImageUrl = referenceImageBySlideOrder.get(slide.order - 1) || latestImageUrl
        if (!previousSlideImageUrl) {
          throw new Error(`Slide order ${slide.order} requires a previous slide image for gpt_edit`)
        }

        const editedImageUrl = await generateAndUploadGptImageEdit(interpolatedPrompt, previousSlideImageUrl)
        if (!editedImageUrl) {
          throw new Error(`Failed to generate GPT edit image for slide order ${slide.order}`)
        }

        const overlayText = resolveOverlayText(slide, interpolationContext, interpolatedPrompt)
        const finalUrl =
          overlayText && overlayText.trim()
            ? await renderAndUploadSlide1(editedImageUrl, overlayText, overlayStyleToTextStyle(slide.overlay_style))
            : editedImageUrl

        slideResults.push({ order: slide.order, url: finalUrl, slide_type: slide.slide_type, overlay_text: noteOverlayText })
        latestImageUrl = finalUrl
        referenceImageBySlideOrder.set(slide.order, editedImageUrl)
        continue
      }

      if (slide.slide_type === 'gemini_custom') {
        const referenceSourceVariable = getGeminiCustomReferenceSourceVariableName(slide.order)
        const referenceSource = resolveGeminiCustomReferenceSource(
          getStringVariable(variables, referenceSourceVariable)
        )

        let baseImageUrl: string | null = null
        if (referenceSource === 'previous') {
          const previousSlideImageUrl = referenceImageBySlideOrder.get(slide.order - 1) || latestImageUrl
          if (!previousSlideImageUrl) {
            throw new Error(`Slide order ${slide.order} requires a previous slide image for gemini_custom reference mode`)
          }
          const referencePrompt = applyReferencePreviousEditPrompt(interpolatedPrompt)
          baseImageUrl = await generateAndUploadPhoto(
            applyPhotoGenerationStyle(referencePrompt, variables, slide.order),
            { referenceImageUrl: previousSlideImageUrl, referenceMode: 'identity' }
          )
        } else {
          baseImageUrl = await generateAndUploadPhoto(
            applyPhotoGenerationStyle(interpolatedPrompt, variables, slide.order)
          )
        }

        if (!baseImageUrl) {
          throw new Error(`Failed to generate gemini_custom image for slide order ${slide.order}`)
        }

        const overlayText = resolveOverlayText(slide, interpolationContext, interpolatedPrompt)
        const finalUrl =
          overlayText && overlayText.trim()
            ? await renderAndUploadSlide1(baseImageUrl, overlayText, overlayStyleToTextStyle(slide.overlay_style))
            : baseImageUrl

        slideResults.push({ order: slide.order, url: finalUrl, slide_type: slide.slide_type, overlay_text: noteOverlayText })
        latestImageUrl = finalUrl
        referenceImageBySlideOrder.set(slide.order, baseImageUrl)
        continue
      }

      let baseImageUrl: string | null = null
      let referenceImageUrl: string | null = null
      if (slide.photo_source === 'variable') {
        const photoVariableName = resolvePhotoVariableName(slide)
        baseImageUrl = photoVariableName ? getStringRecordValue(interpolationContext, photoVariableName) : null
      } else if (slide.photo_source === 'variable_or_generated') {
        const photoVariableName = resolvePhotoVariableName(slide)
        const variablePhoto = photoVariableName ? getStringRecordValue(interpolationContext, photoVariableName) : null
        baseImageUrl = variablePhoto || await generateAndUploadPhoto(applyPhotoGenerationStyle(interpolatedPrompt, variables, slide.order))
      } else if (slide.photo_source === 'reference_previous') {
        referenceImageUrl = referenceImageBySlideOrder.get(slide.order - 1) || latestImageUrl
        if (!referenceImageUrl) {
          throw new Error(`Slide order ${slide.order} requires photo_source=reference_previous, but no previous slide image exists`)
        }
        baseImageUrl = await generateAndUploadPhoto(
          applyPhotoGenerationStyle(interpolatedPrompt, variables, slide.order),
          { referenceImageUrl, referenceMode: 'identity' }
        )
      } else if (slide.photo_source === 'reference_anchor') {
        if (typeof slide.reference_anchor_order !== 'number') {
          throw new Error(`Slide order ${slide.order} uses photo_source=reference_anchor but is missing reference_anchor_order`)
        }
        referenceImageUrl = referenceImageBySlideOrder.get(slide.reference_anchor_order) || null
        if (!referenceImageUrl) {
          throw new Error(
            `Slide order ${slide.order} requires anchor slide ${slide.reference_anchor_order}, but that slide image is unavailable`
          )
        }
        baseImageUrl = await generateAndUploadPhoto(
          applyPhotoGenerationStyle(interpolatedPrompt, variables, slide.order),
          { referenceImageUrl, referenceMode: 'identity' }
        )
      } else if (slide.photo_source === 'reference_live_pick') {
        const liveReferenceVariable = getLiveReferenceVariableName(slide.order)
        const referencePickKey = getStringVariable(variables, liveReferenceVariable)
        if (!referencePickKey) {
          throw new Error(`Slide order ${slide.order} is missing ${liveReferenceVariable}`)
        }
        if (!isAllowedLiveReferenceKey(referencePickKey)) {
          throw new Error(`Slide order ${slide.order} has unsupported reference key extension`)
        }

        referenceImageUrl = await mintLiveReferencePresignedUrl(referencePickKey)
        const styleOnlyPrompt = applyStyleOnlyReferencePrompt(interpolatedPrompt)
        baseImageUrl = await generateAndUploadPhoto(
          applyPhotoGenerationStyle(styleOnlyPrompt, variables, slide.order),
          { referenceImageUrl, referenceMode: 'style' }
        )
        referencePickKeyBySlideOrder.set(slide.order, referencePickKey)
      } else if (slide.photo_source === 'upload_transform') {
        const uploadTransformVariable = getUploadTransformVariableName(slide.order)
        const uploadTransformKey = getStringVariable(variables, uploadTransformVariable)
        if (!uploadTransformKey) {
          throw new Error(`Slide order ${slide.order} is missing ${uploadTransformVariable}`)
        }
        if (!isAllowedUploadTransformKey(uploadTransformKey)) {
          throw new Error(`Slide order ${slide.order} has unsupported upload transform key`)
        }

        referenceImageUrl = await mintUploadTransformPresignedUrl(uploadTransformKey)
        const identityTransformPrompt = applyIdentityTransformReferencePrompt(interpolatedPrompt)
        baseImageUrl = await generateAndUploadPhoto(
          applyPhotoGenerationStyle(identityTransformPrompt, variables, slide.order),
          { referenceImageUrl, referenceMode: 'identity-transform' }
        )
        referencePickKeyBySlideOrder.set(slide.order, uploadTransformKey)
      } else {
        baseImageUrl = await generateAndUploadPhoto(applyPhotoGenerationStyle(interpolatedPrompt, variables, slide.order))
      }

      if (!baseImageUrl) {
        throw new Error(`Failed to generate image for slide order ${slide.order} (${slide.slide_type})`)
      }

      const overlayText = resolveOverlayText(slide, interpolationContext, interpolatedPrompt)
      const finalUrl =
        overlayText && overlayText.trim()
          ? await renderAndUploadSlide1(baseImageUrl, overlayText, overlayStyleToTextStyle(slide.overlay_style))
          : baseImageUrl

      slideResults.push({ order: slide.order, url: finalUrl, slide_type: slide.slide_type, overlay_text: noteOverlayText })
      latestImageUrl = finalUrl
      referenceImageBySlideOrder.set(slide.order, baseImageUrl || finalUrl)
    }

    const orderedSlides = slideResults.sort((a, b) => a.order - b.order)
    const orderedUrls = orderedSlides.map((s) => s.url)
    const livePhotoResults: LivePhotoResult[] = []
    const livePhotoWarnings: string[] = []
    let isLivePhoto = false
    const eligibleLivePhotoOrders = activeSlides
      .filter((slide) => slide.live_photo_eligible)
      .map((slide) => slide.order)
    const requestedLivePhotoOrders = live_photo_slide_orders ?? (generate_live_photos ? eligibleLivePhotoOrders : [])

    if (requestedLivePhotoOrders.length > 0) {
      const livePhotoServerUrl = process.env.LIVE_PHOTO_SERVER_URL
      const livePhotoApiKey = process.env.LIVE_PHOTO_API_KEY

      if (!livePhotoServerUrl || !livePhotoApiKey) {
        livePhotoWarnings.push('Live Photo server is not configured; generated static slides only.')
      } else {
        const slideUrlByOrder = new Map<number, string>()
        for (const slideResult of orderedSlides) {
          slideUrlByOrder.set(slideResult.order, slideResult.url)
        }

        for (const slide of activeSlides) {
          if (!slide.live_photo_eligible) {
            continue
          }
          if (!requestedLivePhotoOrders.includes(slide.order)) {
            continue
          }
          if (!slide.motion_hint) {
            continue
          }

          const staticSlideUrl = slideUrlByOrder.get(slide.order)
          if (!staticSlideUrl) {
            livePhotoWarnings.push(`Missing static image URL for slide ${slide.order}; skipped live photo generation.`)
            continue
          }
          const livePhotoSourceImageUrl = await toLivePhotoSourceImageUrl(staticSlideUrl)

          const livePhotoSettings = live_photo_settings?.[String(slide.order)]
          const outputOrientation = livePhotoSettings?.output_orientation ?? slide.live_photo_output_orientation ?? 'vertical'
          const framingMode = livePhotoSettings?.framing_mode ?? slide.live_photo_framing_mode ?? 'fill'
          const requestedMotionStyle = slide.motion_style ?? 'ai_subtle'
          const interpolationContext = {
            ...variables,
            ...buildCharacterDescriptions(slide, variables),
          }

          let interpolatedMotionHint = slide.motion_hint
          try {
            interpolatedMotionHint = interpolatePrompt(slide.motion_hint, interpolationContext)
          } catch (error) {
            livePhotoWarnings.push(
              `Failed to interpolate motion hint for slide ${slide.order}: ${error instanceof Error ? error.message : 'Unknown error'}`
            )
            continue
          }

          try {
            const callLivePhotoGenerate = async (motionStyle: MotionStyle, motionHint: string) => {
              const response = await fetch(`${livePhotoServerUrl.replace(/\/$/, '')}/generate`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${livePhotoApiKey}`,
                },
                body: JSON.stringify({
                  image_url: livePhotoSourceImageUrl,
                  motion_style: motionStyle,
                  motion_hint: motionHint,
                  output_orientation: outputOrientation,
                  framing_mode: framingMode,
                }),
              })

              const responseText = await response.text()
              let data: any = null
              try {
                data = responseText ? JSON.parse(responseText) : null
              } catch {
                data = null
              }

              return { response, responseText, data }
            }

            let attempt = await callLivePhotoGenerate(requestedMotionStyle, interpolatedMotionHint)

            if (!attempt.response.ok && isLivePhotoContentPolicyViolation(attempt.response.status, attempt.responseText)) {
              const fallbackHint = 'Slow gentle zoom across the still image. No generated scene motion.'
              attempt = await callLivePhotoGenerate('kenburns', fallbackHint)
              if (attempt.response.ok) {
                livePhotoWarnings.push(
                  `Slide ${slide.order} hit Veo content policy; used kenburns fallback instead.`
                )
              }
            }

            if (!attempt.response.ok) {
              throw new Error(
                `Live photo server returned ${attempt.response.status}: ${attempt.responseText || 'No response body'}`
              )
            }

            const data = attempt.data
            if (!data?.pvt_url || !data?.photo_url || !data?.video_url) {
              throw new Error('Live photo response missing pvt_url, photo_url, or video_url')
            }

            livePhotoResults.push({
              order: slide.order,
              pvt_zip_url: normalizeLivePhotoDownloadUrl(data.pvt_url, livePhotoServerUrl),
              photo_url: data.photo_url,
              video_url: data.video_url,
            })
          } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error'
            console.error(`Live photo generation failed for slide ${slide.order}:`, error)
            livePhotoWarnings.push(`Slide ${slide.order} live photo generation failed: ${message}`)
          }
        }

        isLivePhoto = livePhotoResults.length > 0 && livePhotoWarnings.length === 0
      }
    }

    const livePhotos: LivePhotoResponse[] = livePhotoResults
      .sort((a, b) => a.order - b.order)
      .map((result) => ({
        slide_order: result.order,
        urls: {
          pvt_zip_url: result.pvt_zip_url,
          photo_url: result.photo_url,
          video_url: result.video_url,
        },
      }))
    const livePhotoByOrder = new Map(livePhotoResults.map((result) => [result.order, result]))
    const slideBundle: SlideBundleItem[] = orderedSlides.map((slide) => {
      const livePhoto = livePhotoByOrder.get(slide.order)

      return {
        order: slide.order,
        url: slide.url,
        image_url: slide.url,
        slide_type: slide.slide_type,
        overlay_text: slide.overlay_text,
        live_photo_pvt_url: livePhoto?.pvt_zip_url,
        reference_pick_key: referencePickKeyBySlideOrder.get(slide.order),
      }
    })

    const postInsert = {
      status: 'draft',
      platform: 'both',
      post_type: 'template',
      pipeline: typedTemplate.category,
      template_id: typedTemplate.id,
      slides_urls: orderedUrls,
      audio_track_name: typedTemplate.audio_track_name,
      audio_track_url: typedTemplate.audio_track_url,
      slide_count: orderedUrls.length,
      slide_1_url: orderedUrls[0] || null,
      slide_2_url: orderedUrls[1] || null,
      slide_3_url: orderedUrls[2] || null,
      slide_bundle: slideBundle,
      hook_text: getStringVariable(variables, 'hook') || null,
      text_style: 'snapchat',
      deceased_nickname: getStringVariable(variables, 'deceased_name') || null,
      deceased_relationship: getStringVariable(variables, 'relationship') || 'loved one',
      time_period: getStringVariable(variables, 'era') || '1990s',
      live_photo_urls: livePhotos.length > 0 ? livePhotos : null,
      is_live_photo: isLivePhoto,
    }

    const { data: post, error: postError } = await supabase
      .from('social_posts')
      .insert(postInsert)
      .select('id')
      .single()

    if (postError || !post) {
      return NextResponse.json(
        { error: 'Failed to create social post', details: postError?.message || 'Unknown error' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      post_id: post.id,
      slides: slideBundle,
      slide_bundle: slideBundle,
      is_live_photo: isLivePhoto,
      live_photo_urls: livePhotos.length > 0 ? livePhotos : undefined,
      live_photos: livePhotos.length > 0 ? livePhotos : undefined,
      live_photo_warning: livePhotoWarnings.length > 0 ? livePhotoWarnings.join(' ') : undefined,
    })
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Failed to generate post from template',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
