// ═══════════════════════════════════════════════════════════════════════════
// GEM CARD RENDERER - Puppeteer-based PNG generation for HeartGem cards
// ═══════════════════════════════════════════════════════════════════════════
//
// Renders HeartGem cards as 1080x1920 PNG images.
// Mirrors lib/socialCardRenderer.ts exactly (same headless-Chrome pipeline,
// same Twemoji handling, same S3 upload) — only the card layout differs:
// websitegem.png icon + "HeartGem" wordmark, the image, a "Because…" context
// line, and an optional "via @handle" credit.
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

// Colors (matching the showcase GemCard design)
const GOLD_COLOR = '#FFC300'
const ORANGE_COLOR = '#FF9800'
const NAVY_BLUE = '#1A365D'
const LIGHTER_NAVY = '#2C5282'
const WHITE = '#FFFFFF'

// Scaled dimensions
const BORDER_RING = Math.round(2.5 * SCALE) // 8px navy border ring
const CARD_PADDING = Math.round(20 * SCALE) // 64px
const OUTER_BORDER_RADIUS = Math.round(24 * SCALE) // 77px
const INNER_BORDER_RADIUS = Math.round(21.5 * SCALE) // 69px
const ICON_WIDTH = Math.round(44 * SCALE) // 141px (gem icon is ~44x40 in showcase)
const ICON_HEIGHT = Math.round(40 * SCALE) // 128px
const HEADER_FONT_SIZE = Math.round(25 * SCALE) // 80px
const PHOTO_BORDER_RADIUS = Math.round(16 * SCALE) // 51px
const CONTEXT_FONT_SIZE = Math.round(16 * SCALE) // 51px
const HANDLE_FONT_SIZE = Math.round(12 * SCALE) // 38px
const GAP = Math.round(16 * SCALE) // 51px
const PLAY_BUTTON_SIZE = Math.round(64 * SCALE) // 205px
const PLAY_ICON_SIZE = Math.round(30 * SCALE) // 96px

// HeartGem icon URL (public)
const HEARTGEM_ICON_URL = 'https://heartbeat-photos-prod.s3.us-east-2.amazonaws.com/icons/websitegem.png'

// ═══════════════════════════════════════════════════════════════════════════
// HTML TEMPLATE
// ═══════════════════════════════════════════════════════════════════════════

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

