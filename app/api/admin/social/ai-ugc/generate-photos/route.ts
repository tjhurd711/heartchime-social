import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { v4 as uuidv4 } from 'uuid'
import {
  getEraPhotoUrl,
  getEraMiddleYear,
  getRandomYearInEra,
  mapPersonaNameToKey,
  mapLovedOneToKey,
  validateTogetherPhoto,
  hasEraPhotos,
} from '@/lib/aiUgcEraPhotos'

// ═══════════════════════════════════════════════════════════════════════════
// GENERATE PHOTOS ONLY (NO HEARTCHIME CARD)
// This API generates all photo slides and returns their URLs for review
// 
// Uses:
// - Gemini 3 Pro Image Preview for all photos (generic and with people)
// - Reference images passed as inline_data with identity lock for face consistency
// 
// Prompts include era-specific details:
// - Camera types (Kodak disposable, point-and-shoot, etc.)
// - Lighting flaws (flash washed out faces, red-eye, etc.)
// - Photo artifacts (film grain, soft focus, date stamps)
// - Amateur elements (finger in corner, photographer shadow, etc.)
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
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

interface SlideInput {
  slideNumber: number
  type: 'persona_photo' | 'loved_one_photo' | 'together_photo' | 'generic_photo' | 'heartchime_card' | 'photo_with_caption'
  era?: string | null
  context?: string | null
  caption?: string | null
  cardMessage?: string | null
  existingAssetUrl?: string | null
  // Selfie-specific fields (for auto-generated Slide 1)
  selfieEmotion?: string | null
  selfieSetting?: string | null
}

