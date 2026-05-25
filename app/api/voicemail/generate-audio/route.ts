import { NextRequest, NextResponse } from 'next/server'
import { getVoicemailS3Url, uploadVoicemailObject } from '@/lib/voicemailStorage'

interface GenerateVoicemailAudioRequest {
  script?: string
  voiceId?: string
}

const ELEVENLABS_MODEL_ID = 'eleven_turbo_v2_5'

interface ElevenLabsTimestampResponse {
  audio_base64?: string
  alignment?: {
    character_end_times_seconds?: number[]
  }
  normalized_alignment?: {
    character_end_times_seconds?: number[]
  }
}

function deriveDurationSeconds(payload: ElevenLabsTimestampResponse): number | null {
  const normalizedEnds = payload.normalized_alignment?.character_end_times_seconds || []
  const alignmentEnds = payload.alignment?.character_end_times_seconds || []
  const allEnds = [...normalizedEnds, ...alignmentEnds].filter((value) => Number.isFinite(value) && value >= 0)
  if (allEnds.length === 0) return null
  return Math.max(...allEnds)
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as GenerateVoicemailAudioRequest
    const script = body.script?.trim() || ''
    const voiceId = body.voiceId?.trim() || ''

    if (!script) {
      return NextResponse.json({ error: 'script is required' }, { status: 400 })
    }

    if (!voiceId) {
      return NextResponse.json({ error: 'voiceId is required' }, { status: 400 })
    }

    const apiKey = process.env.ELEVENLABS_API_KEY
    if (!apiKey) {
      return NextResponse.json(
        {
          error: 'ElevenLabs credentials are missing. Set ELEVENLABS_API_KEY to enable audio generation.',
          code: 'ELEVENLABS_NOT_CONFIGURED',
        },
        { status: 503 }
      )
    }

    const elevenlabsResponse = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/with-timestamps`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'xi-api-key': apiKey,
      },
      body: JSON.stringify({
        text: script,
        model_id: ELEVENLABS_MODEL_ID,
        output_format: 'mp3_44100_128',
        voice_settings: {
          stability: 0.45,
          similarity_boost: 0.8,
        },
      }),
    })

    if (!elevenlabsResponse.ok) {
      const contentType = elevenlabsResponse.headers.get('content-type') || ''
      let details = `ElevenLabs request failed with status ${elevenlabsResponse.status}`

      if (contentType.includes('application/json')) {
        const errorBody = await elevenlabsResponse.json()
        if (typeof errorBody?.detail?.message === 'string') {
          details = errorBody.detail.message
        } else if (typeof errorBody?.message === 'string') {
          details = errorBody.message
        }
      } else {
        const textBody = await elevenlabsResponse.text()
        if (textBody) {
          details = textBody.slice(0, 300)
        }
      }

      return NextResponse.json(
        {
          error: 'Failed to generate audio with ElevenLabs.',
          details,
        },
        { status: 502 }
      )
    }

    const data = (await elevenlabsResponse.json()) as ElevenLabsTimestampResponse
    if (!data.audio_base64) {
      return NextResponse.json(
        {
          error: 'ElevenLabs response did not include audio data.',
        },
        { status: 502 }
      )
    }

    const audioBuffer = Buffer.from(data.audio_base64, 'base64')
    const durationSeconds = deriveDurationSeconds(data)

    const jobId = crypto.randomUUID()
    const audioKey = `voicemail-tester/${jobId}/audio.mp3`
    await uploadVoicemailObject({
      key: audioKey,
      body: audioBuffer,
      contentType: 'audio/mpeg',
      cacheControl: 'max-age=31536000',
    })

    const audioUrl = getVoicemailS3Url(audioKey)

    return NextResponse.json({
      audioUrl,
      audioKey,
      durationSeconds,
      voiceId,
      jobId,
    })
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Unexpected error while generating voicemail audio.',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
