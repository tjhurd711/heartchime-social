import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { bundle } from '@remotion/bundler'
import { renderMedia, selectComposition } from '@remotion/renderer'

async function main() {
  const payloadPath = process.argv[2]
  const outputLocation = process.argv[3]

  if (!payloadPath || !outputLocation) {
    throw new Error('Usage: node scripts/render-voicemail-video.mjs <payloadPath> <outputLocation>')
  }

  const payloadRaw = await fs.readFile(payloadPath, 'utf8')
  const payload = JSON.parse(payloadRaw)
  const inputProps = payload.inputProps
  const durationInFrames = payload.durationInFrames
  const jobId = payload.jobId || 'default'

  if (!inputProps || !durationInFrames) {
    throw new Error('Render payload is missing inputProps or durationInFrames')
  }

  const tempRoot = path.join(os.tmpdir(), 'voicemail-renders')
  await fs.mkdir(tempRoot, { recursive: true })
  const jobTempDirectory = path.join(tempRoot, jobId)
  await fs.mkdir(jobTempDirectory, { recursive: true })

  const entryPoint = path.join(process.cwd(), 'lib/voicemail-video/remotion-entry.ts')
  const serveUrl = await bundle({
    entryPoint,
    onProgress: () => undefined,
    outDir: path.join(jobTempDirectory, 'bundle'),
  })

  const composition = await selectComposition({
    id: 'VoicemailVideo',
    serveUrl,
    inputProps,
  })

  await renderMedia({
    composition,
    serveUrl,
    codec: 'h264',
    outputLocation,
    inputProps,
    frameRange: [0, durationInFrames - 1],
    audioCodec: 'aac',
    overwrite: true,
  })
}

main().catch((error) => {
  console.error('[render-voicemail-video]', error)
  process.exit(1)
})