interface GeneratedPhoto {
  slideNumber: number
  type: string
  generatedUrl: string
  era?: string | null
  context?: string | null
  prompt?: string | null
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

function calculateAgeInEra(birthYear: number, era: string): number {
  const eraYear = parseInt(era.slice(0, 4)) + 5
  return eraYear - birthYear
}

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

// ═══════════════════════════════════════════════════════════════════════════
// ERA-SPECIFIC CAMERA TYPES
// ═══════════════════════════════════════════════════════════════════════════

const cameraByEra: Record<string, string[]> = {
  '1960s': ['Kodak Brownie', 'Instamatic', 'cheap box camera'],
  '1970s': ['Kodak Instamatic', 'Polaroid SX-70', 'cheap 110 film camera'],
  '1980s': ['Kodak disc camera', '35mm point-and-shoot', 'Polaroid 600'],
  '1990s': ['Kodak disposable camera', 'cheap 35mm point-and-shoot', 'Polaroid OneStep'],
  '2000s': ['early 2 megapixel digital camera', 'flip phone camera', 'cheap Kodak digital'],
  '2010s': ['iPhone 4', 'early smartphone', 'cheap Android phone'],
  '2020s': ['iPhone 11', 'Samsung Galaxy', 'smartphone'],
}

// ═══════════════════════════════════════════════════════════════════════════
// ERA-SPECIFIC LIGHTING FLAWS
// ═══════════════════════════════════════════════════════════════════════════

const lightingFlaws: Record<string, string[]> = {
  '1960s': ['slightly overexposed from bright sun', 'harsh shadows from direct sunlight', 'washed out from too much light'],
  '1970s': ['slightly overexposed from window light', 'harsh shadows from overhead lighting', 'yellowed from tungsten bulbs'],
  '1980s': ['red-eye from flash', 'flash washed out the faces', 'backlit with faces in shadow'],
  '1990s': ['disposable camera flash made everything flat', 'faces washed out from flash', 'harsh flash shadows on wall behind'],
  '2000s': ['blurry from camera shake', 'flash reflected in window behind', 'weird white balance from fluorescent lights'],
  '2010s': ['slightly grainy from low light', 'HDR looks off', 'backlit from window'],
  '2020s': ['portrait mode blur looks artificial', 'night mode grain', 'slightly overexposed'],
}

// ═══════════════════════════════════════════════════════════════════════════
// ERA-SPECIFIC PHOTO ARTIFACTS
// ═══════════════════════════════════════════════════════════════════════════

const photoArtifacts: Record<string, string[]> = {
  '1960s': [
    'very soft focus, noticeably blurry',
    'heavy visible film grain',
    'light leak from cheap camera',
    'colors very washed out and faded',
    'strong vignetting in corners',
  ],
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

function getPhotoArtifacts(era: string): string {
  const artifacts = photoArtifacts[era] || photoArtifacts['2020s']
  const selected = pickMultipleRandom(artifacts, 2 + Math.floor(Math.random() * 2)) // 2-3 artifacts
  return selected.join('. ')
}

// ═══════════════════════════════════════════════════════════════════════════
// AMATEUR PHOTO ELEMENTS - Random imperfections for authenticity
// ═══════════════════════════════════════════════════════════════════════════

const universalAmateurElements: string[] = [
  'heavy film grain',
  'faded colors',
  'blurry grass or object in foreground',
  'overexposed background',
  'slight motion blur on one person',
  'someones finger partially blocking corner of frame',
  'shadow of photographer visible on ground',
]

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
// BACKGROUND CLUTTER - Random elements that appear in amateur photos
// ═══════════════════════════════════════════════════════════════════════════

const backgroundClutter: string[] = [
  'other people blurry in background',
  'parking lot edge visible',
  'random chairs and tables nearby',
  'someone elses stuff in frame',
  'cars visible in distance',
  'fence or railing in background',
  'trees and bushes behind',
  'doorway visible to the side',
  'other family members partially in frame',
]

// ═══════════════════════════════════════════════════════════════════════════
// FETCH IMAGE AS BASE64
// ═══════════════════════════════════════════════════════════════════════════

interface Base64Image {
  base64: string
  mimeType: string
}

async function fetchImageAsBase64(url: string): Promise<Base64Image | null> {
  try {
    console.log(`[generate-photos] 📥 Fetching reference image: ${url.slice(0, 80)}...`)
    const response = await fetch(url)
    if (!response.ok) {
      console.error(`[generate-photos] ❌ Failed to fetch image: ${response.status}`)
      return null
    }
    
    const contentType = response.headers.get('content-type') || 'image/jpeg'
    const arrayBuffer = await response.arrayBuffer()
    const base64 = Buffer.from(arrayBuffer).toString('base64')
    
    let mimeType = 'image/jpeg'
    if (contentType.includes('png')) mimeType = 'image/png'
    else if (contentType.includes('webp')) mimeType = 'image/webp'
    else if (contentType.includes('gif')) mimeType = 'image/gif'
    
    console.log(`[generate-photos] ✅ Fetched image: ${base64.length} chars, ${mimeType}`)
    return { base64, mimeType }
  } catch (error) {
    console.error('[generate-photos] ❌ Error fetching image:', error)
    return null
  }
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

function getEraAestheticString(era: string): string {
  return eraAestheticStrings[era] || eraAestheticStrings['2020s']
}

// ═══════════════════════════════════════════════════════════════════════════
// BUILD PROMPT FOR GEMINI 3 PRO
// ═══════════════════════════════════════════════════════════════════════════

interface MultimodalPromptParams {
  sceneDescription: string
  era: string
  numPeople: number
  personaInfo?: { age: number; gender: string; ethnicity?: string }
  lovedOneInfo?: { age: number; gender: string; relationship: string }
}

function buildGemini3ProSubjectPrompt(params: MultimodalPromptParams): string {
  const { sceneDescription, era, numPeople, personaInfo, lovedOneInfo } = params
  
  const effectiveEra = era || '2020s'
  const specificYear = getSpecificYear(effectiveEra)
  const camera = pickRandom(cameraByEra[effectiveEra] || cameraByEra['2020s'])
  const lighting = pickRandom(lightingFlaws[effectiveEra] || lightingFlaws['2020s'])
  const clutter = pickRandom(backgroundClutter)
  const artifacts = getPhotoArtifacts(effectiveEra)
  const amateurElements = getAmateurPhotoElements(effectiveEra)
  
  // ═══════════════════════════════════════════════════════════════════════════
  // TOGETHER PHOTO - TWO PEOPLE
  // ═══════════════════════════════════════════════════════════════════════════
  if (numPeople === 2 && personaInfo && lovedOneInfo) {
    const personaGender = personaInfo.gender?.toLowerCase() === 'male' ? 'man' : 'woman'
    const lovedOneGender = lovedOneInfo.gender?.toLowerCase() === 'male' ? 'man' : 'woman'
    const ethnicity = personaInfo.ethnicity ? `${personaInfo.ethnicity} ` : ''
    
    return `Extreme wide shot amateur snapshot from ${specificYear}. [1] (a ${personaInfo.age}-year-old ${ethnicity}${personaGender}) and [2] (a ${lovedOneInfo.age}-year-old ${lovedOneGender}, their ${lovedOneInfo.relationship}) are ${sceneDescription} together. The two people appear small because the photographer is standing far away. Full bodies visible head to toe. [1] on the left, [2] on the right. Lots of grass and sky visible. Eye-level angle, camera at 5 feet height. ${camera} aesthetic: ${lighting}. ${artifacts}. ${amateurElements}. ${clutter}. Mismatched, non-branded ${effectiveEra} clothing. Subjects off-center. Not a professional photo. Not a stock image. 9:16 vertical.`
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // SINGLE PERSON - PERSONA
  // ═══════════════════════════════════════════════════════════════════════════
  if (numPeople === 1 && personaInfo) {
    const personaGender = personaInfo.gender?.toLowerCase() === 'male' ? 'man' : 'woman'
    const ethnicity = personaInfo.ethnicity ? `${personaInfo.ethnicity} ` : ''
    const aestheticString = getEraAestheticString(effectiveEra)
    
    return `Amateur snapshot from ${specificYear}. [1] (a ${personaInfo.age}-year-old ${ethnicity}${personaGender}) ${sceneDescription}. Taken with a ${camera}. ${lighting}. ${artifacts}. ${amateurElements}. ${clutter}. Non-branded ${effectiveEra} clothing. Subject not centered. Not a professional photo. Not a stock image. ${aestheticString} 9:16 vertical.`
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // SINGLE PERSON - LOVED ONE
  // ═══════════════════════════════════════════════════════════════════════════
  if (numPeople === 1 && lovedOneInfo) {
    const lovedOneGender = lovedOneInfo.gender?.toLowerCase() === 'male' ? 'man' : 'woman'
    const aestheticString = getEraAestheticString(effectiveEra)
    
    return `Amateur snapshot from ${specificYear}. [1] (a ${lovedOneInfo.age}-year-old ${lovedOneGender}) ${sceneDescription}. Taken with a ${camera}. ${lighting}. ${artifacts}. ${amateurElements}. ${clutter}. Non-branded ${effectiveEra} clothing. Subject not centered. Not a professional photo. Not a stock image. ${aestheticString} 9:16 vertical.`
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // FALLBACK
  // ═══════════════════════════════════════════════════════════════════════════
  return `Amateur snapshot from ${specificYear}. ${sceneDescription}. Taken with a ${camera}. ${lighting}. ${artifacts}. ${clutter}. Not a professional photo. Not a stock image. 9:16 vertical.`
}

function buildGenericPhotoPrompt(sceneDescription: string): string {
  return `${sceneDescription}. No people visible. 9:16 vertical aspect ratio.`
}

// ═══════════════════════════════════════════════════════════════════════════
// GENERATE WITH GEMINI 3 PRO (GENERIC PHOTOS - NO PEOPLE)
// ═══════════════════════════════════════════════════════════════════════════

async function generateGenericPhotoWithGemini3Pro(prompt: string): Promise<string | null> {
  const apiKey = process.env.GEMINI_API_KEY
  
  console.log('[generate-photos] 🎨 STARTING GEMINI 3 PRO GENERATION (generic photo)')
  
  if (!apiKey) {
    console.error('[generate-photos] ❌ GEMINI_API_KEY is NOT SET!')
    return null
  }
  
  console.log('[generate-photos] 📝 GEMINI 3 PRO PROMPT:')
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

  try {
    const startTime = Date.now()
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    })

    const elapsed = Date.now() - startTime
    console.log(`[generate-photos] ⏱️ Response in ${elapsed}ms, status: ${response.status}`)

    const data = await response.json()

    if (data.error) {
      console.error('[generate-photos] ❌ GEMINI 3 PRO API ERROR:', data.error.message)
      return null
    }

    // Extract image from Gemini 3 Pro response format
    const parts = data.candidates?.[0]?.content?.parts
    if (parts) {
      const imagePart = parts.find((p: any) => p.inlineData?.mimeType?.startsWith('image/'))
      if (imagePart?.inlineData?.data) {
        const base64 = imagePart.inlineData.data
        const buffer = Buffer.from(base64, 'base64')

        const bucket = process.env.S3_BUCKET_NAME || 'heartbeat-photos-prod'
        const key = `ai-ugc-posts/${uuidv4()}.png`
        
        await s3Client.send(new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: buffer,
          ContentType: 'image/png',
        }))
        
        const url = `https://${bucket}.s3.amazonaws.com/${key}`
        console.log('[generate-photos] ✅ Photo generated:', url.slice(0, 60))
        return url
      }
    }

    console.error('[generate-photos] ❌ NO IMAGE IN RESPONSE')
    return null
  } catch (error) {
    console.error('[generate-photos] ❌ Request failed:', error)
    return null
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// GENERATE WITH GEMINI 3 PRO IMAGE PREVIEW (PHOTOS WITH PEOPLE)
// Uses inline_data for reference images with identity lock
// ═══════════════════════════════════════════════════════════════════════════

async function generatePhotoWithGemini3Pro(
  scenePrompt: string,
  referenceImages: string[],
  era: string,
  numPeople: number,
  personaInfo?: { age: number; gender: string },
  lovedOneInfo?: { age: number; gender: string; relationship: string }
): Promise<string | null> {
  const apiKey = process.env.GEMINI_API_KEY
  
  console.log('[generate-photos] 🚀 STARTING GEMINI 3 PRO IMAGE PREVIEW WITH SUBJECT REFERENCE')
  
  if (!apiKey) {
    console.error('[generate-photos] ❌ GEMINI_API_KEY is NOT SET!')
    return null
  }

  try {
    // Fetch reference images as base64
    const base64Images: Base64Image[] = []
    for (const url of referenceImages) {
      const imgData = await fetchImageAsBase64(url)
      if (imgData) {
        base64Images.push(imgData)
      }
    }
    
    if (base64Images.length === 0 && referenceImages.length > 0) {
      console.error('[generate-photos] ❌ Failed to fetch any reference images!')
      return null
    }
    
    console.log(`[generate-photos] ✅ Fetched ${base64Images.length} reference images`)

    // Build the prompt
    const basePrompt = buildGemini3ProSubjectPrompt({
      sceneDescription: scenePrompt,
      era,
      numPeople,
      personaInfo,
      lovedOneInfo,
    })
    
    // Add identity lock instruction prefix
    const prompt = `Establish a high-fidelity identity lock on the subjects in the reference images. ${basePrompt}`
    
    console.log('[generate-photos] 📝 GEMINI 3 PRO PROMPT:')
    console.log('---START PROMPT---')
    console.log(prompt)
    console.log('---END PROMPT---')

    // Build request with inline_data for reference images
    const parts: any[] = []
    
    // Add reference images as inline_data parts
    for (const imgData of base64Images) {
      parts.push({
        inline_data: {
          mime_type: imgData.mimeType,
          data: imgData.base64
        }
      })
      console.log(`[generate-photos] 🖼️ Added reference image as inline_data (${imgData.mimeType})`)
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

    console.log(`[generate-photos] 🌐 GEMINI API ENDPOINT: ${GEMINI_MODEL}`)
    console.log(`[generate-photos] 📦 Subject references: ${base64Images.length}`)
    console.log(`[generate-photos] 🌡️ Temperature: 0.6 (identity lock mode)`)
    
    const startTime = Date.now()
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    })
    
    const elapsed = Date.now() - startTime
    console.log(`[generate-photos] ⏱️ Response in ${elapsed}ms, status: ${response.status}`)

    const responseText = await response.text()
    console.log('[generate-photos] 📄 RAW RESPONSE (first 500 chars):', responseText.slice(0, 500))

    let data: any
    try {
      data = JSON.parse(responseText)
    } catch (parseError) {
      console.error('[generate-photos] ❌ Failed to parse response as JSON:', parseError)
      return null
    }

    if (data.error) {
      console.error('[generate-photos] ❌ GEMINI 3 PRO API ERROR:', JSON.stringify(data.error, null, 2))
      return null
    }

    // Extract image from response
    // Gemini 3 Pro response: candidates[0].content.parts[] with inlineData
    const responseParts = data.candidates?.[0]?.content?.parts
    if (responseParts) {
      const imagePart = responseParts.find((p: any) => p.inlineData?.mimeType?.startsWith('image/'))
      if (imagePart?.inlineData?.data) {
        console.log('[generate-photos] ✅ Image data received! Uploading to S3...')
        
        const base64 = imagePart.inlineData.data
        const buffer = Buffer.from(base64, 'base64')
        console.log('[generate-photos] 📊 Image buffer size:', buffer.length, 'bytes')

        const bucket = process.env.S3_BUCKET_NAME || 'heartbeat-photos-prod'
        const key = `ai-ugc-posts/${uuidv4()}.png`
        
        await s3Client.send(new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: buffer,
          ContentType: 'image/png',
        }))
        
        const url = `https://${bucket}.s3.amazonaws.com/${key}`
        console.log('[generate-photos] ✅ Photo generated:', url.slice(0, 60))
        return url
      }
    }
    
    console.error('[generate-photos] ❌ NO IMAGE IN RESPONSE')
    console.error('[generate-photos] Full response:', JSON.stringify(data, null, 2).slice(0, 1000))
    return null
  } catch (error) {
    console.error('[generate-photos] ❌ GEMINI 3 PRO REQUEST FAILED:', error)
    return null
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// GET AGE-APPROPRIATE REFERENCE PHOTOS
// ═══════════════════════════════════════════════════════════════════════════

function getPersonaReferencePhoto(persona: any, era: string | null): string {
  if (!era) return persona.master_photo_url

  const personaKey = mapPersonaNameToKey(persona.name)
  if (personaKey && hasEraPhotos(personaKey)) {
    const targetYear = getRandomYearInEra(era)
    const eraPhotoUrl = getEraPhotoUrl(personaKey, persona.birth_year, targetYear)
    if (eraPhotoUrl) {
      console.log(`[generate-photos] 📸 Using era photo for ${persona.name} in ${era}`)
      return eraPhotoUrl
    }
  }
  return persona.master_photo_url
}

function getLovedOneReferencePhoto(persona: any, lovedOne: any, era: string | null): string {
  if (!era) return lovedOne.master_photo_url

  const lovedOneKey = mapLovedOneToKey(persona.name, lovedOne.relationship)
  if (lovedOneKey && hasEraPhotos(lovedOneKey)) {
    const targetYear = getRandomYearInEra(era)
    const eraPhotoUrl = getEraPhotoUrl(lovedOneKey, lovedOne.birth_year, targetYear)
    if (eraPhotoUrl) {
      console.log(`[generate-photos] 📸 Using era photo for ${lovedOne.name} in ${era}`)
      return eraPhotoUrl
    }
  }
  return lovedOne.master_photo_url
}

// ═══════════════════════════════════════════════════════════════════════════
// GENERATE SINGLE PHOTO
// ═══════════════════════════════════════════════════════════════════════════

async function generatePhoto(
  slide: SlideInput,
  persona: any,
  lovedOne: any | null
): Promise<GeneratedPhoto | null> {
  console.log(`[generate-photos] ═══════════════════════════════════════════`)
  console.log(`[generate-photos] Generating slide ${slide.slideNumber}: ${slide.type}`)

  // Skip HeartChime cards - those are handled separately
  if (slide.type === 'heartchime_card') {
    console.log('[generate-photos] ⏭️ Skipping HeartChime card (handled separately)')
    return null
  }

  // If using existing asset, return it directly
  if (slide.existingAssetUrl) {
    return {
      slideNumber: slide.slideNumber,
      type: slide.type,
      generatedUrl: slide.existingAssetUrl,
      era: slide.era,
      context: slide.context,
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SPECIAL CASE: Slide 1 selfie with emotion/setting
  // ═══════════════════════════════════════════════════════════════════════════
  if (slide.slideNumber === 1 && slide.selfieEmotion && slide.selfieSetting) {
    console.log(`[generate-photos] 📸 Generating Slide 1 selfie: ${slide.selfieEmotion} expression, ${slide.selfieSetting} setting`)
    
    // Simple selfie prompt - Gemini 3 Pro handles the rest with identity lock
    const selfiePrompt = `Generate a selfie of this person with a ${slide.selfieEmotion} expression. ${slide.selfieSetting} setting. Casual phone selfie, iPhone front camera quality, 9:16 vertical.`
    
    // Get persona reference photo (current day, no era)
    const referenceImages = [persona.master_photo_url]
    
    const photoUrl = await generatePhotoWithGemini3Pro(
      selfiePrompt,
      referenceImages,
      '2020s', // Current era for selfie
      1, // Single person
      { age: persona.age, gender: persona.gender || 'female' },
      undefined // No loved one
    )
    
    if (!photoUrl) {
      console.error(`[generate-photos] ❌ Failed to generate selfie for slide 1`)
      return null
    }
    
    console.log(`[generate-photos] ✅ Selfie generated: ${photoUrl.slice(0, 60)}...`)
    
    return {
      slideNumber: 1,
      type: 'persona_photo',
      generatedUrl: photoUrl,
      era: null,
      context: `${slide.selfieEmotion} expression, ${slide.selfieSetting} setting`,
      prompt: selfiePrompt,
    }
  }

  let effectiveSlideType = slide.type
  const era = slide.era || null
  
  // For together_photo, validate both people can appear in that era
  if (slide.type === 'together_photo' && lovedOne && era) {
    const targetYear = getEraMiddleYear(era)
    const validation = validateTogetherPhoto(
      persona.birth_year,
      lovedOne.birth_year,
      lovedOne.death_year,
      targetYear
    )
    
    console.log(`[generate-photos] 🔍 Together photo validation for ${era}:`)
    console.log(`  - Can be together: ${validation.canBeTogetherPhoto}`)
    
    if (!validation.canBeTogetherPhoto) {
      if (validation.suggestedPhotoType) {
        console.log(`[generate-photos] ⚠️ Converting to ${validation.suggestedPhotoType}`)
        effectiveSlideType = validation.suggestedPhotoType as any
      } else {
        console.error(`[generate-photos] ❌ Neither person available in ${era}`)
        return null
      }
    }
  }

  // Build reference images array
  const referenceImages: string[] = []
  
  if (effectiveSlideType === 'persona_photo' || effectiveSlideType === 'photo_with_caption' || effectiveSlideType === 'together_photo') {
    const personaPhoto = getPersonaReferencePhoto(persona, era)
    referenceImages.push(personaPhoto)
  }
  
  if ((effectiveSlideType === 'loved_one_photo' || effectiveSlideType === 'together_photo') && lovedOne) {
    const lovedOnePhoto = getLovedOneReferencePhoto(persona, lovedOne, era)
    referenceImages.push(lovedOnePhoto)
  }

  // Determine scene and people info
  const effectiveEra = slide.era || '2020s'
  const sceneDescription = slide.context || 'standing'
  
  let numPeople = 0
  let personaInfo: { age: number; gender: string } | undefined
  let lovedOneInfo: { age: number; gender: string; relationship: string } | undefined

  if (effectiveSlideType === 'persona_photo' || effectiveSlideType === 'photo_with_caption') {
    numPeople = 1
    const personaAge = slide.era ? calculateAgeInEra(persona.birth_year, effectiveEra) : persona.age
    personaInfo = {
      age: personaAge,
      gender: persona.gender || 'female',
    }
  } else if (effectiveSlideType === 'loved_one_photo' && lovedOne) {
    numPeople = 1
    const lovedOneAge = slide.era ? calculateAgeInEra(lovedOne.birth_year, effectiveEra) : lovedOne.age_at_death
    lovedOneInfo = {
      age: lovedOneAge,
      gender: lovedOne.gender || 'female',
      relationship: lovedOne.relationship,
    }
  } else if (effectiveSlideType === 'together_photo' && lovedOne) {
    numPeople = 2
    const personaAge = slide.era ? calculateAgeInEra(persona.birth_year, effectiveEra) : persona.age
    const lovedOneAge = slide.era ? calculateAgeInEra(lovedOne.birth_year, effectiveEra) : lovedOne.age_at_death
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

  // Route to appropriate model
  let photoUrl: string | null = null
  let generatedPrompt: string | null = null
  
  if (effectiveSlideType === 'generic_photo') {
    // Generic photos (no people) - use Gemini 3 Pro without reference images
    console.log('[generate-photos] 🎨 Routing to Gemini 3 Pro (generic photo)')
    generatedPrompt = buildGenericPhotoPrompt(sceneDescription)
    photoUrl = await generateGenericPhotoWithGemini3Pro(generatedPrompt)
  } else {
    // Photos with people - use Gemini 3 Pro with reference images
    console.log('[generate-photos] 📸 Routing to Gemini 3 Pro Image Preview (photo with people)')
    
    // Build prompt for return
    const basePrompt = buildGemini3ProSubjectPrompt({
      sceneDescription,
      era: effectiveEra,
      numPeople,
      personaInfo,
      lovedOneInfo,
    })
    generatedPrompt = `Establish a high-fidelity identity lock on the subjects in the reference images. ${basePrompt}`
    
    photoUrl = await generatePhotoWithGemini3Pro(
      sceneDescription,
      referenceImages,
      effectiveEra,
      numPeople,
      personaInfo,
      lovedOneInfo
    )
  }
  
  if (!photoUrl) {
    console.error(`[generate-photos] ❌ Failed to generate photo for slide ${slide.slideNumber}`)
    return null
  }

  console.log(`[generate-photos] ✅ Photo generated: ${photoUrl.slice(0, 60)}...`)
  
  return {
    slideNumber: slide.slideNumber,
    type: slide.type,
    generatedUrl: photoUrl,
    era: slide.era,
    context: slide.context,
    prompt: generatedPrompt,
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// POST /api/admin/social/ai-ugc/generate-photos
// Generate all photo slides (excluding HeartChime card)
// ═══════════════════════════════════════════════════════════════════════════

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { personaId, slides, selfieEmotion, selfieSetting } = body as {
      personaId: string
      slides: SlideInput[]
      selfieEmotion?: string
      selfieSetting?: string
    }

    if (!personaId || !slides || slides.length === 0) {
      return NextResponse.json(
        { error: 'Missing required fields: personaId, slides' },
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
      return NextResponse.json({ error: 'Persona not found' }, { status: 404 })
    }

    // Fetch loved one
    const { data: lovedOnes } = await supabase
      .from('ai_ugc_loved_ones')
      .select('*')
      .eq('persona_id', personaId)
      .limit(1)

    const lovedOne = lovedOnes?.[0] || null

    console.log(`[generate-photos] ═══════════════════════════════════════════`)
    console.log(`[generate-photos] Generating photos for ${persona.name}`)
    console.log(`[generate-photos] Total slides from parse: ${slides.length}`)
    console.log(`[generate-photos] Include selfie: ${selfieEmotion && selfieSetting ? 'yes' : 'no'}`)
    if (selfieEmotion && selfieSetting) {
      console.log(`[generate-photos] Selfie emotion: ${selfieEmotion}`)
      console.log(`[generate-photos] Selfie setting: ${selfieSetting}`)
    }
    console.log(`[generate-photos] Using model: ${GEMINI_MODEL}`)
    console.log(`[generate-photos] ═══════════════════════════════════════════`)

    // Build slides array - conditionally include Slide 1 selfie
    let allSlides: SlideInput[]
    
    if (selfieEmotion && selfieSetting) {
      // Build Slide 1 selfie (auto-generated)
      const selfieSlide: SlideInput = {
        slideNumber: 1,
        type: 'persona_photo',
        era: null, // Current day
        context: null, // Not needed - we use emotion/setting directly
        selfieEmotion,
        selfieSetting,
      }
      // Prepend Slide 1 to the slides array
      allSlides = [selfieSlide, ...slides]
      console.log(`[generate-photos] Total slides with selfie: ${allSlides.length}`)
    } else {
      // No selfie - use slides as-is (user describes all slides including Slide 1)
      allSlides = slides
      console.log(`[generate-photos] Total slides (no selfie): ${allSlides.length}`)
    }

    // Filter out HeartChime cards - we only generate photo slides
    const photoSlides = allSlides.filter(s => s.type !== 'heartchime_card')
    console.log(`[generate-photos] Photo slides to generate: ${photoSlides.length}`)

    // Generate each photo
    const generatedPhotos: GeneratedPhoto[] = []
    const errors: string[] = []

    for (const slide of photoSlides) {
      const generated = await generatePhoto(slide, persona, lovedOne)
      if (generated) {
        generatedPhotos.push(generated)
      } else {
        errors.push(`Failed to generate slide ${slide.slideNumber}`)
      }
    }

    console.log(`[generate-photos] ═══════════════════════════════════════════`)
    console.log(`[generate-photos] ✅ Generated ${generatedPhotos.length} photos`)
    if (errors.length > 0) {
      console.log(`[generate-photos] ⚠️ Errors: ${errors.join(', ')}`)
    }
    console.log(`[generate-photos] ═══════════════════════════════════════════`)

    return NextResponse.json({
      success: true,
      photos: generatedPhotos,
      errors: errors.length > 0 ? errors : undefined,
    })
  } catch (error) {
    console.error('[generate-photos] ❌ Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
