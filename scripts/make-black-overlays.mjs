import { promises as fs } from 'fs'
import path from 'path'
import sharp from 'sharp'

const whiteThreshold = 205

const mappings = [
  { source: 'blackcoffee-source.png', output: 'blackcoffee.png' },
  { source: 'blackcandle-source.png', output: 'blackcandle.png' },
  { source: 'blackmoons-source.png', output: 'blackmoons.png' },
  { source: 'blackolive-source.png', output: 'blackolive.png' },
  { source: 'blackwindchimes-source.png', output: 'blackwindchimes.png' },
]

const sourcesDir = path.join(process.cwd(), 'public', 'quote-overlays', 'sources')
const outDir = path.join(process.cwd(), 'public', 'quote-overlays')

async function convertOne(sourcePath, outPath) {
  const input = await fs.readFile(sourcePath)
  const { data, info } = await sharp(input)
    .toColourspace('srgb')
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })

  if (info.channels < 4) {
    throw new Error(`Expected 4 channels after ensureAlpha, got ${info.channels}`)
  }

  const out = Buffer.from(data)
  let transparentCount = 0
  let opaqueCount = 0

  for (let i = 0; i < out.length; i += info.channels) {
    const r = out[i]
    const g = out[i + 1]
    const b = out[i + 2]
    const alphaIndex = i + 3

    if (r > whiteThreshold && g > whiteThreshold && b > whiteThreshold) {
      out[alphaIndex] = 0
      transparentCount += 1
    } else {
      out[alphaIndex] = 255
      opaqueCount += 1
    }
  }

  const encoded = await sharp(out, {
    raw: {
      width: info.width,
      height: info.height,
      channels: info.channels,
    },
  })
    .png()
    .toBuffer()

  await fs.writeFile(outPath, encoded)

  return {
    width: info.width,
    height: info.height,
    transparentCount,
    opaqueCount,
  }
}

async function main() {
  for (const entry of mappings) {
    const sourcePath = path.join(sourcesDir, entry.source)
    const outPath = path.join(outDir, entry.output)
    const result = await convertOne(sourcePath, outPath)
    console.log(
      `[make-black-overlays] ${entry.source} -> ${entry.output} (${result.width}x${result.height}) transparent=${result.transparentCount} opaque=${result.opaqueCount}`
    )
  }
}

main().catch((error) => {
  console.error('[make-black-overlays] Failed:', error)
  process.exit(1)
})
