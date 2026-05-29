import { parseBuffer } from 'music-metadata'
import { NextRequest, NextResponse } from 'next/server'
import { getVoicemailSignedReadUrl, uploadVoicemailObject } from '@/lib/voicemailStorage'

export const runtime = 'nodejs'
export const maxDuration = 60

interface GeneratePoemVoiceRequest {
  poem?: string
  voiceId?: string
  jobId?: string
}

interface ElevenLabsAlignment {
  characters?: string[]
  character_start_times_seconds?: number[]
  character_end_times_seconds?: number[]
}

interface LineTiming {
  text: string
  start: number
  end: number
}

const ELEVENLABS_TTS_MODEL_ID = 'eleven_turbo_v2_5'

function roundUpToTenth(value: number): number {
  return Math.ceil(value * 10) / 10
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function normalizeAlignment(raw: unknown): ElevenLabsAlignment | null {
  if (!raw || typeof raw !== 'object') return null
  const record = raw as ElevenLabsAlignment
  if (
    !Array.isArray(record.characters) ||
    !Array.isArray(record.character_start_times_seconds) ||
    !Array.isArray(record.character_end_times_seconds)
  ) {
    return null
  }
  const count = Math.min(
    record.characters.length,
    record.character_start_times_seconds.length,
    record.character_end_times_seconds.length
  )
  if (count <= 0) return null
  return {
    characters: record.characters.slice(0, count),
    character_start_times_seconds: record.character_start_times_seconds.slice(0, count),
    character_end_times_seconds: record.character_end_times_seconds.slice(0, count),
  }
}

function evenlyDistributeLineTimings(poem: string, durationSeconds: number): LineTiming[] {
  const lines = poem
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
  if (lines.length === 0 || !isFiniteNumber(durationSeconds) || durationSeconds <= 0) return []

  const totalChars = lines.reduce((sum, line) => sum + Math.max(1, line.length), 0)
  let cursor = 0
  return lines.map((line) => {
    const slice = Math.max(1, line.length) / totalChars
    const span = Math.max(0.25, durationSeconds * slice)
    const start = cursor
    const end = Math.min(durationSeconds, start + span)
    cursor = end
    return { text: line, start, end }
  })
}

function buildLineTimings(poem: string, alignment: ElevenLabsAlignment | null, durationSeconds: number): LineTiming[] {
  if (!alignment || !alignment.characters || !alignment.character_start_times_seconds || !alignment.character_end_times_seconds) {
    return evenlyDistributeLineTimings(poem, durationSeconds)
  }

  const lines = poem
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
  if (lines.length === 0) return []

  const alignedText = alignment.characters.join('')
  const starts = alignment.character_start_times_seconds
  const ends = alignment.character_end_times_seconds
  const built: LineTiming[] = []
  let cursor = 0

  for (const line of lines) {
    const idx = alignedText.indexOf(line, cursor)
    if (idx < 0) {
      return evenlyDistributeLineTimings(poem, durationSeconds)
    }
    const lineEnd = idx + line.length
    let first = -1
    let last = -1

    for (let i = idx; i < lineEnd; i += 1) {
      const ch = alignedText[i]
      if (!ch || /\s/.test(ch)) continue
      if (first < 0 && isFiniteNumber(starts[i])) first = i
      if (isFiniteNumber(ends[i])) last = i
    }

    if (first < 0 || last < 0) {
      return evenlyDistributeLineTimings(poem, durationSeconds)
    }

    const start = Number(starts[first] || 0)
    const end = Number(ends[last] || start + 0.5)
    built.push({
      text: line,
      start: Math.max(0, start),
      end: Math.max(start + 0.05, end),
    })
    cursor = lineEnd
  }

  return built
}

export async function POST(request: NextRequest) {
  try {
    const apiKey = process.env.ELEVENLABS_API_KEY
    if (!apiKey) {
      return NextResponse.json(
        {
          error:
            'ElevenLabs credentials are missing. Set ELEVENLABS_API_KEY to enable poem voice generation.',
          code: 'ELEVENLABS_NOT_CONFIGURED',
        },
        { status: 503 }
      )
    }

    const body = (await request.json().catch(() => ({}))) as GeneratePoemVoiceRequest
    const poem = body.poem?.trim() || ''
    const voiceId = body.voiceId?.trim() || ''
    const jobId = body.jobId?.trim() || ''

    if (!poem) {
      return NextResponse.json({ error: 'poem is required' }, { status: 400 })
    }
    if (!voiceId) {
      return NextResponse.json({ error: 'voiceId is required' }, { status: 400 })
    }
    if (!jobId) {
      return NextResponse.json({ error: 'jobId is required' }, { status: 400 })
    }

    const ttsResponse = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/with-timestamps`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'xi-api-key': apiKey,
      },
      body: JSON.stringify({
        text: poem,
        model_id: ELEVENLABS_TTS_MODEL_ID,
        output_format: 'mp3_44100_128',
        voice_settings: {
          stability: 0.45,
          similarity_boost: 0.8,
        },
      }),
    })

    if (!ttsResponse.ok) {
      const ttsResponseContentType = ttsResponse.headers.get('content-type') || ''
      let details = `ElevenLabs request failed with status ${ttsResponse.status}`

      if (ttsResponseContentType.includes('application/json')) {
        const errorBody = await ttsResponse.json()
        if (typeof errorBody?.detail?.message === 'string') {
          details = errorBody.detail.message
        } else if (typeof errorBody?.message === 'string') {
          details = errorBody.message
        }
      } else {
        const textBody = await ttsResponse.text()
        if (textBody) {
          details = textBody.slice(0, 300)
        }
      }

      return NextResponse.json(
        {
          error: 'Failed to generate poem voiceover with ElevenLabs.',
          details,
        },
        { status: 502 }
      )
    }

    const payload = (await ttsResponse.json()) as {
      audio_base64?: string
      alignment?: ElevenLabsAlignment
      normalized_alignment?: ElevenLabsAlignment
    }

    if (!payload.audio_base64) {
      return NextResponse.json(
        { error: 'ElevenLabs timestamp response did not include audio data.' },
        { status: 502 }
      )
    }

    const audioBuffer = Buffer.from(payload.audio_base64, 'base64')
    if (audioBuffer.length === 0) {
      return NextResponse.json({ error: 'ElevenLabs returned empty MP3 data.' }, { status: 502 })
    }

    const metadata = await parseBuffer(audioBuffer, { mimeType: 'audio/mpeg' })
    const rawDuration = metadata.format.duration
    if (!rawDuration || !Number.isFinite(rawDuration) || rawDuration <= 0) {
      return NextResponse.json(
        { error: 'Failed to derive voice duration from generated MP3.' },
        { status: 502 }
      )
    }

    const voiceDuration = roundUpToTenth(rawDuration)
    const voiceKey = `poem-video/${jobId}/voice.mp3`
    const voiceTimingsKey = `poem-video/${jobId}/timings.json`

    const lineTimings = buildLineTimings(
      poem,
      normalizeAlignment(payload.normalized_alignment) || normalizeAlignment(payload.alignment),
      rawDuration
    )
    const timingsPayload = {
      lineTimings,
      generatedAt: new Date().toISOString(),
      source: lineTimings.length > 0 ? 'elevenlabs-with-timestamps' : 'duration-fallback',
    }

    await uploadVoicemailObject({
      key: voiceKey,
      body: audioBuffer,
      contentType: 'audio/mpeg',
      cacheControl: 'max-age=31536000',
    })
    await uploadVoicemailObject({
      key: voiceTimingsKey,
      body: JSON.stringify(timingsPayload),
      contentType: 'application/json',
      cacheControl: 'max-age=31536000',
    })

    const voiceUrl = await getVoicemailSignedReadUrl(voiceKey, 60 * 60 * 24)

    return NextResponse.json({
      voiceKey,
      voiceDuration,
      voiceUrl,
      voiceTimingsKey,
    })
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Unexpected error while generating poem voiceover.',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
