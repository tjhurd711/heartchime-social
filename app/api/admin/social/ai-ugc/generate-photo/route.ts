import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { v4 as uuidv4 } from 'uuid'
import {
  getEraPhotoUrl,
  getRandomYearInEra,
  mapPersonaNameToKey,
  mapLovedOneToKey,
  hasEraPhotos,
} from '@/lib/aiUgcEraPhotos'

// ═══════════════════════════════════════════════════════════════════════════
// SUPABASE & S3 CLIENTS
// ═══════════════════════════════════════════════════════════════════════════

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-east-2',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
})

// ═══════════════════════════════════════════════════════════════════════════
// GEMINI 3 PRO IMAGE PREVIEW CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

const GEMINI_MODEL = 'gemini-3-pro-image-preview'

// ═══════════════════════════════════════════════════════════════════════════
// AGE CALCULATION
// ═══════════════════════════════════════════════════════════════════════════

function calculateAgeInEra(birthYear: number, era: string): number {
  const eraYear = parseInt(era.slice(0, 4)) + 5 // middle of decade
  return eraYear - birthYear
}

function wasAliveInEra(birthYear: number, deathYear: number | null, era: string): boolean {
  const eraYear = parseInt(era.slice(0, 4)) + 5
  if (eraYear < birthYear) return false
  if (deathYear && eraYear > deathYear) return false
  return true
}

// ═══════════════════════════════════════════════════════════════════════════
// CAMERA TYPES BY ERA
// ═══════════════════════════════════════════════════════════════════════════

const cameraByEra: Record<string, string[]> = {
  '1970s': ['Kodak Instamatic', 'Polaroid SX-70', 'cheap 110 film camera'],
  '1980s': ['Kodak disc camera', '35mm point-and-shoot', 'Polaroid 600'],
  '1990s': ['Kodak disposable camera', 'cheap 35mm point-and-shoot', 'Polaroid OneStep'],
  '2000s': ['early 2 megapixel digital camera', 'flip phone camera', 'cheap Kodak digital'],
  '2010s': ['iPhone 4', 'early smartphone', 'cheap Android phone'],
  '2020s': ['iPhone 11', 'Samsung Galaxy', 'smartphone'],
}

const lightingFlaws: Record<string, string[]> = {
  '1970s': ['slightly overexposed from window light', 'harsh shadows from overhead lighting', 'yellowed from tungsten bulbs'],
  '1980s': ['red-eye from flash', 'flash washed out the faces', 'backlit with faces in shadow'],
  '1990s': ['disposable camera flash made everything flat', 'faces washed out from flash', 'harsh flash shadows on wall behind'],
  '2000s': ['blurry from camera shake', 'flash reflected in window behind', 'weird white balance from fluorescent lights'],
  '2010s': ['slightly grainy from low light', 'HDR looks off', 'backlit from window'],
  '2020s': ['portrait mode blur looks artificial', 'night mode grain', 'slightly overexposed'],
}

const clothingByEra: Record<string, { male: string[]; female: string[] }> = {
  '1970s': {
    male: ['brown corduroy pants and cream turtleneck', 'plaid button-down shirt tucked into high-waisted slacks', 'solid color polyester shirt with wide collar'],
    female: ['floral print blouse with high-waisted jeans', 'solid earth-tone dress with wide belt', 'turtleneck sweater with corduroy skirt'],
  },
  '1980s': {
    male: ['plain pastel polo shirt tucked into pleated khakis', 'solid color sweater over collared shirt', 'plain white t-shirt with blue jeans'],
    female: ['solid color oversized sweater with leggings', 'plain blouse with shoulder pads', 'simple floral dress with cardigan'],
  },
  '1990s': {
    male: ['plain white t-shirt tucked into light wash jeans', 'solid color flannel over plain tee', 'plain polo shirt with khaki shorts'],
    female: ['plain solid color t-shirt with high-waisted jeans', 'simple floral dress', 'solid color cardigan over plain tank top'],
  },
  '2000s': {
    male: ['plain polo shirt untucked over bootcut jeans', 'solid color graphic-free hoodie', 'plain button-down shirt with khakis'],
    female: ['plain camisole under cardigan with low-rise jeans', 'solid color v-neck tee', 'simple blouse with bootcut pants'],
  },
  '2010s': {
    male: ['plain gray t-shirt with dark jeans', 'solid flannel shirt', 'plain crew neck sweater'],
    female: ['plain white t-shirt with skinny jeans', 'solid color blouse', 'simple cardigan over tank top'],
  },
  '2020s': {
    male: ['plain oversized t-shirt with joggers', 'simple crewneck sweatshirt', 'plain button-down'],
    female: ['solid color oversized sweater', 'plain tank top with high-waisted pants', 'simple sundress'],
  },
}

const backgroundClutter: string[] = [
  'other people blurry in background',
  'parking lot edge visible',
  'random chairs and tables nearby',
  'shopping bags on ground',
  'someone elses stuff in frame',
  'cars visible in distance',
  'fence or railing in background',
  'trees and bushes behind',
  'doorway visible to the side',
  'other family members partially in frame',
]

