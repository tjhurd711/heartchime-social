// ═══════════════════════════════════════════════════════════════════════════
// SOCIAL CARD RENDERER - Puppeteer-based PNG generation for TikTok/Instagram
// ═══════════════════════════════════════════════════════════════════════════
//
// Renders HeartChime cards as 1080x1920 PNG images
// Card design matches the socialMode HeartchimePreviewCard exactly
// ═══════════════════════════════════════════════════════════════════════════

import puppeteer from 'puppeteer'

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

const CANVAS_WIDTH = 1080
const CANVAS_HEIGHT = 1920

// Card dimensions (scaled 3.2x from 300px preview)
const CARD_WIDTH = 960
const SCALE = CARD_WIDTH / 300 // 3.2x

// Colors (matching Framer design)
const GOLD_COLOR = '#FFC300'
const ORANGE_COLOR = '#FF9800'
const NAVY_BLUE = '#1A365D'
const WHITE = '#FFFFFF'

// Scaled dimensions
const CARD_PADDING = Math.round(20 * SCALE) // 64px
const CARD_BORDER_RADIUS = Math.round(24 * SCALE) // 77px
const ICON_WIDTH = Math.round(50 * SCALE) // 160px
const ICON_HEIGHT = Math.round(40 * SCALE) // 128px
const HEADER_FONT_SIZE = Math.round(25 * SCALE) // 80px
const PHOTO_BORDER_RADIUS = Math.round(16 * SCALE) // 51px
const MESSAGE_FONT_SIZE = Math.round(18 * SCALE) // 58px
const GAP = Math.round(16 * SCALE) // 51px

// HeartChime icon URL (public)
const HEARTCHIME_ICON_URL = 'https://heartbeat-photos-prod.s3.us-east-2.amazonaws.com/icons/websitechime.png'

// ═══════════════════════════════════════════════════════════════════════════
// HTML TEMPLATE
// ═══════════════════════════════════════════════════════════════════════════

function generateHTML(photoUrl: string, message: string): string {
  // Escape message for HTML
  const escapedMessage = message
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <link href="https://fonts.googleapis.com/css2?family=Raleway:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      width: ${CANVAS_WIDTH}px;
      height: ${CANVAS_HEIGHT}px;
      background: ${WHITE};
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: 'Raleway', sans-serif;
    }
    
    .card {
      width: ${CARD_WIDTH}px;
      padding: ${CARD_PADDING}px;
      border-radius: ${CARD_BORDER_RADIUS}px;
      background: linear-gradient(135deg, ${GOLD_COLOR} 0%, ${ORANGE_COLOR} 100%);
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: ${GAP}px;
      box-shadow: 0 0 ${Math.round(30 * SCALE)}px ${Math.round(5 * SCALE)}px rgba(255, 195, 0, 0.4);
    }
    
    .header {
      display: flex;
      align-items: center;
      gap: 0;
    }
    
    .icon {
      width: ${ICON_WIDTH}px;
      height: ${ICON_HEIGHT}px;
      object-fit: contain;
    }
    
    .title {
      font-family: 'Raleway', sans-serif;
      font-weight: 600;
      font-size: ${HEADER_FONT_SIZE}px;
      color: ${NAVY_BLUE};
    }
    
    .photo-container {
      width: 100%;
      height: 624px;
      position: relative;
      border-radius: ${PHOTO_BORDER_RADIUS}px;
      overflow: hidden;
    }
    
    .photo {
      width: 100%;
      height: 100%;
      object-fit: cover;
      object-position: center;
      display: block;
    }
    
    .photo-placeholder {
      width: 100%;
      height: ${Math.round(200 * SCALE)}px;
      border-radius: ${PHOTO_BORDER_RADIUS}px;
      background: rgba(26, 54, 93, 0.2);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: ${Math.round(48 * SCALE)}px;
      opacity: 0.4;
    }
    
    .message {
      font-family: 'Raleway', sans-serif;
      font-size: ${MESSAGE_FONT_SIZE}px;
      font-weight: 500;
      color: ${NAVY_BLUE};
      text-align: center;
      line-height: 1.5;
      margin: 0;
      padding: 0 ${Math.round(10 * SCALE)}px;
    }
  </style>
