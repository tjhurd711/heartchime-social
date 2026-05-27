import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

const TARGET_VOICE_IDS = [
  'uIZsnBL0YK1S5j69bAih',
  'NDTYOmYEjbDIVCKB35i3',
  'rCuVrCHOUMY3OwyJBJym',
  'prqcFePeALHihEWRj5ll',
  '5u41aNhyCU6hXOcjPPv0',
  'aAsWcN5jdLdiYG7Hq0YL',
  'aIu5oHglU5AHNc2x0AZu',
  '0mLOQqwA3kovxF1ID7z6',
  'wGcFBfKz5yUQqhqr0mVy',
  'q1Hhtkt94vkD6q7p50hW',
  'oHwIxN4uGlD1D3IKyWJZ',
  'tRhabdS7JjlQ0lVEImuM',
  'w25dAwxibNES1hcDBvXx',
  '1G3Huw0biNTSkYJGIuKP',
] as const

const VOICE_NAME_OVERRIDES: Record<string, string> = {
  uIZsnBL0YK1S5j69bAih: 'Poem Voice',
  NDTYOmYEjbDIVCKB35i3: 'Poem Voice 2',
}

interface ElevenLabsVoice {
  voice_id?: string
  name?: string
  preview_url?: string | null
}

async function fetchVoiceById(apiKey: string, voiceId: string): Promise<ElevenLabsVoice | null> {
  const response = await fetch(`https://api.elevenlabs.io/v1/voices/${voiceId}`, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      'xi-api-key': apiKey,
    },
    cache: 'no-store',
  })

  if (!response.ok) {
    return null
  }

  const data = (await response.json()) as ElevenLabsVoice
  return data
}

export async function GET() {
  try {
    const apiKey = process.env.ELEVENLABS_API_KEY
    if (!apiKey) {
      return NextResponse.json(
        {
          error: 'ElevenLabs credentials are missing. Set ELEVENLABS_API_KEY to fetch voice metadata.',
          code: 'ELEVENLABS_NOT_CONFIGURED',
        },
        { status: 503 }
      )
    }

    const listResponse = await fetch('https://api.elevenlabs.io/v1/voices', {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'xi-api-key': apiKey,
      },
      cache: 'no-store',
    })

    let listVoices: ElevenLabsVoice[] = []
    if (listResponse.ok) {
      const listData = (await listResponse.json()) as { voices?: ElevenLabsVoice[] }
      listVoices = Array.isArray(listData.voices) ? listData.voices : []
    }

    const listVoicesById = new Map(
      listVoices
        .filter((voice) => typeof voice.voice_id === 'string' && voice.voice_id)
        .map((voice) => [voice.voice_id as string, voice])
    )

    const unresolvedIds = TARGET_VOICE_IDS.filter((voiceId) => !listVoicesById.has(voiceId))
    const fallbackVoices = await Promise.all(unresolvedIds.map((voiceId) => fetchVoiceById(apiKey, voiceId)))
    unresolvedIds.forEach((voiceId, index) => {
      const fallbackVoice = fallbackVoices[index]
      if (fallbackVoice?.voice_id) {
        listVoicesById.set(voiceId, fallbackVoice)
      }
    })

    const voices = TARGET_VOICE_IDS.map((voiceId) => {
      const voice = listVoicesById.get(voiceId)
      return {
        voiceId,
        name:
          VOICE_NAME_OVERRIDES[voiceId] ||
          voice?.name?.trim() ||
          `Voice ${voiceId.slice(0, 6)}`,
        preview_url: voice?.preview_url || null,
      }
    })

    return NextResponse.json({
      voices,
    })
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Failed to fetch voice metadata from ElevenLabs.',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
