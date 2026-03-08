// ═══════════════════════════════════════════════════════════════════════════
// SOCIAL SLIDE 1 RENDERER - Recipient photo with hook text overlay
// ═══════════════════════════════════════════════════════════════════════════
//
// Renders Slide 1 of social media carousels as 1080x1920 PNG
// Full-bleed recipient photo with text overlay in Snapchat or Clean style
// ═══════════════════════════════════════════════════════════════════════════

import puppeteer from 'puppeteer'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { v4 as uuidv4 } from 'uuid'

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

const CANVAS_WIDTH = 1080
const CANVAS_HEIGHT = 1920

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

export type TextStyle = 'snapchat' | 'clean'

// ═══════════════════════════════════════════════════════════════════════════
// HTML TEMPLATES
// ═══════════════════════════════════════════════════════════════════════════

function generateSnapchatHTML(photoUrl: string, hookText: string, eventDate?: string): string {
  // Random slight rotation between -3 and 3 degrees
  const rotation = (Math.random() * 6 - 3).toFixed(1)
  
  // Escape text for HTML
  const escapedText = hookText
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')

  // Format date from ISO (2012-02-11) to MM/DD/YYYY (02/11/2012)
  let formattedDate = ''
  if (eventDate) {
    const parts = eventDate.split('-')
    if (parts.length === 3) {
      formattedDate = `${parts[1]}/${parts[2]}/${parts[0]}`
    }
  }

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      width: ${CANVAS_WIDTH}px;
      height: ${CANVAS_HEIGHT}px;
      overflow: hidden;
      position: relative;
    }
    
    .photo {
      width: 100%;
      height: 100%;
      object-fit: cover;
      position: absolute;
      top: 0;
      left: 0;
    }
    
    .date-stamp {
      position: absolute;
      top: 48px;
      left: 48px;
      font-family: 'Courier New', Courier, monospace;
      font-size: 36px;
      font-weight: 700;
      color: #ff6600;
      text-shadow: 
        1px 1px 0 rgba(0, 0, 0, 0.8),
        -1px -1px 0 rgba(0, 0, 0, 0.4);
      letter-spacing: 2px;
      opacity: 0.85;
      z-index: 10;
    }
    
    .text-container {
      position: absolute;
      bottom: 25%;
      left: 50%;
      transform: translateX(-50%) rotate(${rotation}deg);
      width: 90%;
      text-align: center;
    }
    
    .hook-text {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
      font-size: 72px;
      font-weight: 700;
      color: white;
      text-shadow: 
        -3px -3px 0 #000,
        3px -3px 0 #000,
        -3px 3px 0 #000,
        3px 3px 0 #000,
        0 0 20px rgba(0, 0, 0, 0.5);
      line-height: 1.2;
      word-wrap: break-word;
      max-width: 100%;
    }
  </style>
</head>
<body>
  <!-- Full-bleed photo -->
  <img class="photo" src="${photoUrl}" alt="Recipient" />
  
  ${formattedDate ? `<!-- Date stamp overlay (Live Past only) -->\n  <div class="date-stamp">${formattedDate}</div>` : ''}
  
  <!-- Hook text overlay -->
  <div class="text-container">
    <p class="hook-text">${escapedText}</p>
  </div>
</body>
</html>
`
}

function generateCleanHTML(photoUrl: string, hookText: string, eventDate?: string): string {
  // Escape text for HTML
  const escapedText = hookText
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
    .toUpperCase()

  // Format date from ISO (2012-02-11) to MM/DD/YYYY (02/11/2012)
  let formattedDate = ''
  if (eventDate) {
    const parts = eventDate.split('-')
    if (parts.length === 3) {
      formattedDate = `${parts[1]}/${parts[2]}/${parts[0]}`
    }
  }

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@600&display=swap" rel="stylesheet">
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      width: ${CANVAS_WIDTH}px;
      height: ${CANVAS_HEIGHT}px;
      overflow: hidden;
      position: relative;
    }
    
    .photo {
      width: 100%;
      height: 100%;
      object-fit: cover;
      position: absolute;
      top: 0;
      left: 0;
    }
    
    .date-stamp {
      position: absolute;
      top: 48px;
      left: 48px;
      font-family: 'Courier New', Courier, monospace;
      font-size: 36px;
      font-weight: 700;
      color: #ff6600;
      text-shadow: 
        1px 1px 0 rgba(0, 0, 0, 0.8),
        -1px -1px 0 rgba(0, 0, 0, 0.4);
      letter-spacing: 2px;
      opacity: 0.85;
      z-index: 10;
    }
    
    .text-container {
      position: absolute;
      bottom: 25%;
      left: 50%;
      transform: translateX(-50%);
      max-width: 90%;
    }
    
    .text-pill {
      background: rgba(0, 0, 0, 0.6);
      padding: 24px 48px;
      border-radius: 16px;
      backdrop-filter: blur(4px);
    }
    
    .hook-text {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      font-size: 56px;
      font-weight: 600;
      color: white;
      text-align: center;
      line-height: 1.3;
      letter-spacing: 2px;
      word-wrap: break-word;
    }
  </style>
</head>
<body>
  <!-- Full-bleed photo -->
  <img class="photo" src="${photoUrl}" alt="Recipient" />
  
  ${formattedDate ? `<!-- Date stamp overlay (Live Past only) -->\n  <div class="date-stamp">${formattedDate}</div>` : ''}
  
  <!-- Hook text overlay with pill background -->
  <div class="text-container">
    <div class="text-pill">
      <p class="hook-text">${escapedText}</p>
    </div>
  </div>
</body>
</html>
`
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN RENDER FUNCTION
// ═══════════════════════════════════════════════════════════════════════════

export async function renderSlide1(
  recipientPhotoUrl: string,
  hookText: string,
  style: TextStyle = 'snapchat',
  eventDate?: string
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

    // Set viewport to 1080x1920
    await page.setViewport({
      width: CANVAS_WIDTH,
      height: CANVAS_HEIGHT,
      deviceScaleFactor: 1,
    })

    // Generate HTML based on style
    const html = style === 'snapchat' 
      ? generateSnapchatHTML(recipientPhotoUrl, hookText, eventDate)
      : generateCleanHTML(recipientPhotoUrl, hookText, eventDate)

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

export async function renderAndUploadSlide1(
  recipientPhotoUrl: string,
  hookText: string,
  style: TextStyle = 'snapchat',
  eventDate?: string
): Promise<string> {
  // Render the slide
  const buffer = await renderSlide1(recipientPhotoUrl, hookText, style, eventDate)

  // Generate unique filename
  const filename = `social-slides/${uuidv4()}.png`

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