// Photo quality artifacts by era (camera/film characteristics, NOT physical print damage)
const photoArtifacts: Record<string, string[]> = {
  '1970s': [
    'soft focus, slightly blurry',
    'visible film grain',
    'light leak from cheap camera',
    'colors slightly washed out',
    'slight vignetting in corners',
  ],
  '1980s': [
    'soft focus',
    'film grain visible',
    'flash glare on shiny surfaces',
    'slightly overexposed highlights',
  ],
  '1990s': [
    'soft focus from cheap lens',
    'film grain texture',
    'slight color cast',
    'flash hotspot on faces',
  ],
  '2000s': [
    'early digital compression artifacts',
    'slightly pixelated from low megapixel camera',
    'timestamp visible in bottom corner',
    'jpeg artifacts in shadows',
    'slight color banding',
  ],
  '2010s': [
    'slight motion blur from shaky hands',
    'Instagram-era color grading',
    'subtle HDR processing',
    'slight lens flare',
  ],
  '2020s': [
    'slight motion blur',
    'night mode noise in shadows',
    'portrait mode blur on edges',
  ],
}

// ═══════════════════════════════════════════════════════════════════════════
// AMATEUR PHOTO ELEMENTS - Random imperfections for authenticity
// ═══════════════════════════════════════════════════════════════════════════

// Universal amateur elements (apply to any era)
const universalAmateurElements: string[] = [
  'heavy film grain',
  'faded colors',
  'blurry grass or object in foreground',
  'overexposed background',
  'slight motion blur on one person',
  'someones finger partially blocking corner of frame',
  'shadow of photographer visible on ground',
]