export function generateHTML(photoUrl: string, context: string, creatorHandle = ''): string {
  const escapedContext = escapeHtml(context)
  const escapedHandle = escapeHtml(creatorHandle)

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
    
    /* Outer navy ring fakes the gradient border, matching the showcase. */
    .card-border {
      width: ${CARD_WIDTH}px;
      padding: ${BORDER_RING}px;
      border-radius: ${OUTER_BORDER_RADIUS}px;
      background: ${NAVY_BLUE};
      box-shadow: 0 ${Math.round(6 * SCALE)}px ${Math.round(15 * SCALE)}px ${Math.round(2 * SCALE)}px rgba(26, 54, 93, 0.3);
    }

    .card {
      padding: ${CARD_PADDING}px;
      border-radius: ${INNER_BORDER_RADIUS}px;
      background: linear-gradient(135deg, ${NAVY_BLUE} 0%, ${LIGHTER_NAVY} 100%);
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: ${GAP}px;
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
      background: linear-gradient(135deg, ${GOLD_COLOR}, ${ORANGE_COLOR});
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }
    
    .photo-container {
      width: 100%;
      position: relative;
      border-radius: ${PHOTO_BORDER_RADIUS}px;
      overflow: hidden;
    }
    
    /* Size to the image's natural aspect ratio (height: auto) so the whole
       photo shows, exactly like the live preview — instead of a fixed-height
       box that crops the top/bottom of the image. */
    .photo {
      width: 100%;
      height: auto;
      min-height: ${Math.round(150 * SCALE)}px;
      max-height: ${Math.round(350 * SCALE)}px;
      object-fit: cover;
      object-position: center;
      display: block;
    }

    /* Play button overlay — makes the still read as a video frame. */
    .play-overlay {
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .play-button {
      width: ${PLAY_BUTTON_SIZE}px;
      height: ${PLAY_BUTTON_SIZE}px;
      border-radius: 50%;
      background: rgba(0, 0, 0, 0.6);
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 ${Math.round(4 * SCALE)}px ${Math.round(12 * SCALE)}px rgba(0, 0, 0, 0.35);
    }

    .play-button svg {
      width: ${PLAY_ICON_SIZE}px;
      height: ${PLAY_ICON_SIZE}px;
      margin-left: ${Math.round(4 * SCALE)}px;
    }
    
    .photo-placeholder {
      width: 100%;
      height: ${Math.round(200 * SCALE)}px;
      border-radius: ${PHOTO_BORDER_RADIUS}px;
      background: rgba(255, 255, 255, 0.1);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: ${Math.round(48 * SCALE)}px;
      opacity: 0.6;
    }
    
    .context {
      font-family: 'Raleway', sans-serif;
      font-size: ${CONTEXT_FONT_SIZE}px;
      font-weight: 600;
      background: linear-gradient(135deg, ${GOLD_COLOR}, ${ORANGE_COLOR});
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
      text-align: center;
      line-height: 1.4;
      margin: 0;
      padding: 0 ${Math.round(10 * SCALE)}px;
    }

    .handle {
      font-family: 'Raleway', sans-serif;
      font-size: ${HANDLE_FONT_SIZE}px;
      font-weight: 500;
      font-style: italic;
      color: rgba(255, 195, 0, 0.7);
      text-align: center;
      margin: ${Math.round(-8 * SCALE)}px 0 0;
    }

    /* Inline emoji images injected by Twemoji, sized to match the surrounding text */
    .context img.emoji {
      height: 1em;
      width: 1em;
      margin: 0 0.05em 0 0.1em;
      vertical-align: -0.12em;
      display: inline-block;
    }
  </style>
</head>
<body>
  <div class="card-border">
    <div class="card">
      <!-- Header -->
      <div class="header">
        <img class="icon" src="${HEARTGEM_ICON_URL}" alt="HeartGem" />
        <span class="title">HeartGem</span>
      </div>
      
      <!-- Photo -->
      ${photoUrl 
        ? `<div class="photo-container"><img class="photo" src="${photoUrl}" alt="Memory" /><div class="play-overlay"><div class="play-button"><svg viewBox="0 0 24 24" fill="${GOLD_COLOR}"><path d="M8 5v14l11-7z"/></svg></div></div></div>`
        : `<div class="photo-placeholder">📷</div>`
      }
      
      <!-- Context -->
      <p class="context">${escapedContext}</p>

      <!-- Creator handle -->
      ${creatorHandle
        ? `<p class="handle">via ${escapedHandle}</p>`
        : ''
      }
    </div>
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
    console.log(`[gemCardRenderer] 📥 Fetching image: ${url.slice(0, 60)}...`)
    const response = await fetch(url)
    if (!response.ok) {
      console.error(`[gemCardRenderer] ❌ Failed to fetch image: ${response.status}`)
      return null
    }
    
    const contentType = response.headers.get('content-type') || 'image/png'
    const arrayBuffer = await response.arrayBuffer()
    const base64 = Buffer.from(arrayBuffer).toString('base64')
    
    const dataUrl = `data:${contentType};base64,${base64}`
    console.log(`[gemCardRenderer] ✅ Converted to data URL (${base64.length} chars)`)
    return dataUrl
  } catch (error) {
    console.error('[gemCardRenderer] ❌ Error fetching image:', error)
    return null
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN RENDER FUNCTION
// ═══════════════════════════════════════════════════════════════════════════

export async function renderGemCard(
  photoUrl: string,
  context: string,
  creatorHandle = ''
): Promise<Buffer> {
  let browser = null

  try {
    // Get image as data URL (CSS clip-path handles rounded corners)
    let imageDataUrl = ''
    if (photoUrl) {
      if (photoUrl.startsWith('data:')) {
        console.log('[gemCardRenderer] 📥 Using provided data URL')
        imageDataUrl = photoUrl
      } else {
        const dataUrl = await fetchImageAsDataUrl(photoUrl)
        if (dataUrl) {
          imageDataUrl = dataUrl
        } else {
          console.warn('[gemCardRenderer] ⚠️ Could not fetch photo, card will have placeholder')
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
    const html = generateHTML(imageDataUrl, context, creatorHandle)
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

export async function renderAndUploadGemCard(
  photoUrl: string,
  context: string,
  creatorHandle = ''
): Promise<string> {
  // Render the card
  const buffer = await renderGemCard(photoUrl, context, creatorHandle)

  // Generate unique filename. Must live under the social-cards/* prefix, which
  // is the prefix the bucket policy makes publicly readable — a sibling prefix
  // like gem-cards/* uploads fine but returns 403 AccessDenied on read, so the
  // browser ends up saving an XML error body as a .png.
  const filename = `social-cards/gems/${uuidv4()}.png`

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
