import { promises as fs } from 'fs'
import path from 'path'
import sharp from 'sharp'

const overlaysDir = path.join(process.cwd(), 'public', 'quote-overlays')
const threshold = 50

async function fixOverlay(filePath) {
  const input = await fs.readFile(filePath)
  const { data, info } = await sharp(input)
    .toColourspace('srgb')
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })

  if (info.channels < 4) {
    throw new Error(`Expected at least 4 channels after ensureAlpha, got ${info.channels}`)
  }

  let changedPixels = 0
  const pixels = Buffer.from(data)

  for (let i = 0; i < pixels.length; i += info.channels) {
    const r = pixels[i]
    const g = pixels[i + 1]
    const b = pixels[i + 2]
    const alphaIndex = i + 3
    if (r < threshold && g < threshold && b < threshold) {
      if (pixels[alphaIndex] !== 0) {
        pixels[alphaIndex] = 0
        changedPixels += 1
      }
    }
  }

  const output = await sharp(pixels, {
    raw: {
      width: info.width,
      height: info.height,
      channels: info.channels,
    },
  })
    .png()
    .toBuffer()

  await fs.writeFile(filePath, output)
  return { changedPixels, width: info.width, height: info.height }
}

async function main() {
  const entries = await fs.readdir(overlaysDir)
  const pngFiles = entries.filter((name) => name.toLowerCase().endsWith('.png')).sort()

  if (pngFiles.length === 0) {
    console.log('[fix-quote-overlays-alpha] No .png files found.')
    return
  }

  let totalChanged = 0
  for (const fileName of pngFiles) {
    const fullPath = path.join(overlaysDir, fileName)
    const result = await fixOverlay(fullPath)
    totalChanged += result.changedPixels
    console.log(
      `[fix-quote-overlays-alpha] ${fileName}: ${result.width}x${result.height}, changed alpha on ${result.changedPixels} pixels`
    )
  }

  console.log(`[fix-quote-overlays-alpha] Done. Processed ${pngFiles.length} files, changed ${totalChanged} pixels total.`)
}

main().catch((error) => {
  console.error('[fix-quote-overlays-alpha] Failed:', error)
  process.exit(1)
})
