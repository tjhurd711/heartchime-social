import { promises as fs } from 'fs'
import path from 'path'
import sharp from 'sharp'

const overlaysDir = path.join(process.cwd(), 'public', 'quote-overlays')
const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

function isPngSignature(buffer) {
  return buffer.length >= 8 && buffer.subarray(0, 8).equals(pngSignature)
}

async function main() {
  const entries = await fs.readdir(overlaysDir)
  const pngFiles = entries.filter((name) => name.toLowerCase().endsWith('.png')).sort()

  if (pngFiles.length === 0) {
    console.log('[guard-quote-overlays] No .png files found.')
    return
  }

  const failures = []

  for (const fileName of pngFiles) {
    const fullPath = path.join(overlaysDir, fileName)
    const raw = await fs.readFile(fullPath)
    const metadata = await sharp(raw).metadata()
    const signatureOk = isPngSignature(raw)
    const formatOk = metadata.format === 'png'
    const hasAlpha = metadata.hasAlpha === true

    if (!signatureOk || !formatOk || !hasAlpha) {
      failures.push({
        fileName,
        signatureOk,
        format: metadata.format,
        hasAlpha: metadata.hasAlpha,
      })
      continue
    }

    console.log(`[guard-quote-overlays] OK ${fileName}`)
  }

  if (failures.length > 0) {
    console.error('[guard-quote-overlays] Validation failed:')
    for (const failure of failures) {
      console.error(
        `  - ${failure.fileName} (signatureOk=${failure.signatureOk}, format=${failure.format}, hasAlpha=${failure.hasAlpha})`
      )
    }
    process.exit(1)
  }

  console.log(`[guard-quote-overlays] Passed. ${pngFiles.length} overlay files are true PNG with alpha.`)
}

main().catch((error) => {
  console.error('[guard-quote-overlays] Failed:', error)
  process.exit(1)
})
