import fs from 'node:fs/promises'
import { execFile } from 'node:child_process'
import path from 'node:path'
import { promisify } from 'node:util'
import { NextRequest, NextResponse } from 'next/server'
import { getVoicemailS3Url, uploadVoicemailObject } from '@/lib/voicemailStorage'
import type { VoicemailVideoInputProps } from '@/lib/voicemail-video/VoicemailVideoComposition'

export const runtime = 'nodejs'

interface GenerateVoicemailVideoRequest {
  contactName?: string
  emoji?: string
  metadataLine?: string
  topLabel?: string
  transcriptText?: string
  theme?: 'classic_dark' | 'soft_blur' | 'minimal_black'
  script?: string
  voiceId?: string
  profileImageDataUrl?: string | null
  audioUrl?: string
  audioKey?: string
  audioBase64?: string
  audioMimeType?: string
  durationSeconds?: number
}

const execFileAsync = promisify(execFile)

function extractJobIdFromAudioKey(audioKey: string | null): string | null {
  if (!audioKey) return null
  const match = audioKey.match(/^voicemail-tester\/([^/]+)\/audio\./)
  return match?.[1] || null
}

function parseDataUrl(dataUrl: string): { mimeType: string; buffer: Buffer } | null {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/)
  if (!match) return null
  const mimeType = match[1]
  const base64Payload = match[2]
  return {
    mimeType,
    buffer: Buffer.from(base64Payload, 'base64'),
  }
}

function extensionFromMimeType(mimeType: string): string {
  if (mimeType === 'image/png') return 'png'
  if (mimeType === 'image/webp') return 'webp'
  if (mimeType === 'image/avif') return 'avif'
  return 'jpg'
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as GenerateVoicemailVideoRequest
    const contactName = body.contactName?.trim() || 'Mom'
    const emoji = body.emoji?.trim() || ''
    const metadataLine = body.metadataLine?.trim() || 'home • Dec 16, 2022 at 1:54 PM'
    const topLabel = body.topLabel?.trim() || 'Voicemail'
    const transcriptText = body.transcriptText?.trim() || 'Transcript unavailable'
    const theme = body.theme || 'classic_dark'
    const script = body.script?.trim() || ''
    const voiceId = body.voiceId?.trim() || ''
    const audioKey = body.audioKey?.trim() || ''
    const audioUrl = body.audioUrl?.trim() || (audioKey ? getVoicemailS3Url(audioKey) : '')
    const audioBase64 = body.audioBase64?.trim() || ''
    const audioMimeType = body.audioMimeType?.trim() || 'audio/mpeg'
    const durationSeconds = Number(body.durationSeconds)

    if (!audioUrl && !audioBase64) {
      return NextResponse.json({ error: 'audioUrl/audioKey or audioBase64 is required' }, { status: 400 })
    }

    if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
      return NextResponse.json({ error: 'durationSeconds must be a positive number' }, { status: 400 })
    }

    const jobId = extractJobIdFromAudioKey(audioKey || null) || crypto.randomUUID()
    const fps = 30
    const durationInFrames = Math.max(1, Math.ceil(durationSeconds * fps))
    const jobPrefix = `voicemail-tester/${jobId}`
    let profileImageUrl: string | null = null
    let profileImageKey: string | null = null

    if (body.profileImageDataUrl?.trim()) {
      const profileInput = body.profileImageDataUrl.trim()
      if (profileInput.startsWith('data:image/')) {
        const parsed = parseDataUrl(profileInput)
        if (parsed) {
          const ext = extensionFromMimeType(parsed.mimeType)
          profileImageKey = `${jobPrefix}/profile-image.${ext}`
          await uploadVoicemailObject({
            key: profileImageKey,
            body: parsed.buffer,
            contentType: parsed.mimeType,
            cacheControl: 'max-age=31536000',
          })
          profileImageUrl = getVoicemailS3Url(profileImageKey)
        }
      } else if (/^https?:\/\//i.test(profileInput)) {
        profileImageUrl = profileInput
      }
    }

    const inputProps: VoicemailVideoInputProps = {
      profileImageSrc: profileImageUrl,
      contactName,
      emoji,
      metadataLine,
      topLabel,
      transcriptText,
      theme,
      script,
      audioSrc: audioUrl || `data:${audioMimeType};base64,${audioBase64}`,
      durationInFrames,
    }

    const outputDirectory = path.join(process.cwd(), 'tmp', 'voicemail-renders', jobId)
    await fs.mkdir(outputDirectory, { recursive: true })
    const outputFileName = `video-${Date.now()}.mp4`
    const outputLocation = path.join(outputDirectory, outputFileName)
    const tempDirectory = path.join(process.cwd(), 'tmp', 'voicemail-renders')
    await fs.mkdir(tempDirectory, { recursive: true })
    const payloadPath = path.join(tempDirectory, `payload-${Date.now()}.json`)
    const rendererScriptPath = path.join(process.cwd(), 'scripts', 'render-voicemail-video.mjs')

    await fs.writeFile(
      payloadPath,
      JSON.stringify({
        inputProps,
        durationInFrames,
      }),
      'utf8'
    )

    try {
      await execFileAsync(process.execPath, [rendererScriptPath, payloadPath, outputLocation], {
        cwd: process.cwd(),
        maxBuffer: 1024 * 1024 * 8,
      })
    } finally {
      await fs.unlink(payloadPath).catch(() => undefined)
    }

    const videoBuffer = await fs.readFile(outputLocation)
    const videoKey = `${jobPrefix}/video.mp4`
    await uploadVoicemailObject({
      key: videoKey,
      body: videoBuffer,
      contentType: 'video/mp4',
      cacheControl: 'max-age=31536000',
    })

    const videoUrl = getVoicemailS3Url(videoKey)

    const metadataKey = `${jobPrefix}/metadata.json`
    await uploadVoicemailObject({
      key: metadataKey,
      body: JSON.stringify(
        {
          contactName,
          emoji,
          metadataLine,
          topLabel,
          transcriptText,
          theme,
          script,
          voiceId,
          durationSeconds,
          createdAt: new Date().toISOString(),
          audioKey: audioKey || null,
          audioUrl: audioUrl || null,
          videoKey,
          profileImageKey,
        },
        null,
        2
      ),
      contentType: 'application/json',
      cacheControl: 'max-age=31536000',
    })

    await fs.unlink(outputLocation).catch(() => undefined)
    await fs.rm(outputDirectory, { recursive: true, force: true }).catch(() => undefined)

    return NextResponse.json({
      videoUrl,
      videoKey,
      durationSeconds,
      metadataKey,
      jobId,
    })
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Failed to render voicemail video.',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
