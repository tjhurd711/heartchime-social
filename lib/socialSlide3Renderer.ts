// ═══════════════════════════════════════════════════════════════════════════
// SOCIAL SLIDE 3 RENDERER - Media slide matching HeartChime card design
// ═══════════════════════════════════════════════════════════════════════════
//
// Renders Slide 3 of social media carousels as 1080x1920 PNG (same as main card)
// Matches the exact design of socialCardRenderer.ts / HeartchimePreviewCard
// Shows media (album art, movie poster, celebrity photo) in the card's image area
// Used by Pipeline 3 (Live Past) for cultural moments
// ═══════════════════════════════════════════════════════════════════════════

import puppeteer from 'puppeteer'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { v4 as uuidv4 } from 'uuid'

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTS - MATCHING socialCardRenderer.ts EXACTLY
// ═══════════════════════════════════════════════════════════════════════════

const CANVAS_WIDTH = 1080
const CANVAS_HEIGHT = 1920 // Same as main HeartChime card (story format)

// S3 config
const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-east-2',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
  },
})

const S3_BUCKET = process.env.AWS_S3_BUCKET || 'heartbeat-photos-prod'

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export type Slide3Type = 'album_art' | 'movie_poster'
export type Slide3Category = 'music' | 'movies_tv' | 'people' | string

// ═══════════════════════════════════════════════════════════════════════════
// HELPER - Escape text for HTML
// ═══════════════════════════════════════════════════════════════════════════

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

// ═══════════════════════════════════════════════════════════════════════════
// DESIGN TOKENS - COPIED FROM socialCardRenderer.ts
// ═══════════════════════════════════════════════════════════════════════════

// Card dimensions (scaled 3.2x from 300px preview) - SAME AS MAIN CARD
const CARD_WIDTH = 960
const SCALE = CARD_WIDTH / 300 // 3.2x

// Colors (matching Framer design)
const GOLD_COLOR = '#FFC300'
const ORANGE_COLOR = '#FF9800'
const NAVY_BLUE = '#1A365D'
const WHITE = '#FFFFFF'

// Scaled dimensions - SAME AS MAIN CARD
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
// TEMPLATE A: MUSIC/AUDIO SLIDE (category === 'music')
// HeartChime card with Spotify-style "now playing" overlay on album art
// ═══════════════════════════════════════════════════════════════════════════

