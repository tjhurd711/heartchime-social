import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { v4 as uuidv4 } from 'uuid'
import { renderAndUploadSocialCard } from '@/lib/socialCardRenderer'
import { renderAndUploadSlide1 } from '@/lib/socialSlide1Renderer'
import { cropAndUploadForCard } from '@/lib/photoFilters'
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
// CLIENTS
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
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

interface SlideInput {
  slideNumber: number
  type: 'persona_photo' | 'loved_one_photo' | 'together_photo' | 'generic_photo' | 'heartchime_card' | 'photo_with_caption'
  era?: string | null
  context?: string | null
  caption?: string | null
  cardMessage?: string | null
  existingAssetUrl?: string | null // If using an existing asset instead of generating
}

interface GeneratedSlide extends SlideInput {
  generatedUrl: string
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

function calculateAgeInEra(birthYear: number, era: string): number {
  const eraYear = parseInt(era.slice(0, 4)) + 5
  return eraYear - birthYear
}

function wasAliveInEra(birthYear: number, deathYear: number | null, era: string): boolean {
  const eraYear = parseInt(era.slice(0, 4)) + 5
  if (eraYear < birthYear) return false
  if (deathYear && eraYear > deathYear) return false
  return true
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
    console.log(`[ai-ugc/generate-post] 📥 Fetching reference image: ${url.slice(0, 80)}...`)
    const response = await fetch(url)
    if (!response.ok) {
      console.error(`[ai-ugc/generate-post] ❌ Failed to fetch image: ${response.status}`)
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
    
    console.log(`[ai-ugc/generate-post] ✅ Fetched image: ${base64.length} chars, ${mimeType}`)
    return { base64, mimeType }
  } catch (error) {
    console.error('[ai-ugc/generate-post] ❌ Error fetching image:', error)
    return null
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// BUILD IDENTITY-FOCUSED PROMPT FOR MULTIMODAL
// ═══════════════════════════════════════════════════════════════════════════

interface MultimodalPromptParams {
  sceneDescription: string
  era: string
  numPeople: number // 0, 1, or 2
  personaInfo?: { age: number; gender: string }
  lovedOneInfo?: { age: number; gender: string; relationship: string }
}

/**
 * Build prompt for Imagen 4 with Subject Reference
 * Uses [1] for persona and [2] for loved one to reference the subject images
 */
function buildImagen4SubjectPrompt(params: MultimodalPromptParams): string {
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
// GENERATE WITH IMAGEN 4 (FOR GENERIC PHOTOS - NO PEOPLE)
// ═══════════════════════════════════════════════════════════════════════════

async function generatePhotoWithImagen4(prompt: string): Promise<string | null> {
  const apiKey = process.env.GEMINI_API_KEY
  
  console.log('═══════════════════════════════════════════════════════════════')
  console.log('[ai-ugc/generate-post] 🎨 STARTING IMAGEN 4 GENERATION (generic photo)')
  console.log('═══════════════════════════════════════════════════════════════')
  
  if (!apiKey) {
    console.error('[ai-ugc/generate-post] ❌ GEMINI_API_KEY is NOT SET!')
    return null
  }
  console.log('[ai-ugc/generate-post] ✅ GEMINI_API_KEY is set (length:', apiKey.length, ')')
  
  console.log('[ai-ugc/generate-post] 📝 PROMPT:')
  console.log('---START PROMPT---')
  console.log(prompt)
  console.log('---END PROMPT---')

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-generate-001:predict?key=${apiKey}`
  const requestBody = {
    instances: [{ prompt }],
    parameters: {
      sampleCount: 1,
      aspectRatio: '9:16',
    },
  }

  console.log('[ai-ugc/generate-post] 🌐 API ENDPOINT: imagen-4.0-generate-001:predict')

  try {
    console.log('[ai-ugc/generate-post] ⏳ Sending request to Imagen 4...')
    const startTime = Date.now()
    
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    })

    const elapsed = Date.now() - startTime
    console.log(`[ai-ugc/generate-post] ⏱️ Response received in ${elapsed}ms`)
    console.log('[ai-ugc/generate-post] 📊 Response status:', response.status, response.statusText)

    const responseText = await response.text()
    console.log('[ai-ugc/generate-post] 📄 RAW RESPONSE (first 500 chars):')
    console.log(responseText.slice(0, 500))

    let data: any
    try {
      data = JSON.parse(responseText)
    } catch (parseError) {
      console.error('[ai-ugc/generate-post] ❌ Failed to parse response as JSON:', parseError)
      return null
    }

    if (data.error) {
      console.error('[ai-ugc/generate-post] ❌ IMAGEN 4 API ERROR:', JSON.stringify(data.error, null, 2))
      return null
    }

    if (data.predictions && data.predictions[0]?.bytesBase64Encoded) {
      console.log('[ai-ugc/generate-post] ✅ Image data received! Uploading to S3...')
      
      const base64 = data.predictions[0].bytesBase64Encoded
      const buffer = Buffer.from(base64, 'base64')
      console.log('[ai-ugc/generate-post] 📊 Image buffer size:', buffer.length, 'bytes')

      const bucket = process.env.S3_BUCKET_NAME || 'heartbeat-photos-prod'
      const key = `ai-ugc-posts/${uuidv4()}.png`
      
      try {
        await s3Client.send(new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: buffer,
          ContentType: 'image/png',
        }))
        
        const url = `https://${bucket}.s3.amazonaws.com/${key}`
        console.log('[ai-ugc/generate-post] ✅ S3 UPLOAD SUCCESS!')
        console.log('[ai-ugc/generate-post] 🔗 Final URL:', url)
        console.log('═══════════════════════════════════════════════════════════════')
        return url
      } catch (s3Error) {
        console.error('[ai-ugc/generate-post] ❌ S3 UPLOAD FAILED:', s3Error)
        return null
      }
    }

    console.error('[ai-ugc/generate-post] ❌ NO IMAGE IN RESPONSE')
    console.log('═══════════════════════════════════════════════════════════════')
    return null
  } catch (error) {
    console.error('[ai-ugc/generate-post] ❌ IMAGEN 4 REQUEST FAILED:', error)
    console.log('═══════════════════════════════════════════════════════════════')
    return null
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// GENERATE WITH IMAGEN 4 + SUBJECT REFERENCE (FOR PHOTOS WITH PEOPLE)
// ═══════════════════════════════════════════════════════════════════════════

async function generatePhotoWithImagen4SubjectRef(
  scenePrompt: string,
  referenceImages: string[], // URLs to reference photos
  era: string,
  numPeople: number,
  personaInfo?: { age: number; gender: string },
  lovedOneInfo?: { age: number; gender: string; relationship: string }
): Promise<string | null> {
  const apiKey = process.env.GEMINI_API_KEY
  
  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 1: Check API Key
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('═══════════════════════════════════════════════════════════════')
  console.log('[ai-ugc/generate-post] 🚀 STARTING IMAGEN 4 WITH SUBJECT REFERENCE')
  console.log('═══════════════════════════════════════════════════════════════')
  
  if (!apiKey) {
    console.error('[ai-ugc/generate-post] ❌ GEMINI_API_KEY is NOT SET!')
    return null
  }
  console.log('[ai-ugc/generate-post] ✅ GEMINI_API_KEY is set (length:', apiKey.length, ')')

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 2: Fetch reference images and convert to base64
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('[ai-ugc/generate-post] 📸 Fetching subject reference images...')
  console.log(`[ai-ugc/generate-post] Reference images to fetch: ${referenceImages.length}`)
  
  const base64Images: string[] = []
  for (const url of referenceImages) {
    const imgData = await fetchImageAsBase64(url)
    if (imgData) {
      base64Images.push(imgData.base64)
      console.log(`[ai-ugc/generate-post] ✅ Fetched reference image: ${url.slice(0, 60)}...`)
    } else {
      console.warn(`[ai-ugc/generate-post] ⚠️ Could not fetch reference image: ${url}`)
    }
  }
  
  if (base64Images.length === 0 && referenceImages.length > 0) {
    console.error('[ai-ugc/generate-post] ❌ Failed to fetch any reference images!')
    return null
  }
  
  console.log(`[ai-ugc/generate-post] ✅ Successfully fetched ${base64Images.length} reference images`)

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 3: Build the prompt with [1] and [2] references
  // ═══════════════════════════════════════════════════════════════════════════
  const prompt = buildImagen4SubjectPrompt({
    sceneDescription: scenePrompt,
    era,
    numPeople,
    personaInfo,
    lovedOneInfo,
  })
  
  console.log('[ai-ugc/generate-post] 📝 IMAGEN 4 SUBJECT PROMPT:')
  console.log('---START PROMPT---')
  console.log(prompt)
  console.log('---END PROMPT---')

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 4: Build request with referenceImages parameter
  // ═══════════════════════════════════════════════════════════════════════════
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-generate-001:predict?key=${apiKey}`
  
  // Build referenceImages array for subject references
  const subjectReferences: any[] = []
  
  if (base64Images.length >= 1) {
    subjectReferences.push({
      referenceId: 1,
      referenceType: 'REFERENCE_TYPE_SUBJECT',
      image: { bytesBase64Encoded: base64Images[0] }
    })
    console.log('[ai-ugc/generate-post] 🖼️ Added subject reference [1] (persona)')
  }
  
  if (base64Images.length >= 2) {
    subjectReferences.push({
      referenceId: 2,
      referenceType: 'REFERENCE_TYPE_SUBJECT',
      image: { bytesBase64Encoded: base64Images[1] }
    })
    console.log('[ai-ugc/generate-post] 🖼️ Added subject reference [2] (loved one)')
  }
  
  const requestBody = {
    instances: [{ prompt }],
    parameters: {
      sampleCount: 1,
      aspectRatio: '9:16',
      referenceImages: subjectReferences,
    }
  }

  console.log('[ai-ugc/generate-post] 🌐 API ENDPOINT: imagen-4.0-generate-001:predict')
  console.log('[ai-ugc/generate-post] 📦 REQUEST STRUCTURE:')
  console.log(`  - Prompt length: ${prompt.length} chars`)
  console.log(`  - Subject references: ${subjectReferences.length}`)
  
  // Log detailed subject reference info (without full base64)
  console.log('[ai-ugc/generate-post] 📦 referenceImages array:')
  subjectReferences.forEach((ref, i) => {
    console.log(`  [${i}] { referenceId: ${ref.referenceId}, type: ${ref.referenceType}, imageSize: ${ref.image.bytesBase64Encoded.length} chars }`)
  })
  
  try {
    console.log('[ai-ugc/generate-post] ⏳ Sending request to Imagen 4 with Subject Reference...')
    const startTime = Date.now()
    
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    })
    
    const elapsed = Date.now() - startTime
    console.log(`[ai-ugc/generate-post] ⏱️ Response received in ${elapsed}ms`)
    console.log('[ai-ugc/generate-post] 📊 Response status:', response.status, response.statusText)

    // ═══════════════════════════════════════════════════════════════════════════
    // STEP 5: Parse response
    // ═══════════════════════════════════════════════════════════════════════════
    const responseText = await response.text()
    console.log('[ai-ugc/generate-post] 📄 RAW RESPONSE (first 500 chars):')
    console.log(responseText.slice(0, 500))

    let data: any
    try {
      data = JSON.parse(responseText)
    } catch (parseError) {
      console.error('[ai-ugc/generate-post] ❌ Failed to parse response as JSON:', parseError)
      return null
    }

    if (data.error) {
      console.error('[ai-ugc/generate-post] ❌ IMAGEN 4 API ERROR:', JSON.stringify(data.error, null, 2))
      return null
    }

    // Log if model acknowledged subject references
    console.log('[ai-ugc/generate-post] 🔍 Checking for subject reference acknowledgment...')
    if (data.predictions?.[0]?.subjectReferenceResults) {
      console.log('[ai-ugc/generate-post] ✅ Subject references acknowledged:', JSON.stringify(data.predictions[0].subjectReferenceResults, null, 2))
    } else {
      console.log('[ai-ugc/generate-post] ℹ️ No explicit subjectReferenceResults in response (this is normal for Imagen 4)')
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // STEP 6: Extract image and upload to S3
    // ═══════════════════════════════════════════════════════════════════════════
    if (data.predictions && data.predictions[0]?.bytesBase64Encoded) {
      console.log('[ai-ugc/generate-post] ✅ Image data received! Uploading to S3...')
      
      const base64 = data.predictions[0].bytesBase64Encoded
      const buffer = Buffer.from(base64, 'base64')
      console.log('[ai-ugc/generate-post] 📊 Image buffer size:', buffer.length, 'bytes')

      const bucket = process.env.S3_BUCKET_NAME || 'heartbeat-photos-prod'
      const key = `ai-ugc-posts/${uuidv4()}.png`
      
      try {
        await s3Client.send(new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: buffer,
          ContentType: 'image/png',
        }))
        
        const url = `https://${bucket}.s3.amazonaws.com/${key}`
        console.log('[ai-ugc/generate-post] ✅ S3 UPLOAD SUCCESS!')
        console.log('[ai-ugc/generate-post] 🔗 Final URL:', url)
        console.log('═══════════════════════════════════════════════════════════════')
        return url
      } catch (s3Error) {
        console.error('[ai-ugc/generate-post] ❌ S3 UPLOAD FAILED:', s3Error)
        return null
      }
    }
    
    console.error('[ai-ugc/generate-post] ❌ NO IMAGE IN RESPONSE')
    console.error('[ai-ugc/generate-post] Full response:', JSON.stringify(data, null, 2).slice(0, 1000))
    console.log('═══════════════════════════════════════════════════════════════')
    return null
  } catch (error) {
    console.error('[ai-ugc/generate-post] ❌ IMAGEN 4 REQUEST FAILED:', error)
    console.log('═══════════════════════════════════════════════════════════════')
    return null
  }
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

// ═══════════════════════════════════════════════════════════════════════════
// BUILD PHOTO PROMPT - SCENE-BASED APPROACH
// ═══════════════════════════════════════════════════════════════════════════

function buildPhotoPrompt(
  type: SlideInput['type'],
  persona: { name: string; age: number; birthYear: number; gender: string; ethnicity?: string },
  lovedOne: { name: string; relationship: string; gender: string; birthYear: number; deathYear: number; ageAtDeath: number } | null,
  era: string | null,
  context: string | null
): string {
  const effectiveEra = era || '2020s'
  const specificYear = getSpecificYear(effectiveEra)
  const camera = pickRandom(cameraByEra[effectiveEra] || cameraByEra['2020s'])
  const lighting = pickRandom(lightingFlaws[effectiveEra] || lightingFlaws['2020s'])
  const clutter = pickRandom(backgroundClutter)
  const artifacts = getPhotoArtifacts(effectiveEra)
  const activity = context || 'standing together'
  
  // ═══════════════════════════════════════════════════════════════════════════
  // GENERIC PHOTO (no people)
  // ═══════════════════════════════════════════════════════════════════════════
  if (type === 'generic_photo') {
    return `Snapshot from ${specificYear}. ${activity}. Taken with a ${camera}. ${lighting}. ${clutter}. ${artifacts}. Subject not centered. No people visible. Not a good photo. Not a stock photo. Real amateur snapshot. Aspect ratio: 9:16 vertical.`
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PERSONA SOLO PHOTO
  // ═══════════════════════════════════════════════════════════════════════════
  if (type === 'persona_photo' || type === 'photo_with_caption') {
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
  if (type === 'loved_one_photo' && lovedOne) {
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
  if (type === 'together_photo' && lovedOne) {
    const personaAge = era ? calculateAgeInEra(persona.birthYear, effectiveEra) : persona.age
    const lovedOneAge = era ? calculateAgeInEra(lovedOne.birthYear, effectiveEra) : lovedOne.ageAtDeath
    
    const personaIsMale = persona.gender?.toLowerCase() === 'male'
    const lovedOneIsMale = lovedOne.gender?.toLowerCase() === 'male'
    
    const personaGender = personaIsMale ? 'man' : 'woman'
    const lovedOneGender = lovedOneIsMale ? 'man' : 'woman'
    
    const ethnicity = persona.ethnicity ? `${persona.ethnicity} ` : ''
    const relationship = lovedOne.relationship
    
    // Get amateur photo elements for extra authenticity
    const amateurElements = getAmateurPhotoElements(effectiveEra)
    
    return `Extreme wide shot amateur snapshot from ${specificYear}. A ${personaAge}-year-old ${ethnicity}${personaGender} and ${lovedOneAge}-year-old ${lovedOneGender} (their ${relationship}) are ${activity} together. The two people appear small because the photographer is standing far away. Full bodies visible head to toe. Lots of grass and sky visible. Eye-level angle, camera at 5 feet height. ${camera} aesthetic: ${lighting}. ${artifacts}. ${amateurElements}. Mismatched, non-branded ${effectiveEra} clothing. Subjects off-center. Not a professional photo. 9:16 vertical.`
  }

  // Fallback for any other type
  return `Snapshot from ${specificYear}. Amateur photo taken with ${camera}. ${lighting}. ${clutter}. ${artifacts}. Not a stock photo. Real amateur snapshot. Aspect ratio: 9:16 vertical.`
}

// ═══════════════════════════════════════════════════════════════════════════
// GET AGE-APPROPRIATE REFERENCE PHOTOS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get the correct reference photo URL for a persona based on era
 * Falls back to master_photo_url if no era photos are defined
 */
function getPersonaReferencePhoto(
  persona: any,
  era: string | null
): string {
  // If no era specified, use current/master photo
  if (!era) {
    return persona.master_photo_url
  }

  // Try to get era-specific photo
  const personaKey = mapPersonaNameToKey(persona.name)
  if (personaKey && hasEraPhotos(personaKey)) {
    const targetYear = getRandomYearInEra(era)
    const eraPhotoUrl = getEraPhotoUrl(personaKey, persona.birth_year, targetYear)
    if (eraPhotoUrl) {
      console.log(`[ai-ugc/generate-post] 📸 Using era photo for ${persona.name} in ${era}: ${eraPhotoUrl}`)
      return eraPhotoUrl
    }
  }

  // Fallback to master photo
  console.log(`[ai-ugc/generate-post] 📸 No era photo for ${persona.name}, using master photo`)
  return persona.master_photo_url
}

/**
 * Get the correct reference photo URL for a loved one based on era
 * Falls back to master_photo_url if no era photos are defined
 */
function getLovedOneReferencePhoto(
  persona: any,
  lovedOne: any,
  era: string | null
): string {
  // If no era specified, use current/master photo
  if (!era) {
    return lovedOne.master_photo_url
  }

  // Try to get era-specific photo
  const lovedOneKey = mapLovedOneToKey(persona.name, lovedOne.relationship)
  if (lovedOneKey && hasEraPhotos(lovedOneKey)) {
    const targetYear = getRandomYearInEra(era)
    const eraPhotoUrl = getEraPhotoUrl(lovedOneKey, lovedOne.birth_year, targetYear)
    if (eraPhotoUrl) {
      console.log(`[ai-ugc/generate-post] 📸 Using era photo for ${lovedOne.name} in ${era}: ${eraPhotoUrl}`)
      return eraPhotoUrl
    }
  }

  // Fallback to master photo
  console.log(`[ai-ugc/generate-post] 📸 No era photo for ${lovedOne.name}, using master photo`)
  return lovedOne.master_photo_url
}

// ═══════════════════════════════════════════════════════════════════════════
// GENERATE SINGLE SLIDE
// ═══════════════════════════════════════════════════════════════════════════

async function generateSlide(
  slide: SlideInput,
  persona: any,
  lovedOne: any | null,
  generatedPhotoUrls: string[] = [] // Previously generated photo URLs
): Promise<GeneratedSlide | null> {
  console.log(`[ai-ugc/generate-post] ═══════════════════════════════════════════`)
  console.log(`[ai-ugc/generate-post] Generating slide ${slide.slideNumber}: ${slide.type}`)
  console.log(`[ai-ugc/generate-post] Full slide input:`, JSON.stringify(slide, null, 2))
  console.log(`[ai-ugc/generate-post] Previously generated photos: ${generatedPhotoUrls.length}`)

  // If using existing asset, just return it
  if (slide.existingAssetUrl) {
    // If there's a caption, render it as a slide with caption overlay
    if (slide.caption) {
      const url = await renderAndUploadSlide1(slide.existingAssetUrl, slide.caption, 'snapchat')
      return { ...slide, generatedUrl: url }
    }
    return { ...slide, generatedUrl: slide.existingAssetUrl }
  }

  // HEARTCHIME CARD - use existing renderer
  if (slide.type === 'heartchime_card') {
    console.log('[ai-ugc/generate-post] 🎴 HEARTCHIME CARD GENERATION:')
    console.log('  - generatedPhotoUrls array received:', JSON.stringify(generatedPhotoUrls.map((url, i) => ({ index: i, url: url.slice(0, 60) + '...' }))))
    
    // Find the most recent generated photo from previous slides
    const previousPhotoUrl = generatedPhotoUrls.length > 0 
      ? generatedPhotoUrls[generatedPhotoUrls.length - 1] 
      : null
    
    console.log('  - Previous photo URL selected:', previousPhotoUrl ? previousPhotoUrl.slice(0, 80) + '...' : 'NONE')
    console.log('  - slide.existingAssetUrl:', slide.existingAssetUrl || 'NONE')
    console.log('  - persona.master_photo_url:', persona.master_photo_url?.slice(0, 60) || 'NONE')
    
    // Use: previous generated photo > existingAssetUrl > master photo
    let photoUrl = previousPhotoUrl || slide.existingAssetUrl || persona.master_photo_url
    
    // Get card message - check slide.cardMessage first, then fallback
    // Use explicit check for null/undefined to allow empty strings if intentional
    const message = (slide.cardMessage !== null && slide.cardMessage !== undefined && slide.cardMessage !== '') 
      ? slide.cardMessage 
      : 'Missing you today ❤️'
    
    console.log('  - FINAL DECISION: Using photo:', photoUrl?.includes('ai-ugc-posts') ? 'GENERATED PHOTO' : (photoUrl?.includes('ai-ugc-personas') ? 'MASTER PHOTO' : 'OTHER'))
    console.log('  - Final photo URL:', photoUrl?.slice(0, 80) || 'NONE')
    console.log('  - Final message to render:', message)
    
    // If using a generated photo (not master photo), crop it to 4:5 for card display
    const isGeneratedPhoto = photoUrl.includes('ai-ugc-posts') || photoUrl.includes('ai-ugc-assets')
    if (isGeneratedPhoto) {
      console.log('[ai-ugc/generate-post] 📐 Cropping generated photo to 4:5 for card...')
      photoUrl = await cropAndUploadForCard(photoUrl, 0.8) // 4:5 aspect ratio
      console.log('[ai-ugc/generate-post] ✅ Cropped photo URL:', photoUrl)
    }
    
    try {
      const cardUrl = await renderAndUploadSocialCard(photoUrl, message)
      console.log('[ai-ugc/generate-post] ✅ Card rendered successfully:', cardUrl)
      return { ...slide, generatedUrl: cardUrl, cardMessage: message }
    } catch (error) {
      console.error('[ai-ugc/generate-post] ❌ Failed to render HeartChime card:', error)
      return null
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PHOTO TYPES - Handle era-based reference photo selection
  // ═══════════════════════════════════════════════════════════════════════════
  
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
    
    console.log(`[ai-ugc/generate-post] 🔍 Together photo validation for ${era}:`)
    console.log(`  - Target year: ${targetYear}`)
    console.log(`  - Persona age: ${validation.personaAge} (born yet: ${validation.personaBornYet})`)
    console.log(`  - Loved one age: ${validation.lovedOneAge} (alive: ${validation.lovedOneAlive})`)
    console.log(`  - Can be together: ${validation.canBeTogetherPhoto}`)
    console.log(`  - Suggested type: ${validation.suggestedPhotoType}`)
    
    if (!validation.canBeTogetherPhoto) {
      // Convert to single-person photo if one person wasn't available
      if (validation.suggestedPhotoType) {
        console.log(`[ai-ugc/generate-post] ⚠️ Converting together_photo to ${validation.suggestedPhotoType}`)
        effectiveSlideType = validation.suggestedPhotoType
      } else {
        console.error(`[ai-ugc/generate-post] ❌ Neither person available in ${era}`)
        return null
      }
    }
  }

  // Build reference images array with age-appropriate photos
  const referenceImages: string[] = []
  
  if (effectiveSlideType === 'persona_photo' || effectiveSlideType === 'photo_with_caption' || effectiveSlideType === 'together_photo') {
    const personaPhoto = getPersonaReferencePhoto(persona, era)
    referenceImages.push(personaPhoto)
  }
  
  if ((effectiveSlideType === 'loved_one_photo' || effectiveSlideType === 'together_photo') && lovedOne) {
    const lovedOnePhoto = getLovedOneReferencePhoto(persona, lovedOne, era)
    referenceImages.push(lovedOnePhoto)
  }

  console.log(`[ai-ugc/generate-post] 📷 Reference images for generation:`)
  referenceImages.forEach((url, i) => console.log(`  [${i}]: ${url}`))

  // Determine number of people and their info for the multimodal prompt
  const effectiveEra = slide.era || '2020s'
  let numPeople = 0
  let personaInfo: { age: number; gender: string } | undefined
  let lovedOneInfo: { age: number; gender: string; relationship: string } | undefined
  
  if (effectiveSlideType === 'generic_photo') {
    numPeople = 0
  } else if (effectiveSlideType === 'persona_photo' || effectiveSlideType === 'photo_with_caption') {
    numPeople = 1
    const ageInPhoto = slide.era ? calculateAgeInEra(persona.birth_year, effectiveEra) : persona.age
    personaInfo = {
      age: ageInPhoto,
      gender: persona.gender || 'female',
    }
  } else if (effectiveSlideType === 'loved_one_photo' && lovedOne) {
    numPeople = 1
    const ageInPhoto = slide.era ? calculateAgeInEra(lovedOne.birth_year, effectiveEra) : lovedOne.age_at_death
    lovedOneInfo = {
      age: ageInPhoto,
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
  
  // Build scene description from context
  const sceneDescription = slide.context || 'standing casually'

  // ═══════════════════════════════════════════════════════════════════════════
  // ROUTE TO APPROPRIATE MODEL BASED ON PHOTO TYPE
  // ═══════════════════════════════════════════════════════════════════════════
  let photoUrl: string | null = null
  
  if (effectiveSlideType === 'generic_photo') {
    // Generic photos (no people) - use Imagen 4
    console.log('[ai-ugc/generate-post] 🎨 Routing to Imagen 4 (generic photo, no people)')
    const genericPrompt = buildGenericPhotoPrompt(sceneDescription)
    photoUrl = await generatePhotoWithImagen4(genericPrompt)
  } else {
    // Photos with people - use Imagen 4 with Subject Reference
    console.log('[ai-ugc/generate-post] 📸 Routing to Imagen 4 with Subject Reference (photo with people)')
    photoUrl = await generatePhotoWithImagen4SubjectRef(
      sceneDescription,
      referenceImages,
      effectiveEra,
      numPeople,
      personaInfo,
      lovedOneInfo
    )
  }
  
  if (!photoUrl) {
    console.error(`[ai-ugc/generate-post] Failed to generate photo for slide ${slide.slideNumber}`)
    return null
  }

  // Return raw photo URL without caption overlay
  // Captions will be added manually when posting to social media
  console.log(`[ai-ugc/generate-post] ✅ Raw photo generated: ${photoUrl}`)
  if (slide.caption) {
    console.log(`[ai-ugc/generate-post] ℹ️ Caption saved for manual use: "${slide.caption}"`)
  }

  return { ...slide, generatedUrl: photoUrl }
}

// ═══════════════════════════════════════════════════════════════════════════
// POST /api/admin/social/ai-ugc/generate-post
// Generate all slides for a post
// ═══════════════════════════════════════════════════════════════════════════

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      personaId,
      slides,
      caption,
      platform,
      hookText,
      cardMessage,
    } = body as {
      personaId: string
      slides: SlideInput[]
      caption?: string
      platform?: 'instagram' | 'tiktok' | 'both'
      hookText?: string
      cardMessage?: string
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

    console.log(`[ai-ugc/generate-post] ═══════════════════════════════════════════`)
    console.log(`[ai-ugc/generate-post] Generating ${slides.length} slides for ${persona.name}`)
    console.log(`[ai-ugc/generate-post] SLIDES RECEIVED FROM UI:`)
    slides.forEach((s, i) => {
      console.log(`  Slide ${i + 1}:`)
      console.log(`    type=${s.type}`)
      console.log(`    era=${s.era}`)
      console.log(`    context=${s.context}`)
      console.log(`    caption=${s.caption}`)
      console.log(`    cardMessage=${JSON.stringify(s.cardMessage)} (type: ${typeof s.cardMessage})`)
    })
    console.log(`[ai-ugc/generate-post] RAW BODY RECEIVED:`, JSON.stringify(body, null, 2))
    console.log(`[ai-ugc/generate-post] ═══════════════════════════════════════════`)

    // Generate each slide, tracking generated photo URLs for HeartChime cards
    const generatedSlides: GeneratedSlide[] = []
    const generatedPhotoUrls: string[] = [] // Track generated photo URLs
    const errors: string[] = []

    for (const slide of slides) {
      console.log(`[ai-ugc/generate-post] 🔄 Processing slide ${slide.slideNumber}, type="${slide.type}"`)
      console.log(`[ai-ugc/generate-post]   Current tracked photos BEFORE this slide: ${generatedPhotoUrls.length}`)
      
      const generated = await generateSlide(slide, persona, lovedOne, generatedPhotoUrls)
      if (generated) {
        generatedSlides.push(generated)
        console.log(`[ai-ugc/generate-post] ✅ Slide ${slide.slideNumber} generated successfully`)
        console.log(`[ai-ugc/generate-post]   Generated URL: ${generated.generatedUrl?.slice(0, 80) || 'NONE'}...`)
        
        // Track photo URLs from ALL photo-type slides (not heartchime_card)
        const isPhotoSlide = ['persona_photo', 'loved_one_photo', 'together_photo', 'photo_with_caption', 'generic_photo'].includes(slide.type)
        console.log(`[ai-ugc/generate-post]   Is photo slide: ${isPhotoSlide} (type="${slide.type}")`)
        
        if (generated.generatedUrl && isPhotoSlide) {
          generatedPhotoUrls.push(generated.generatedUrl)
          console.log(`[ai-ugc/generate-post] 📸 Tracked photo URL: ${generated.generatedUrl.slice(0, 60)}...`)
          console.log(`[ai-ugc/generate-post]   Total tracked photos now: ${generatedPhotoUrls.length}`)
        } else if (!generated.generatedUrl && isPhotoSlide) {
          console.warn(`[ai-ugc/generate-post] ⚠️ Photo slide ${slide.slideNumber} has NO generatedUrl!`)
        }
      } else {
        console.error(`[ai-ugc/generate-post] ❌ Slide ${slide.slideNumber} failed to generate (returned null)`)
        errors.push(`Failed to generate slide ${slide.slideNumber}`)
      }
    }

    // Save post to database
    const { data: post, error: postError } = await supabase
      .from('ai_ugc_posts')
      .insert({
        persona_id: personaId,
        platform: platform || 'both',
        post_type: 'carousel',
        status: 'draft',
        slides: generatedSlides,
        caption,
        hook_text: hookText,
        card_message: cardMessage,
      })
      .select()
      .single()

    if (postError) {
      console.error('[ai-ugc/generate-post] Failed to save post:', postError)
    }

    return NextResponse.json({
      success: true,
      post,
      slides: generatedSlides,
      errors: errors.length > 0 ? errors : undefined,
    })
  } catch (error) {
    console.error('[ai-ugc/generate-post] Error:', error)
    return NextResponse.json(
      { error: 'Failed to generate post', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

export async function GET() {
  return NextResponse.json({
    endpoint: 'POST /api/admin/social/ai-ugc/generate-post',
    description: 'Generate all slides for a post',
    params: {
      personaId: 'string (required)',
      slides: 'array of slide definitions (required)',
      caption: 'string (optional) - overall post caption',
      platform: 'instagram | tiktok | both (optional)',
    },
  })
}

