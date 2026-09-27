// ═══════════════════════════════════════════════════════════════════════════
// SOCIAL CARD RENDERER - Puppeteer-based PNG generation for TikTok/Instagram
// ═══════════════════════════════════════════════════════════════════════════
//
// Renders HeartChime cards as 1080x1920 PNG images
// Card design matches the socialMode HeartchimePreviewCard exactly
// ═══════════════════════════════════════════════════════════════════════════

import chromium from '@sparticuz/chromium'
import puppeteer from 'puppeteer-core'

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

const CANVAS_WIDTH = 1080
const CANVAS_HEIGHT = 1920
const isLocal = !process.env.AWS_LAMBDA_FUNCTION_VERSION && !process.env.VERCEL

// Card dimensions (scaled from the 300px preview). A smaller card on the fixed
// 1080x1920 canvas leaves more white space around the card.
const CARD_WIDTH = 720
const SCALE = CARD_WIDTH / 300 // 2.4x

// Colors (matching Framer design)
const GOLD_COLOR = '#FFC300'
const ORANGE_COLOR = '#FF9800'
const NAVY_BLUE = '#1A365D'
const WHITE = '#FFFFFF'

// Scaled dimensions
const CARD_PADDING = Math.round(20 * SCALE) // 64px
const CARD_BORDER_RADIUS = Math.round(24 * SCALE) // 77px
const ICON_WIDTH = Math.round(78 * SCALE)
const ICON_HEIGHT = Math.round(60 * SCALE)
const HEADER_FONT_SIZE = Math.round(25 * SCALE) // 80px
const PHOTO_BORDER_RADIUS = Math.round(16 * SCALE) // 51px
const MESSAGE_FONT_SIZE = Math.round(18 * SCALE) // 58px
const GAP = Math.round(16 * SCALE) // 51px

// HeartChime icon URL (public)
const HEARTCHIME_ICON_URL = 'https://heartbeat-photos-prod.s3.us-east-2.amazonaws.com/icons/websitechime-v2.png'

// ═══════════════════════════════════════════════════════════════════════════
// HTML TEMPLATE
// ═══════════════════════════════════════════════════════════════════════════

export function generateHTML(photoUrl: string, message: string, dotCount = 0): string {
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
  <!-- Serverless Chromium (@sparticuz/chromium) has no color-emoji font, so emoji
       glyphs render as nothing. Twemoji converts them into inline <img> tags that
       render regardless of installed fonts. -->
  <script src="https://cdn.jsdelivr.net/npm/@twemoji/api@15.1.0/dist/twemoji.min.js" crossorigin="anonymous"></script>
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
      height: ${Math.round(195 * SCALE)}px;
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

    /* Inline emoji images injected by Twemoji, sized to match the surrounding text */
    .message img.emoji {
      height: 1em;
      width: 1em;
      margin: 0 0.05em 0 0.1em;
      vertical-align: -0.12em;
      display: inline-block;
    }

    .dots {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: ${Math.round(6 * SCALE)}px;
    }

    .dot {
      width: ${Math.round(8 * SCALE)}px;
      height: ${Math.round(8 * SCALE)}px;
      border-radius: 50%;
      background: rgba(26, 54, 93, 0.3);
    }

    .dot.active {
      width: ${Math.round(22 * SCALE)}px;
      border-radius: ${Math.round(4 * SCALE)}px;
      background: ${NAVY_BLUE};
    }
  </style>
</head>
<body>
  <div class="card">
    <!-- Header -->
    <div class="header">
      <img class="icon" src="${HEARTCHIME_ICON_URL}" alt="Heartchime" />
      <span class="title">HeartChime</span>
    </div>
    
    <!-- Photo -->
    ${photoUrl 
      ? `<div class="photo-container"><img class="photo" src="${photoUrl}" alt="Memory" /></div>`
      : `<div class="photo-placeholder">📷</div>`
    }

    <!-- Slideshow dots -->
    ${dotCount >= 2
      ? `<div class="dots">${Array.from({ length: dotCount })
          .map((_, i) => `<span class="dot${i === 0 ? ' active' : ''}"></span>`)
          .join('')}</div>`
      : ''
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
  message: string,
  dotCount = 0
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
      args: isLocal ? [] : chromium.args,
      defaultViewport: { width: 1080, height: 1920 },
      executablePath: isLocal
        ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
        : await chromium.executablePath(),
      headless: true,
    })

    const page = await browser.newPage()

    // Set viewport to 1080x1920
    await page.setViewport({
      width: CANVAS_WIDTH,
      height: CANVAS_HEIGHT,
      deviceScaleFactor: 1,
    })

    // Generate and load HTML with base64 data URL instead of external URL
    const html = generateHTML(imageDataUrl, message, dotCount)
    await page.setContent(html, {
      waitUntil: 'load', // Puppeteer-core setContent only supports load/domcontentloaded
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

    // Replace emoji glyphs with inline <img> tags (Twemoji), then wait for all
    // images (photo + emoji) to finish loading so they appear in the screenshot.
    // This makes emoji render even though the serverless Chromium has no emoji font.
    await page.evaluate(async () => {
      const twemoji = (window as unknown as { twemoji?: {
        parse: (node: HTMLElement, options: Record<string, unknown>) => void
      } }).twemoji
      if (twemoji) {
        twemoji.parse(document.body, {
          folder: 'svg',
          ext: '.svg',
          base: 'https://cdn.jsdelivr.net/gh/jdecked/twemoji@15.1.0/assets/',
        })
      }
      await Promise.all(
        Array.from(document.images).map((img) =>
          img.complete
            ? Promise.resolve()
            : new Promise<void>((resolve) => {
                img.addEventListener('load', () => resolve())
                img.addEventListener('error', () => resolve())
              })
        )
      )
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
  message: string,
  dotCount = 0
): Promise<string> {
  // Render the card
  const buffer = await renderSocialCard(photoUrl, message, dotCount)

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