</head>
<body>
  <div class="card">
    <!-- Header -->
    <div class="header">
      <img class="icon" src="${HEARTCHIME_ICON_URL}" alt="Heartchime" />
      <span class="title">Heartchime</span>
    </div>
    
    <!-- Photo -->
    ${photoUrl 
      ? `<div class="photo-container"><img class="photo" src="${photoUrl}" alt="Memory" /></div>`
      : `<div class="photo-placeholder">📷</div>`
    }
    
    <!-- Message -->
    <p class="message">${escapedMessage}</p>
  </div>
</body>
</html>
`
}

// ═══════════════════════════════════════════════════════════════════════════
// FETCH IMAGE AS BASE64 DATA URL
// ═══════════════════════════════════════════════════════════════════════════

async function fetchImageAsDataUrl(url: string): Promise<string | null> {
  try {
    console.log(`[socialCardRenderer] 📥 Fetching image: ${url.slice(0, 60)}...`)
    const response = await fetch(url)
    if (!response.ok) {
      console.error(`[socialCardRenderer] ❌ Failed to fetch image: ${response.status}`)
      return null
    }
    
    const contentType = response.headers.get('content-type') || 'image/png'
    const arrayBuffer = await response.arrayBuffer()
    const base64 = Buffer.from(arrayBuffer).toString('base64')
    
    const dataUrl = `data:${contentType};base64,${base64}`
    console.log(`[socialCardRenderer] ✅ Converted to data URL (${base64.length} chars)`)
    return dataUrl
  } catch (error) {
    console.error('[socialCardRenderer] ❌ Error fetching image:', error)
    return null
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN RENDER FUNCTION
// ═══════════════════════════════════════════════════════════════════════════

export async function renderSocialCard(
  photoUrl: string,
  message: string
): Promise<Buffer> {
  let browser = null

  try {
    // Get image as data URL (CSS clip-path handles rounded corners)
    let imageDataUrl = ''
    if (photoUrl) {
      if (photoUrl.startsWith('data:')) {
        console.log('[socialCardRenderer] 📥 Using provided data URL')
        imageDataUrl = photoUrl
      } else {
        const dataUrl = await fetchImageAsDataUrl(photoUrl)
        if (dataUrl) {
          imageDataUrl = dataUrl
        } else {
          console.warn('[socialCardRenderer] ⚠️ Could not fetch photo, card will have placeholder')
        }
      }
    }

    // Launch headless browser
    browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--font-render-hinting=none',
      ],
    })

    const page = await browser.newPage()

    // Set viewport to 1080x1920
    await page.setViewport({
      width: CANVAS_WIDTH,
      height: CANVAS_HEIGHT,
      deviceScaleFactor: 1,
    })

    // Generate and load HTML with base64 data URL instead of external URL
    const html = generateHTML(imageDataUrl, message)
    await page.setContent(html, {
      waitUntil: 'networkidle0', // Wait for fonts to load
    })

    // Wait a bit more for fonts to render properly
    await page.evaluate(() => {
      return new Promise<void>((resolve) => {
        if (document.fonts && document.fonts.ready) {
          document.fonts.ready.then(() => resolve())
        } else {
          setTimeout(resolve, 500)
        }
      })
    })

    // Take screenshot
    const screenshot = await page.screenshot({
      type: 'png',
      fullPage: false,
      clip: {
        x: 0,
        y: 0,
        width: CANVAS_WIDTH,
        height: CANVAS_HEIGHT,
      },
    })

    return screenshot as Buffer
  } finally {
    if (browser) {
      await browser.close()
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPER - Render and upload to S3
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

const S3_BUCKET = process.env.AWS_S3_BUCKET || 'heartbeat-photos-prod'

export async function renderAndUploadSocialCard(
  photoUrl: string,
  message: string
): Promise<string> {
  // Render the card
  const buffer = await renderSocialCard(photoUrl, message)

  // Generate unique filename
  const filename = `social-cards/${uuidv4()}.png`

  // Upload to S3
  await s3Client.send(
    new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: filename,
      Body: buffer,
      ContentType: 'image/png',
      CacheControl: 'max-age=31536000',
    })
  )

  // Return public URL
  return `https://${S3_BUCKET}.s3.amazonaws.com/${filename}`
}

