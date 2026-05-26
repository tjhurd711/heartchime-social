import { NextRequest, NextResponse } from 'next/server'
import { getVoicemailS3Url, getVoicemailSignedReadUrl, uploadVoicemailObject } from '@/lib/voicemailStorage'

interface GenerateVoicemailAudioRequest {
  mode?: 'text_to_speech' | 'speech_to_speech'
  script?: string
  voiceId?: string
}

const ELEVENLABS_TTS_MODEL_ID = 'eleven_turbo_v2_5'
const ELEVENLABS_STS_MODEL_ID = 'eleven_english_sts_v2'

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

    let mode: 'text_to_speech' | 'speech_to_speech' = 'text_to_speech'
    let voiceId = ''
    let audioBuffer: Buffer | null = null
    let durationSeconds: number | null = null
    const contentType = request.headers.get('content-type') || ''

    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData()
      const modeInput = (formData.get('mode')?.toString().trim() || '').toLowerCase()
      mode = modeInput === 'speech_to_speech' ? 'speech_to_speech' : 'text_to_speech'
      voiceId = formData.get('voiceId')?.toString().trim() || ''

      if (!voiceId) {
        return NextResponse.json({ error: 'voiceId is required' }, { status: 400 })
      }

      if (mode === 'speech_to_speech') {
        const sourceAudioFile = formData.get('audio')
        if (!(sourceAudioFile instanceof File)) {
          return NextResponse.json({ error: 'audio file is required for speech_to_speech mode' }, { status: 400 })
        }

        const elevenLabsBody = new FormData()
        elevenLabsBody.append('audio', sourceAudioFile, sourceAudioFile.name || 'source-audio.webm')
        elevenLabsBody.append('model_id', ELEVENLABS_STS_MODEL_ID)

        const stsResponse = await fetch(`https://api.elevenlabs.io/v1/speech-to-speech/${voiceId}`, {
          method: 'POST',
          headers: {
            Accept: 'audio/mpeg',
            'xi-api-key': apiKey,
          },
          body: elevenLabsBody,
        })

        if (!stsResponse.ok) {
          const stsResponseContentType = stsResponse.headers.get('content-type') || ''
          let details = `ElevenLabs STS request failed with status ${stsResponse.status}`
          if (stsResponseContentType.includes('application/json')) {
            const errorBody = await stsResponse.json()
            if (typeof errorBody?.detail?.message === 'string') {
              details = errorBody.detail.message
            } else if (typeof errorBody?.message === 'string') {
              details = errorBody.message
            }
          } else {
            const textBody = await stsResponse.text()
            if (textBody) {
              details = textBody.slice(0, 300)
            }
          }

          return NextResponse.json(
            {
              error: 'Failed to generate speech-to-speech audio with ElevenLabs.',
              details,
            },
            { status: 502 }
          )
        }

        const transformedAudio = Buffer.from(await stsResponse.arrayBuffer())
        if (transformedAudio.length === 0) {
          return NextResponse.json({ error: 'ElevenLabs STS returned empty audio data.' }, { status: 502 })
        }

        audioBuffer = transformedAudio
      }
    } else {
      const body = (await request.json()) as GenerateVoicemailAudioRequest
      mode = body.mode === 'speech_to_speech' ? 'speech_to_speech' : 'text_to_speech'
      const script = body.script?.trim() || ''
      voiceId = body.voiceId?.trim() || ''

      if (!voiceId) {
        return NextResponse.json({ error: 'voiceId is required' }, { status: 400 })
      }

      if (mode === 'speech_to_speech') {
        return NextResponse.json(
          { error: 'speech_to_speech mode requires multipart/form-data with an audio file' },
          { status: 400 }
        )
      }

      if (!script) {
        return NextResponse.json({ error: 'script is required' }, { status: 400 })
      }

      const ttsResponse = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/with-timestamps`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'xi-api-key': apiKey,
        },
        body: JSON.stringify({
          text: script,
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
            error: 'Failed to generate audio with ElevenLabs.',
            details,
          },
          { status: 502 }
        )
      }

      const data = (await ttsResponse.json()) as ElevenLabsTimestampResponse
      if (!data.audio_base64) {
        return NextResponse.json(
          {
            error: 'ElevenLabs response did not include audio data.',
          },
          { status: 502 }
        )
      }

      audioBuffer = Buffer.from(data.audio_base64, 'base64')
      durationSeconds = deriveDurationSeconds(data)
    }

    if (!audioBuffer || audioBuffer.length === 0) {
      return NextResponse.json({ error: 'Generated audio data is empty.' }, { status: 502 })
    }

    const jobId = crypto.randomUUID()
    const audioKey = `voicemail-tester/${jobId}/audio.mp3`
    await uploadVoicemailObject({
      key: audioKey,
      body: audioBuffer,
      contentType: 'audio/mpeg',
      cacheControl: 'max-age=31536000',
    })

    const audioUrl = getVoicemailS3Url(audioKey)
    const audioSignedUrl = await getVoicemailSignedReadUrl(audioKey, 60 * 60 * 24)

    return NextResponse.json({
      audioUrl,
      audioSignedUrl,
      audioKey,
      durationSeconds,
      voiceId,
      jobId,
      mode,
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
