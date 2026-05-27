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

const ELEVENLABS_TTS_MODEL_ID = 'eleven_turbo_v2_5'

function roundUpToTenth(value: number): number {
  return Math.ceil(value * 10) / 10
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

    const ttsResponse = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'audio/mpeg',
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

    const audioBuffer = Buffer.from(await ttsResponse.arrayBuffer())
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

    await uploadVoicemailObject({
      key: voiceKey,
      body: audioBuffer,
      contentType: 'audio/mpeg',
      cacheControl: 'max-age=31536000',
    })

    const voiceUrl = await getVoicemailSignedReadUrl(voiceKey, 60 * 60 * 24)

    return NextResponse.json({
      voiceKey,
      voiceDuration,
      voiceUrl,
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
