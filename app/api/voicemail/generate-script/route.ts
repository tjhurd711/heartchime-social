import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const maxDuration = 30

type ScriptTone = 'Warm' | 'Funny' | 'Bittersweet' | 'Comforting' | 'Casual'
type ScriptLength = 'short_10_15' | 'medium_20_30'

interface GenerateVoicemailScriptRequest {
  relationship?: string
  tone?: ScriptTone
  occasion?: string
  memoryDetails?: string
  length?: ScriptLength
}

const VALID_TONES: ScriptTone[] = ['Warm', 'Funny', 'Bittersweet', 'Comforting', 'Casual']
const VALID_LENGTHS: ScriptLength[] = ['short_10_15', 'medium_20_30']

function buildPrompt({
  relationship,
  tone,
  occasion,
  memoryDetails,
  length,
}: {
  relationship: string
  tone: ScriptTone
  occasion: string
  memoryDetails: string
  length: ScriptLength
}) {
  const targetLength =
    length === 'short_10_15'
      ? '10-15 seconds (about 1-2 short sentences, ~25-45 words)'
      : '20-30 seconds (about 2-4 short sentences, ~45-80 words)'

  return `Write ONE realistic voicemail script for an internal prototype.

Voice/persona:
- Relationship: ${relationship}
- Tone: ${tone}
- Occasion: ${occasion}
- Memory details to include: ${memoryDetails || 'None provided'}
- Length target: ${targetLength}

Required style:
- Sound like an actual spoken voicemail someone would leave
- Intimate, casual, short, natural
- Include one small specific detail if possible
- Include one gentle emotional beat
- End with a simple sign-off
- Plain spoken language, no dramatic writing

Strictly avoid these phrases unless explicitly needed:
- "I hope this message finds you well"
- "cherished memories"
- "forever in our hearts"
- "your legacy lives on"
- "during this difficult time"
- "I am always with you"

Do NOT output:
- Any title
- Any bullet points
- Any analysis or explanation
- Multiple options

Return only the voicemail script text.`
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as GenerateVoicemailScriptRequest
    const relationship = body.relationship?.trim() || 'Mom'
    const tone = VALID_TONES.includes(body.tone as ScriptTone) ? (body.tone as ScriptTone) : 'Warm'
    const occasion = body.occasion?.trim() || 'just thinking of you'
    const memoryDetails = body.memoryDetails?.trim() || ''
    const length = VALID_LENGTHS.includes(body.length as ScriptLength) ? (body.length as ScriptLength) : 'short_10_15'

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      return NextResponse.json(
        { error: 'Script generator is not configured. Set ANTHROPIC_API_KEY.' },
        { status: 503 }
      )
    }

    const prompt = buildPrompt({
      relationship,
      tone,
      occasion,
      memoryDetails,
      length,
    })

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: length === 'short_10_15' ? 120 : 220,
        temperature: 0.8,
        messages: [{ role: 'user', content: prompt }],
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      return NextResponse.json(
        {
          error: 'Failed to generate voicemail script.',
          details: `Anthropic API error (${response.status}): ${errorText.slice(0, 300)}`,
        },
        { status: 502 }
      )
    }

    const data = await response.json()
    const script = data?.content?.[0]?.text?.trim()

    if (!script) {
      return NextResponse.json(
        {
          error: 'Script generation returned empty content.',
        },
        { status: 502 }
      )
    }

    return NextResponse.json({ script })
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Unexpected error while generating voicemail script.',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
