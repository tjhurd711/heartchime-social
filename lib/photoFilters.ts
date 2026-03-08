// ═══════════════════════════════════════════════════════════════════════════
// PHOTO FILTERS - Image processing utilities for AI UGC content
// ═══════════════════════════════════════════════════════════════════════════

import sharp from 'sharp'

// ═══════════════════════════════════════════════════════════════════════════
// CROP FOR CARD - Crop image to fit HeartChime card photo area
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Add rounded corners to an image buffer
 * 
 * @param imageBuffer - The image buffer
 * @param cornerRadius - Radius in pixels (default 50)
 * @returns Image buffer with rounded corners
 */
export async function addRoundedCorners(
  imageBuffer: Buffer,
  cornerRadius: number = 50
): Promise<Buffer> {
  try {
    const metadata = await sharp(imageBuffer).metadata()
    const { width, height } = metadata
    
    if (!width || !height) {
      console.warn('[photoFilters] Could not get image dimensions for rounding')
      return imageBuffer
    }
    
    // Create SVG mask for rounded corners
    const mask = Buffer.from(
      `<svg width="${width}" height="${height}">
        <rect x="0" y="0" width="${width}" height="${height}" rx="${cornerRadius}" ry="${cornerRadius}" fill="white"/>
      </svg>`
    )
    
    const rounded = await sharp(imageBuffer)
      .composite([{
        input: mask,
        blend: 'dest-in'
      }])
      .png()
      .toBuffer()
    
    console.log(`[photoFilters] ✅ Added ${cornerRadius}px rounded corners`)
    return rounded
  } catch (error) {
    console.error('[photoFilters] ❌ Error adding rounded corners:', error)
    return imageBuffer
  }
}

/**
 * Crop an image to a target aspect ratio, keeping center
 * Default is 5:4 (1.25) landscape for HeartChime cards
 * 
 * @param imageBuffer - The image buffer to crop
 * @param targetAspect - Width/height ratio (default 1.25 = 5:4 landscape)
 * @returns Cropped image buffer
 */
export async function cropForCard(
  imageBuffer: Buffer,
  targetAspect: number = 1.25
): Promise<Buffer> {
  try {
    // Get image metadata
    const metadata = await sharp(imageBuffer).metadata()
    const { width, height } = metadata
    
    if (!width || !height) {
      console.warn('[photoFilters] Could not get image dimensions, returning original')
      return imageBuffer
    }
    
    const currentAspect = width / height
    
    console.log(`[photoFilters] 📐 Cropping image: ${width}x${height} (aspect ${currentAspect.toFixed(2)}) → target aspect ${targetAspect}`)
    
    let cropWidth: number
    let cropHeight: number
    let left: number
    let top: number
    
    if (currentAspect > targetAspect) {
      // Image is wider than target - crop sides, keep full height
      cropHeight = height
      cropWidth = Math.round(height * targetAspect)
      left = Math.round((width - cropWidth) / 2)
      top = 0
    } else if (currentAspect < targetAspect) {
      // Image is taller than target - crop top/bottom, keep full width
      cropWidth = width
      cropHeight = Math.round(width / targetAspect)
      left = 0
      // Keep vertical center (where people likely are)
      top = Math.round((height - cropHeight) / 2)
    } else {
      // Already correct aspect ratio
      console.log('[photoFilters] ✅ Image already at target aspect ratio')
      return imageBuffer
    }
    
    console.log(`[photoFilters] ✂️ Cropping to ${cropWidth}x${cropHeight} from position (${left}, ${top})`)
    
    const croppedBuffer = await sharp(imageBuffer)
      .extract({
        left,
        top,
        width: cropWidth,
        height: cropHeight,
      })
      .toBuffer()
    
    console.log(`[photoFilters] ✅ Crop complete: ${cropWidth}x${cropHeight}`)
    return croppedBuffer
  } catch (error) {
    console.error('[photoFilters] ❌ Error cropping image:', error)
    return imageBuffer // Return original on error
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// FETCH AND CROP - Fetch image from URL, crop, and return buffer
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Fetch an image from URL and crop it for card display
 * 
 * @param imageUrl - URL of the image to fetch and crop
 * @param targetAspect - Width/height ratio (default 1.25 = 5:4 landscape)
 * @returns Cropped image buffer, or null on error
 */
export async function fetchAndCropForCard(
  imageUrl: string,
  targetAspect: number = 1.25
): Promise<Buffer | null> {
  try {
    console.log(`[photoFilters] 📥 Fetching image: ${imageUrl.slice(0, 60)}...`)
    
    const response = await fetch(imageUrl)
    if (!response.ok) {
      console.error(`[photoFilters] ❌ Failed to fetch image: ${response.status}`)
      return null
    }
    
    const arrayBuffer = await response.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    
    console.log(`[photoFilters] ✅ Fetched ${buffer.length} bytes`)
    
    return await cropForCard(buffer, targetAspect)
  } catch (error) {
    console.error('[photoFilters] ❌ Error fetching/cropping image:', error)
    return null
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// UPLOAD CROPPED IMAGE - Crop and upload to S3
// ═══════════════════════════════════════════════════════════════════════════

import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { v4 as uuidv4 } from 'uuid'

const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-east-2',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
  },
})

const S3_BUCKET = process.env.S3_BUCKET_NAME || 'heartbeat-photos-prod'

/**
 * Fetch an image, crop it for card display, and upload to S3
 * 
 * @param imageUrl - URL of the image to fetch and crop
 * @param targetAspect - Width/height ratio (default 1.25 = 5:4 landscape)
 * @returns S3 URL of the cropped image, or original URL on error
 */
export async function cropAndUploadForCard(
  imageUrl: string,
  targetAspect: number = 1.25
): Promise<string> {
  try {
    const croppedBuffer = await fetchAndCropForCard(imageUrl, targetAspect)
    
    if (!croppedBuffer) {
      console.warn('[photoFilters] ⚠️ Crop failed, returning original URL')
      return imageUrl
    }
    
    // Upload cropped image to S3
    const key = `ai-ugc-cropped/${uuidv4()}.png`
    
    await s3Client.send(new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: key,
      Body: croppedBuffer,
      ContentType: 'image/png',
    }))
    
    const croppedUrl = `https://${S3_BUCKET}.s3.amazonaws.com/${key}`
    console.log(`[photoFilters] ✅ Cropped image uploaded: ${croppedUrl}`)
    
    return croppedUrl
  } catch (error) {
    console.error('[photoFilters] ❌ Error in cropAndUploadForCard:', error)
    return imageUrl // Return original on error
  }
}