// Era-specific amateur elements (1990s-2000s only)
const eraSpecificAmateurElements: Record<string, string[]> = {
  '1990s': [
    'date stamp in bottom right corner in orange digital text',
    'red-eye from flash',
  ],
  '2000s': [
    'date stamp in bottom right corner in orange digital text',
    'red-eye from flash',
  ],
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPER: Pick random items from array
// ═══════════════════════════════════════════════════════════════════════════

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

function pickMultipleRandom<T>(arr: T[], count: number): T[] {
  const shuffled = [...arr].sort(() => Math.random() - 0.5)
  return shuffled.slice(0, Math.min(count, arr.length))
}

function getSpecificYear(era: string): number {
  const decade = parseInt(era.slice(0, 4))
  return decade + Math.floor(Math.random() * 10)
}

function getPhotoArtifacts(era: string): string {
  const artifacts = photoArtifacts[era] || photoArtifacts['2020s']
  const selected = pickMultipleRandom(artifacts, 2 + Math.floor(Math.random() * 2)) // 2-3 artifacts
  return selected.join('. ')
}

/**
 * Get random amateur photo elements for together_photo prompts
 * Picks 2-3 elements, mixing universal and era-specific options
 */
function getAmateurPhotoElements(era: string): string {
  const allElements = [...universalAmateurElements]
  
  // Add era-specific elements if available
  const eraElements = eraSpecificAmateurElements[era]
  if (eraElements) {
    allElements.push(...eraElements)
  }
  
  // Pick 2-3 random elements
  const count = 2 + Math.floor(Math.random() * 2)
  const selected = pickMultipleRandom(allElements, count)
  
  return selected.join('. ')
}

// ═══════════════════════════════════════════════════════════════════════════
// PROMPT BUILDER - SCENE-BASED APPROACH
// ═══════════════════════════════════════════════════════════════════════════

interface PromptParams {
  photoType: 'persona_solo' | 'loved_one_solo' | 'together' | 'generic'
  persona?: {
    name: string
    age: number
    birthYear: number
    gender: string
    ethnicity?: string
  }
  lovedOne?: {
    name: string
    relationship: string
    gender: string
    birthYear: number
    deathYear: number
    ageAtDeath: number
  }
  era?: string
  context?: string
}

function buildAiUgcPrompt(params: PromptParams): string {
  const { photoType, persona, lovedOne, era, context } = params
  
  const effectiveEra = era || '2020s'
  const specificYear = getSpecificYear(effectiveEra)
  const camera = pickRandom(cameraByEra[effectiveEra] || cameraByEra['2020s'])
  const lighting = pickRandom(lightingFlaws[effectiveEra] || lightingFlaws['2020s'])
  const clutter = pickRandom(backgroundClutter)
  const artifacts = getPhotoArtifacts(effectiveEra)
  const activity = context || 'standing there'
  
  // ═══════════════════════════════════════════════════════════════════════════
  // GENERIC PHOTO (no people)
  // ═══════════════════════════════════════════════════════════════════════════
  if (photoType === 'generic') {
    return `Snapshot from ${specificYear}. ${activity}. Taken with a ${camera}. ${lighting}. ${clutter}. ${artifacts}. Subject not centered. No people visible. Not a good photo. Not a stock photo. Real amateur snapshot. Aspect ratio: 9:16 vertical.`
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // PERSONA SOLO PHOTO
  // ═══════════════════════════════════════════════════════════════════════════
  if (photoType === 'persona_solo' && persona) {
    const ageInPhoto = era ? calculateAgeInEra(persona.birthYear, effectiveEra) : persona.age
    const isMale = persona.gender?.toLowerCase() === 'male'
    const genderWord = isMale ? 'man' : 'woman'
    const clothing = pickRandom(isMale ? clothingByEra[effectiveEra].male : clothingByEra[effectiveEra].female)
    const ethnicity = persona.ethnicity ? `${persona.ethnicity} ` : ''
    
    const photographers = ['friend', 'family member', 'spouse', 'coworker']
    const photographer = pickRandom(photographers)
    const distance = 15 + Math.floor(Math.random() * 10)
    
    return `Snapshot from ${specificYear}. ${ethnicity}${genderWord}, ${ageInPhoto} years old, caught mid-motion ${activity}. ${photographer} took this from ${distance} feet away with a ${camera}. ${lighting}. Wearing ${clothing}, no logos or text on clothes. ${clutter}. ${artifacts}. Not looking at camera. Subject not centered. Not a good photo. Not a professional photo. Not a stock image. Real amateur snapshot. Aspect ratio: 9:16 vertical.`
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // LOVED ONE SOLO PHOTO
  // ═══════════════════════════════════════════════════════════════════════════
  if (photoType === 'loved_one_solo' && lovedOne) {
    // Check if loved one was alive in this era
    const alive = era ? wasAliveInEra(lovedOne.birthYear, lovedOne.deathYear, effectiveEra) : true
    if (!alive && era) {
      return JSON.stringify({ error: `${lovedOne.name} was not alive in the ${era}` })
    }
    
    const ageInPhoto = era ? calculateAgeInEra(lovedOne.birthYear, effectiveEra) : lovedOne.ageAtDeath
    const isMale = lovedOne.gender?.toLowerCase() === 'male'
    const genderWord = isMale ? 'man' : 'woman'
    const clothing = pickRandom(isMale ? clothingByEra[effectiveEra].male : clothingByEra[effectiveEra].female)
    
    const photographers = ['their child', 'family member', 'spouse', 'friend']
    const photographer = pickRandom(photographers)
    const distance = 15 + Math.floor(Math.random() * 10)
    
    return `Snapshot from ${specificYear}. ${genderWord}, ${ageInPhoto} years old, caught mid-motion ${activity}. ${photographer} took this from ${distance} feet away with a ${camera}. ${lighting}. Wearing ${clothing}, no logos or text on clothes. ${clutter}. ${artifacts}. Not looking at camera. Subject not centered. Not a good photo. Not a professional photo. Not a stock image. Real amateur snapshot. Aspect ratio: 9:16 vertical.`
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // TOGETHER PHOTO - TWO PEOPLE
  // ═══════════════════════════════════════════════════════════════════════════
  if (photoType === 'together' && persona && lovedOne) {
    // Check if both were alive
    const personaAlive = era ? calculateAgeInEra(persona.birthYear, effectiveEra) > 0 : true
    const lovedOneAlive = era ? wasAliveInEra(lovedOne.birthYear, lovedOne.deathYear, effectiveEra) : true
    
    if (!personaAlive && era) {
      return JSON.stringify({ error: `${persona.name} was not born in the ${era}` })
    }
    if (!lovedOneAlive && era) {
      return JSON.stringify({ error: `${lovedOne.name} was not alive in the ${era}` })
    }
    
    const personaAge = era ? calculateAgeInEra(persona.birthYear, effectiveEra) : persona.age
    const lovedOneAge = era ? calculateAgeInEra(lovedOne.birthYear, effectiveEra) : lovedOne.ageAtDeath
    
    const personaIsMale = persona.gender?.toLowerCase() === 'male'
    const lovedOneIsMale = lovedOne.gender?.toLowerCase() === 'male'
    
    const personaGender = personaIsMale ? 'man' : 'woman'
    const lovedOneGender = lovedOneIsMale ? 'man' : 'woman'
    
    const ethnicity = persona.ethnicity ? `${persona.ethnicity} ` : ''
    const relationship = lovedOne.relationship
    
    // Who took the photo based on relationship
    let photographer = 'another family member'
    if (relationship === 'mother' || relationship === 'father') {
      photographer = pickRandom(['other parent', 'sibling', 'grandparent', 'family friend'])
    } else if (relationship === 'grandmother' || relationship === 'grandfather') {
      photographer = pickRandom(['parent', 'aunt', 'uncle', 'other grandparent'])
    } else if (relationship === 'spouse') {
      photographer = pickRandom(['friend', 'child', 'waiter', 'stranger they asked'])
    }
    
    // Get amateur photo elements for extra authenticity
    const amateurElements = getAmateurPhotoElements(effectiveEra)
    
    return `Extreme wide shot amateur snapshot from ${specificYear}. A ${personaAge}-year-old ${ethnicity}${personaGender} and ${lovedOneAge}-year-old ${lovedOneGender} (their ${relationship}) are ${activity} together. The two people appear small because the photographer is standing far away. Full bodies visible head to toe. Lots of grass and sky visible. Eye-level angle, camera at 5 feet height. ${camera} aesthetic: ${lighting}. ${artifacts}. ${amateurElements}. Mismatched, non-branded ${effectiveEra} clothing. Subjects off-center. Not a professional photo. 9:16 vertical.`
  }
  
  // Fallback
  return `Snapshot from ${specificYear}. Amateur photo taken with ${camera}. ${lighting}. ${clutter}. ${artifacts}. Not a stock photo. Real amateur snapshot. Aspect ratio: 9:16 vertical.`
}

// ═══════════════════════════════════════════════════════════════════════════
// ERA-AWARE AESTHETIC STRINGS
// ═══════════════════════════════════════════════════════════════════════════

const eraAestheticStrings: Record<string, string> = {
  '1960s': '1960s amateur snapshot, Kodak Brownie aesthetic, faded colors with yellow-green tint, soft focus, visible film grain, slightly overexposed, natural lighting only.',
  '1970s': '1970s amateur snapshot, 110 film cartridge camera, warm faded colors with yellow-orange tint, heavy film grain, soft focus, slight vignetting, Kodak Instamatic look.',
  '1980s': '1980s amateur snapshot, 110 film or early 35mm point-and-shoot, faded colors with slight magenta cast, film grain, soft flash lighting, Polaroid-adjacent aesthetic.',
  '1990s': '1990s amateur snapshot, harsh on-camera flash, blown-out faces, heavy film grain, orange date stamp in corner, red-eye effect, disposable camera look, slightly oversaturated colors.',
  '2000s': '2000s amateur snapshot, early digital camera aesthetic, slight pixelation, orange timestamp in corner, oversaturated colors, jpeg compression artifacts, 2-3 megapixel quality, slight motion blur.',
  '2010s': '2010s smartphone photo, Instagram-era filter look, slight HDR processing, portrait mode blur on edges, warm color grading, slightly overprocessed look.',
  '2020s': '2020s smartphone photo, portrait mode with artificial background blur, night mode grain in shadows, natural but slightly enhanced colors, iPhone aesthetic.',
}

/**
 * Get the aesthetic string for a specific era
 */
function getEraAestheticString(era: string): string {
  return eraAestheticStrings[era] || eraAestheticStrings['2020s']
}

// ═══════════════════════════════════════════════════════════════════════════
// FETCH IMAGE AS BASE64 WITH MIME TYPE
// ═══════════════════════════════════════════════════════════════════════════

interface Base64Image {
  base64: string
  mimeType: string
}

async function fetchImageAsBase64(url: string): Promise<Base64Image | null> {
  try {
    console.log(`[ai-ugc/generate] 📥 Fetching reference image: ${url.slice(0, 80)}...`)
    const response = await fetch(url)
    if (!response.ok) {
      console.error(`[ai-ugc/generate] ❌ Failed to fetch image: ${response.status}`)
      return null
    }
    
    const contentType = response.headers.get('content-type') || 'image/jpeg'
    const arrayBuffer = await response.arrayBuffer()
    const base64 = Buffer.from(arrayBuffer).toString('base64')
    
    // Determine mime type
    let mimeType = 'image/jpeg'
    if (contentType.includes('png')) mimeType = 'image/png'
    else if (contentType.includes('webp')) mimeType = 'image/webp'
    else if (contentType.includes('gif')) mimeType = 'image/gif'
    
    console.log(`[ai-ugc/generate] ✅ Fetched image: ${base64.length} chars, ${mimeType}`)
    return { base64, mimeType }
  } catch (error) {
    console.error('[ai-ugc/generate] ❌ Error fetching image:', error)
    return null
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// BUILD IDENTITY-FOCUSED PROMPT FOR MULTIMODAL
// ═══════════════════════════════════════════════════════════════════════════

interface MultimodalPromptParams {
  sceneDescription: string
  era: string
  numPeople: number // 1 or 2
  personaInfo?: { age: number; gender: string }
  lovedOneInfo?: { age: number; gender: string; relationship: string }
}

/**
 * Build prompt for Gemini 3 Pro with Subject Reference
 * Uses [1] for persona and [2] for loved one to reference the subject images
 */
function buildGemini3ProSubjectPrompt(params: MultimodalPromptParams): string {
  const { sceneDescription, era, numPeople, personaInfo, lovedOneInfo } = params
  const aestheticString = getEraAestheticString(era)
  
  // ═══════════════════════════════════════════════════════════════════════════
  // TOGETHER PHOTO - TWO PEOPLE
  // ═══════════════════════════════════════════════════════════════════════════
  if (numPeople === 2 && personaInfo && lovedOneInfo) {
    return `Amateur snapshot of [1] (${personaInfo.age} years old, ${personaInfo.gender}) and [2] (${lovedOneInfo.age} years old, ${lovedOneInfo.gender}, their ${lovedOneInfo.relationship}) ${sceneDescription}. Both people fully visible head to toe, standing 25-30 feet from camera. Eye-level shot from 5.5 feet height. [1] on the left, [2] on the right. Slightly tilted horizon, more foreground than sky. ${aestheticString} 9:16 vertical.`
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // SINGLE PERSON - PERSONA
  // ═══════════════════════════════════════════════════════════════════════════
  if (numPeople === 1 && personaInfo) {
    return `Amateur snapshot of [1] (${personaInfo.age} years old, ${personaInfo.gender}) ${sceneDescription}. ${aestheticString} 9:16 vertical.`
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // SINGLE PERSON - LOVED ONE
  // ═══════════════════════════════════════════════════════════════════════════
  if (numPeople === 1 && lovedOneInfo) {
    return `Amateur snapshot of [1] (${lovedOneInfo.age} years old, ${lovedOneInfo.gender}) ${sceneDescription}. ${aestheticString} 9:16 vertical.`
  }
  
  // Fallback
  return `Amateur snapshot ${sceneDescription}. ${aestheticString} 9:16 vertical.`
}

// ═══════════════════════════════════════════════════════════════════════════
// BUILD GENERIC PHOTO PROMPT (NO PEOPLE)
// ═══════════════════════════════════════════════════════════════════════════

function buildGenericPhotoPrompt(sceneDescription: string): string {
  return `${sceneDescription}. No people visible. Poor quality photo taken on an old iPhone or cheap smartphone. Slightly blurry, low resolution, amateur framing. 9:16 vertical aspect ratio.`
}

// ═══════════════════════════════════════════════════════════════════════════
// GENERATE WITH GEMINI 3 PRO (FOR GENERIC PHOTOS - NO PEOPLE)
// ═══════════════════════════════════════════════════════════════════════════

async function generateGenericPhotoWithGemini3Pro(prompt: string): Promise<string | null> {
  const apiKey = process.env.GEMINI_API_KEY
  
  console.log('═══════════════════════════════════════════════════════════════')
  console.log('[ai-ugc/generate] 🎨 STARTING GEMINI 3 PRO GENERATION (generic photo)')
  console.log('═══════════════════════════════════════════════════════════════')
  
  if (!apiKey) {
    console.error('[ai-ugc/generate] ❌ GEMINI_API_KEY is NOT SET!')
    return null
  }
  console.log('[ai-ugc/generate] ✅ GEMINI_API_KEY is set (length:', apiKey.length, ')')
  
  console.log('[ai-ugc/generate] 📝 PROMPT:')
  console.log('---START PROMPT---')
  console.log(prompt)
  console.log('---END PROMPT---')

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`
  const requestBody = {
    contents: [
      {
        role: 'user',
        parts: [
          { text: prompt }
        ]
      }
    ],
    generationConfig: {
      temperature: 0.8,
      responseModalities: ['IMAGE', 'TEXT']
    }
  }

  console.log(`[ai-ugc/generate] 🌐 API ENDPOINT: ${GEMINI_MODEL}:generateContent`)

  try {
    console.log('[ai-ugc/generate] ⏳ Sending request to Gemini 3 Pro...')
    const startTime = Date.now()
    
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    })

    const elapsed = Date.now() - startTime
    console.log(`[ai-ugc/generate] ⏱️ Response received in ${elapsed}ms`)
    console.log('[ai-ugc/generate] 📊 Response status:', response.status, response.statusText)

    const responseText = await response.text()
    console.log('[ai-ugc/generate] 📄 RAW RESPONSE (first 500 chars):')
    console.log(responseText.slice(0, 500))

    let data: any
    try {
      data = JSON.parse(responseText)
    } catch (parseError) {
      console.error('[ai-ugc/generate] ❌ Failed to parse response as JSON:', parseError)
      return null
    }

    if (data.error) {
      console.error('[ai-ugc/generate] ❌ GEMINI 3 PRO API ERROR:', JSON.stringify(data.error, null, 2))
      return null
    }

    // Extract image from Gemini 3 Pro response format
    // Response: candidates[0].content.parts[] where part has inlineData.mimeType and inlineData.data
    const parts = data.candidates?.[0]?.content?.parts
    if (parts) {
      const imagePart = parts.find((p: any) => p.inlineData?.mimeType?.startsWith('image/'))
      if (imagePart?.inlineData?.data) {
        console.log('[ai-ugc/generate] ✅ Image data received! Uploading to S3...')
        
        const base64 = imagePart.inlineData.data
        const buffer = Buffer.from(base64, 'base64')
        console.log('[ai-ugc/generate] 📊 Image buffer size:', buffer.length, 'bytes')

        const bucket = process.env.S3_BUCKET_NAME || 'heartbeat-photos-prod'
        const key = `ai-ugc-assets/${uuidv4()}.png`
        
        try {
          await s3Client.send(new PutObjectCommand({
            Bucket: bucket,
            Key: key,
            Body: buffer,
            ContentType: 'image/png',
          }))
          
          const url = `https://${bucket}.s3.amazonaws.com/${key}`
          console.log('[ai-ugc/generate] ✅ S3 UPLOAD SUCCESS!')
          console.log('[ai-ugc/generate] 🔗 Final URL:', url)
          console.log('═══════════════════════════════════════════════════════════════')
          return url
        } catch (s3Error) {
          console.error('[ai-ugc/generate] ❌ S3 UPLOAD FAILED:', s3Error)
          return null
        }
      }
    }

    console.error('[ai-ugc/generate] ❌ NO IMAGE IN RESPONSE')
    console.log('═══════════════════════════════════════════════════════════════')
    return null
  } catch (error) {
    console.error('[ai-ugc/generate] ❌ GEMINI 3 PRO REQUEST FAILED:', error)
    console.log('═══════════════════════════════════════════════════════════════')
    return null
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// GENERATE WITH GEMINI 3 PRO IMAGE PREVIEW (FOR PHOTOS WITH PEOPLE)
// Uses inline_data for reference images with identity lock
// ═══════════════════════════════════════════════════════════════════════════

async function generatePhotoWithGemini3Pro(
  scenePrompt: string,
  referenceImages: string[], // URLs to reference photos
  era: string,
  numPeople: number,
  personaInfo?: { age: number; gender: string },
  lovedOneInfo?: { age: number; gender: string; relationship: string }
): Promise<string | null> {
  const apiKey = process.env.GEMINI_API_KEY
  
  console.log('═══════════════════════════════════════════════════════════════')
  console.log('[ai-ugc/generate] 🚀 STARTING GEMINI 3 PRO IMAGE PREVIEW WITH SUBJECT REFERENCE')
  console.log('═══════════════════════════════════════════════════════════════')
  
  if (!apiKey) {
    console.error('[ai-ugc/generate] ❌ GEMINI_API_KEY is NOT SET!')
    return null
  }
  console.log('[ai-ugc/generate] ✅ GEMINI_API_KEY is set (length:', apiKey.length, ')')

  try {
    // ═══════════════════════════════════════════════════════════════════════════
    // STEP 1: Fetch reference images and convert to base64
    // ═══════════════════════════════════════════════════════════════════════════
    console.log('[ai-ugc/generate] 📸 Fetching subject reference images...')
    console.log(`[ai-ugc/generate] Reference images to fetch: ${referenceImages.length}`)
    
    const base64Images: Base64Image[] = []
    for (const url of referenceImages) {
      const imgData = await fetchImageAsBase64(url)
      if (imgData) {
        base64Images.push(imgData)
        console.log(`[ai-ugc/generate] ✅ Fetched reference image: ${url.slice(0, 60)}...`)
      } else {
        console.warn(`[ai-ugc/generate] ⚠️ Could not fetch reference image: ${url}`)
      }
    }
    
    if (base64Images.length === 0 && referenceImages.length > 0) {
      console.error('[ai-ugc/generate] ❌ Failed to fetch any reference images!')
      return null
    }
    
    console.log(`[ai-ugc/generate] ✅ Successfully fetched ${base64Images.length} reference images`)

    // ═══════════════════════════════════════════════════════════════════════════
    // STEP 2: Build the prompt with [1] and [2] references
    // ═══════════════════════════════════════════════════════════════════════════
    const basePrompt = buildGemini3ProSubjectPrompt({
      sceneDescription: scenePrompt,
      era,
      numPeople,
      personaInfo,
      lovedOneInfo,
    })
    
    // Add identity lock instruction prefix
    const prompt = `Establish a high-fidelity identity lock on the subjects in the reference images. ${basePrompt}`
    
    console.log('[ai-ugc/generate] 📝 GEMINI 3 PRO SUBJECT PROMPT:')
    console.log('---START PROMPT---')
    console.log(prompt)
    console.log('---END PROMPT---')

    // ═══════════════════════════════════════════════════════════════════════════
    // STEP 3: Build request with inline_data for reference images
    // ═══════════════════════════════════════════════════════════════════════════
    const parts: any[] = []
    
    // Add reference images as inline_data parts
    for (const imgData of base64Images) {
      parts.push({
        inline_data: {
          mime_type: imgData.mimeType,
          data: imgData.base64
        }
      })
      console.log(`[ai-ugc/generate] 🖼️ Added reference image as inline_data (${imgData.mimeType})`)
    }
    
    // Add the text prompt
    parts.push({ text: prompt })
    
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`
    const requestBody = {
      contents: [
        {
          role: 'user',
          parts
        }
      ],
      generationConfig: {
        temperature: 0.6, // Lower temperature for better face consistency
        responseModalities: ['IMAGE', 'TEXT']
      }
    }

    console.log(`[ai-ugc/generate] 🌐 GEMINI API ENDPOINT: ${GEMINI_MODEL}`)
    console.log('[ai-ugc/generate] 📦 REQUEST STRUCTURE:')
    console.log(`  - Prompt length: ${prompt.length} chars`)
    console.log(`  - Reference images: ${base64Images.length}`)
    console.log(`  - Temperature: 0.6 (identity lock mode)`)
    
    console.log('[ai-ugc/generate] ⏳ Sending request to Gemini 3 Pro...')
    const startTime = Date.now()
    
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    })
    
    const elapsed = Date.now() - startTime
    console.log(`[ai-ugc/generate] ⏱️ Response received in ${elapsed}ms`)
    console.log('[ai-ugc/generate] 📊 Response status:', response.status, response.statusText)

    // ═══════════════════════════════════════════════════════════════════════════
    // STEP 4: Parse response
    // ═══════════════════════════════════════════════════════════════════════════
    const responseText = await response.text()
    console.log('[ai-ugc/generate] 📄 RAW RESPONSE (first 500 chars):')
    console.log(responseText.slice(0, 500))

    let data: any
    try {
      data = JSON.parse(responseText)
    } catch (parseError) {
      console.error('[ai-ugc/generate] ❌ Failed to parse response as JSON:', parseError)
      return null
    }

    if (data.error) {
      console.error('[ai-ugc/generate] ❌ GEMINI 3 PRO API ERROR:', JSON.stringify(data.error, null, 2))
      return null
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // STEP 5: Extract image and upload to S3
    // Gemini 3 Pro response: candidates[0].content.parts[] with inlineData
    // ═══════════════════════════════════════════════════════════════════════════
    const responseParts = data.candidates?.[0]?.content?.parts
    if (responseParts) {
      const imagePart = responseParts.find((p: any) => p.inlineData?.mimeType?.startsWith('image/'))
      if (imagePart?.inlineData?.data) {
        console.log('[ai-ugc/generate] ✅ Image data received! Uploading to S3...')
        
        const base64 = imagePart.inlineData.data
        const buffer = Buffer.from(base64, 'base64')
        console.log('[ai-ugc/generate] 📊 Image buffer size:', buffer.length, 'bytes')

        const bucket = process.env.S3_BUCKET_NAME || 'heartbeat-photos-prod'
        const key = `ai-ugc-assets/${uuidv4()}.png`
        
        try {
          await s3Client.send(new PutObjectCommand({
            Bucket: bucket,
            Key: key,
            Body: buffer,
            ContentType: 'image/png',
          }))
          
          const url = `https://${bucket}.s3.amazonaws.com/${key}`
          console.log('[ai-ugc/generate] ✅ S3 UPLOAD SUCCESS!')
          console.log('[ai-ugc/generate] 🔗 Final URL:', url)
          console.log('═══════════════════════════════════════════════════════════════')
          return url
        } catch (s3Error) {
          console.error('[ai-ugc/generate] ❌ S3 UPLOAD FAILED:', s3Error)
          return null
        }
      }
    }
    
    console.error('[ai-ugc/generate] ❌ NO IMAGE IN RESPONSE')
    console.error('[ai-ugc/generate] Full response:', JSON.stringify(data, null, 2).slice(0, 1000))
    console.log('═══════════════════════════════════════════════════════════════')
    return null
  } catch (error) {
    console.error('[ai-ugc/generate] ❌ GEMINI 3 PRO REQUEST FAILED:', error)
    console.log('═══════════════════════════════════════════════════════════════')
    return null
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// POST /api/admin/social/ai-ugc/generate-photo
// Generate a photo for an AI UGC persona
// ═══════════════════════════════════════════════════════════════════════════

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      personaId,
      photoType,
      era,
      context,
    } = body as {
      personaId: string
      photoType: 'persona_solo' | 'loved_one_solo' | 'together' | 'generic'
      era?: string
      context?: string
    }

    // Validate required fields
    if (!personaId || !photoType) {
      return NextResponse.json(
        { error: 'Missing required fields: personaId, photoType' },
        { status: 400 }
      )
    }

    // Fetch persona
    const { data: persona, error: personaError } = await supabase
      .from('ai_ugc_personas')
      .select('*')
      .eq('id', personaId)
      .single()

    if (personaError || !persona) {
      console.error('[ai-ugc/generate] Persona not found:', personaError)
      return NextResponse.json({ error: 'Persona not found' }, { status: 404 })
    }

    // Fetch loved one if needed
    let lovedOne = null
    if (photoType === 'loved_one_solo' || photoType === 'together') {
      const { data: lovedOnes } = await supabase
        .from('ai_ugc_loved_ones')
        .select('*')
        .eq('persona_id', personaId)
        .limit(1)

      lovedOne = lovedOnes?.[0]
      
      if (!lovedOne && (photoType === 'loved_one_solo' || photoType === 'together')) {
        return NextResponse.json(
          { error: 'No loved one found for this persona. Required for this photo type.' },
          { status: 400 }
        )
      }
    }

    // Build the prompt
    const prompt = buildAiUgcPrompt({
      photoType,
      persona: {
        name: persona.name,
        age: persona.age,
        birthYear: persona.birth_year,
        gender: persona.gender || 'female',
        ethnicity: persona.ethnicity || undefined,
      },
      lovedOne: lovedOne ? {
        name: lovedOne.name,
        relationship: lovedOne.relationship,
        gender: lovedOne.gender || 'female',
        birthYear: lovedOne.birth_year,
        deathYear: lovedOne.death_year,
        ageAtDeath: lovedOne.age_at_death,
      } : undefined,
      era: era || undefined,
      context: context || undefined,
    })

    // Check for error in prompt (e.g., person not alive in era)
    if (prompt.startsWith('{') && prompt.includes('error')) {
      try {
        const errorObj = JSON.parse(prompt)
        return NextResponse.json({ error: errorObj.error }, { status: 400 })
      } catch {
        // Not JSON, continue
      }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // Collect reference images with age-appropriate era photos
    // ═══════════════════════════════════════════════════════════════════════════
    const referenceImages: string[] = []
    
    if (photoType === 'persona_solo' || photoType === 'together') {
      // Try to get era-specific photo for persona
      let personaPhoto = persona.master_photo_url
      if (era) {
        const personaKey = mapPersonaNameToKey(persona.name)
        if (personaKey && hasEraPhotos(personaKey)) {
          const targetYear = getRandomYearInEra(era)
          const eraPhoto = getEraPhotoUrl(personaKey, persona.birth_year, targetYear)
          if (eraPhoto) {
            personaPhoto = eraPhoto
            console.log(`[ai-ugc/generate] 📸 Using era photo for ${persona.name} in ${era}: ${eraPhoto}`)
          }
        }
      }
      referenceImages.push(personaPhoto)
    }
    
    if ((photoType === 'loved_one_solo' || photoType === 'together') && lovedOne) {
      // Try to get era-specific photo for loved one
      let lovedOnePhoto = lovedOne.master_photo_url
      if (era) {
        const lovedOneKey = mapLovedOneToKey(persona.name, lovedOne.relationship)
        if (lovedOneKey && hasEraPhotos(lovedOneKey)) {
          const targetYear = getRandomYearInEra(era)
          const eraPhoto = getEraPhotoUrl(lovedOneKey, lovedOne.birth_year, targetYear)
          if (eraPhoto) {
            lovedOnePhoto = eraPhoto
            console.log(`[ai-ugc/generate] 📸 Using era photo for ${lovedOne.name} in ${era}: ${eraPhoto}`)
          }
        }
      }
      referenceImages.push(lovedOnePhoto)
    }

    console.log('[ai-ugc/generate] Generating photo:', { photoType, era, context, referenceImages: referenceImages.length })
    referenceImages.forEach((url, i) => console.log(`  [${i}]: ${url}`))

    // Determine number of people and their info for the multimodal prompt
    const effectiveEra = era || '2020s'
    let numPeople = 0
    let personaInfo: { age: number; gender: string } | undefined
    let lovedOneInfo: { age: number; gender: string; relationship: string } | undefined
    
    if (photoType === 'persona_solo') {
      numPeople = 1
      const ageInPhoto = era ? calculateAgeInEra(persona.birth_year, effectiveEra) : persona.age
      personaInfo = {
        age: ageInPhoto,
        gender: persona.gender || 'female',
      }
    } else if (photoType === 'loved_one_solo' && lovedOne) {
      numPeople = 1
      const ageInPhoto = era ? calculateAgeInEra(lovedOne.birth_year, effectiveEra) : lovedOne.age_at_death
      lovedOneInfo = {
        age: ageInPhoto,
        gender: lovedOne.gender || 'female',
        relationship: lovedOne.relationship,
      }
    } else if (photoType === 'together' && lovedOne) {
      numPeople = 2
      const personaAge = era ? calculateAgeInEra(persona.birth_year, effectiveEra) : persona.age
      const lovedOneAge = era ? calculateAgeInEra(lovedOne.birth_year, effectiveEra) : lovedOne.age_at_death
      personaInfo = {
        age: personaAge,
        gender: persona.gender || 'female',
      }
      lovedOneInfo = {
        age: lovedOneAge,
        gender: lovedOne.gender || 'female',
        relationship: lovedOne.relationship,
      }
    }
    
    // Build scene description from the old prompt's context
    const sceneDescription = context || 'standing casually'

    // ═══════════════════════════════════════════════════════════════════════════
    // ROUTE TO APPROPRIATE MODEL BASED ON PHOTO TYPE
    // ═══════════════════════════════════════════════════════════════════════════
    let generatedUrl: string | null = null
    
    if (photoType === 'generic') {
      // Generic photos (no people) - use Gemini 3 Pro without reference images
      console.log('[ai-ugc/generate] 🎨 Routing to Gemini 3 Pro (generic photo, no people)')
      const genericPrompt = buildGenericPhotoPrompt(sceneDescription)
      generatedUrl = await generateGenericPhotoWithGemini3Pro(genericPrompt)
    } else {
      // Photos with people - use Gemini 3 Pro with reference images
      console.log('[ai-ugc/generate] 📸 Routing to Gemini 3 Pro Image Preview (photo with people)')
      generatedUrl = await generatePhotoWithGemini3Pro(
        sceneDescription,
        referenceImages,
        effectiveEra,
        numPeople,
        personaInfo,
        lovedOneInfo
      )
    }

    if (!generatedUrl) {
      return NextResponse.json({ error: 'Failed to generate photo' }, { status: 500 })
    }

    // Save to assets table
    const { data: asset, error: assetError } = await supabase
      .from('ai_ugc_assets')
      .insert({
        persona_id: personaId,
        loved_one_id: lovedOne?.id || null,
        asset_type: photoType,
        era: era || null,
        context: context || null,
        s3_url: generatedUrl,
        prompt_used: prompt,
      })
      .select()
      .single()

    if (assetError) {
      console.error('[ai-ugc/generate] Error saving asset:', assetError)
      // Still return the URL even if save fails
    }

    return NextResponse.json({
      success: true,
      url: generatedUrl,
      asset,
      prompt, // Include prompt for debugging
    })
  } catch (error) {
    console.error('[ai-ugc/generate] Unexpected error:', error)
    return NextResponse.json(
      { error: 'Failed to generate photo', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

export async function GET() {
  return NextResponse.json({
    endpoint: 'POST /api/admin/social/ai-ugc/generate-photo',
    description: 'Generate a photo for an AI UGC persona using Gemini 3 Pro Image Preview',
    params: {
      personaId: 'string (required) - UUID of the persona',
      photoType: 'persona_solo | loved_one_solo | together | generic (required)',
      era: 'string (optional) - 1950s, 1960s, 1970s, 1980s, 1990s, 2000s, 2010s, 2020s',
      context: 'string (optional) - Scene description like "at a coffee shop"',
    }
  })
}