function generateMusicPlayerHTML(
  mediaImageUrl: string,
  mediaTitle: string,
  mediaArtist: string,
  message: string
): string {
  const escapedTitle = escapeHtml(mediaTitle)
  const escapedArtist = escapeHtml(mediaArtist)
  const escapedMessage = escapeHtml(message)

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
    
    /* Fixed to match Slide 2's 4:3 landscape Imagen output */
    .photo {
      width: 100%;
      height: 100%;
      object-fit: cover;
      object-position: center;
      display: block;
    }
    
    /* Spotify-style "now playing" overlay */
    .spotify-overlay {
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      background: linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.6) 60%, transparent 100%);
      padding: ${Math.round(20 * SCALE)}px;
      padding-top: ${Math.round(40 * SCALE)}px;
    }
    
    .spotify-content {
      display: flex;
      align-items: center;
      gap: ${Math.round(16 * SCALE)}px;
    }
    
    .play-button {
      width: ${Math.round(48 * SCALE)}px;
      height: ${Math.round(48 * SCALE)}px;
      background: #1DB954;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }
    
    .play-icon {
      width: 0;
      height: 0;
      border-left: ${Math.round(16 * SCALE)}px solid white;
      border-top: ${Math.round(10 * SCALE)}px solid transparent;
      border-bottom: ${Math.round(10 * SCALE)}px solid transparent;
      margin-left: ${Math.round(4 * SCALE)}px;
    }
    
    .track-info {
      flex: 1;
      min-width: 0;
    }
    
    .track-title {
      color: white;
      font-size: ${Math.round(18 * SCALE)}px;
      font-weight: 600;
      font-family: 'Raleway', sans-serif;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    
    .track-artist {
      color: rgba(255,255,255,0.7);
      font-size: ${Math.round(14 * SCALE)}px;
      font-weight: 500;
      font-family: 'Raleway', sans-serif;
      margin-top: ${Math.round(4 * SCALE)}px;
    }
    
    .music-bars {
      display: flex;
      align-items: flex-end;
      gap: ${Math.round(3 * SCALE)}px;
      height: ${Math.round(24 * SCALE)}px;
    }
    
    .bar {
      width: ${Math.round(4 * SCALE)}px;
      background: #1DB954;
      border-radius: ${Math.round(2 * SCALE)}px;
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
    
    <!-- Album art with Spotify overlay -->
    <div class="photo-container">
      <img class="photo" src="${mediaImageUrl}" alt="${escapedTitle}" />
      <div class="spotify-overlay">
        <div class="spotify-content">
          <div class="play-button">
            <div class="play-icon"></div>
          </div>
          <div class="track-info">
            <div class="track-title">${escapedTitle}</div>
            <div class="track-artist">${escapedArtist}</div>
          </div>
          <div class="music-bars">
            <div class="bar" style="height: 40%;"></div>
            <div class="bar" style="height: 80%;"></div>
            <div class="bar" style="height: 60%;"></div>
            <div class="bar" style="height: 100%;"></div>
            <div class="bar" style="height: 50%;"></div>
          </div>
        </div>
      </div>
    </div>
    
    <!-- Message (same as Slide 2) -->
    <p class="message">${escapedMessage}</p>
  </div>
</body>
</html>
`
}

// ═══════════════════════════════════════════════════════════════════════════
// TEMPLATE B: VIDEO/COVER SLIDE (category === 'movies_tv' or 'people')
// HeartChime card with movie poster / celebrity photo
// ═══════════════════════════════════════════════════════════════════════════

function generateVideoPreviewHTML(
  mediaImageUrl: string,
  mediaTitle: string,
  mediaArtist: string,
  message: string
): string {
  const escapedTitle = escapeHtml(mediaTitle)
  const escapedArtist = escapeHtml(mediaArtist)
  const escapedMessage = escapeHtml(message)

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
    
    /* Fixed to match Slide 2's 4:3 landscape Imagen output */
    .photo {
      width: 100%;
      height: 100%;
      object-fit: cover;
      object-position: center;
      display: block;
    }
    
    /* Title overlay at bottom of image */
    .title-overlay {
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      background: linear-gradient(to top, rgba(0,0,0,0.8) 0%, rgba(0,0,0,0.5) 60%, transparent 100%);
      padding: ${Math.round(20 * SCALE)}px;
      padding-top: ${Math.round(40 * SCALE)}px;
    }
    
    .overlay-title {
      color: white;
      font-size: ${Math.round(20 * SCALE)}px;
      font-weight: 600;
      font-family: 'Raleway', sans-serif;
    }
    
    .overlay-subtitle {
      color: rgba(255,255,255,0.7);
      font-size: ${Math.round(14 * SCALE)}px;
      font-weight: 500;
      font-family: 'Raleway', sans-serif;
      margin-top: ${Math.round(4 * SCALE)}px;
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
    
    <!-- Photo with title overlay -->
    <div class="photo-container">
      <img class="photo" src="${mediaImageUrl}" alt="${escapedTitle}" />
      <div class="title-overlay">
        <div class="overlay-title">${escapedTitle}</div>
        ${escapedArtist ? `<div class="overlay-subtitle">${escapedArtist}</div>` : ''}
      </div>
    </div>
    
    <!-- Message (same as Slide 2) -->
    <p class="message">${escapedMessage}</p>
  </div>
</body>
</html>
`
}

// ═══════════════════════════════════════════════════════════════════════════
// HTML TEMPLATE ROUTER - Selects template based on category
// ═══════════════════════════════════════════════════════════════════════════

function generateSlide3HTML(
  mediaImageUrl: string,
  mediaTitle: string,
  mediaArtist: string,
  year: string,
  slide3Type: Slide3Type,
  category: Slide3Category | undefined,
  message: string
): string {
  // Template A: Music Player (for music category)
  if (category === 'music') {
    return generateMusicPlayerHTML(mediaImageUrl, mediaTitle, mediaArtist, message)
  }
  
  // Template B: Video Preview (for movies_tv, people, or fallback)
  return generateVideoPreviewHTML(mediaImageUrl, mediaTitle, mediaArtist, message)
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN RENDER FUNCTION
// ═══════════════════════════════════════════════════════════════════════════

export async function renderSlide3(
  mediaImageUrl: string,
  mediaTitle: string,
  mediaArtist: string,
  year: string,
  slide3Type: Slide3Type = 'album_art',
  category?: Slide3Category,
  message: string = ''
): Promise<Buffer> {
  let browser = null

  try {
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

    // Set viewport to 1080x1920 (same as main HeartChime card)
    await page.setViewport({
      width: CANVAS_WIDTH,
      height: CANVAS_HEIGHT,
      deviceScaleFactor: 1,
    })

    // Generate HTML based on category
    const html = generateSlide3HTML(mediaImageUrl, mediaTitle, mediaArtist, year, slide3Type, category, message)

    await page.setContent(html, {
      waitUntil: 'networkidle0', // Wait for fonts and images to load
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

export async function renderAndUploadSlide3(
  mediaImageUrl: string,
  mediaTitle: string,
  mediaArtist: string,
  year: string,
  slide3Type: Slide3Type = 'album_art',
  category?: Slide3Category,
  message: string = ''
): Promise<string> {
  // Render the slide
  const buffer = await renderSlide3(mediaImageUrl, mediaTitle, mediaArtist, year, slide3Type, category, message)

  // Generate unique filename
  const filename = `social-slides/slide3-${uuidv4()}.png`

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
