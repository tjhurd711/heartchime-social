import Anthropic from '@anthropic-ai/sdk'
import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const maxDuration = 30

type PoemTheme = 'presence' | 'grief-hook' | 'pure-grief'

interface GeneratePoemRequest {
  theme?: PoemTheme
  userPrompt?: string
}

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || '',
})

const THEME_PROMPTS: Record<PoemTheme, string> = {
  presence:
    'Write ONE short remembrance poem for HeartChime (NOT a grief app). Theme: a loved one is still present in everyday moments - songs, seasons, ordinary days. 80-130 words. Free verse, line breaks. Plain language, no melodrama. Return ONLY the poem text, no title, no preamble.',
  'grief-hook':
    'Write ONE short poem that OPENS with raw loss/grief (a vivid specific image of absence) and ENDS on continued presence (the person showing up in everyday things). Bridge the two halves clearly. 80-130 words. Free verse. Return ONLY the poem text.',
  'pure-grief':
    'Write ONE short grief poem about losing a loved one. Raw, specific, image-driven. 80-130 words. Free verse. Return ONLY the poem text.',
}

function stripCodeFences(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed.startsWith('```')) return trimmed
  return trimmed.replace(/^```(?:text|markdown)?\s*/i, '').replace(/\s*```$/, '').trim()
}

function sanitizePoem(raw: string): string {
  const stripped = stripCodeFences(raw).replace(/\r\n/g, '\n').trim()
  if (!stripped) return ''

  const lines = stripped.split('\n')

  while (lines.length > 0 && lines[0].trim().length === 0) {
    lines.shift()
  }

  while (lines.length > 0) {
    const firstLine = lines[0].trim()
    const isTitleLine = /^title\s*:/i.test(firstLine)
    const isPoemLabel = /^(poem|here(?:'| i)?s (?:your )?poem)[:.]?$/i.test(firstLine)
    const isAssistantPreamble = /^(certainly|of course|here you go|for heartchime)[:.]?$/i.test(firstLine)
    if (!isTitleLine && !isPoemLabel && !isAssistantPreamble) break
    lines.shift()
  }

  return lines.join('\n').trim()
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as GeneratePoemRequest
    const theme = body.theme
    const userPrompt = body.userPrompt?.trim() || ''

    if (!theme || !(theme in THEME_PROMPTS)) {
      return NextResponse.json(
        { error: "theme is required and must be one of: 'presence' | 'grief-hook' | 'pure-grief'" },
        { status: 400 }
      )
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json(
        { error: 'Poem generator is not configured. Set ANTHROPIC_API_KEY.' },
        { status: 503 }
      )
    }

    const systemPrompt = `${THEME_PROMPTS[theme]}${
      userPrompt ? `\n\nSpecifically about: ${userPrompt}` : ''
    }`

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 320,
      temperature: 0.8,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: 'Write the poem now.',
        },
      ],
    })

    const textContent = response.content.find((chunk) => chunk.type === 'text')
    if (!textContent || textContent.type !== 'text') {
      return NextResponse.json({ error: 'No poem text returned from generator.' }, { status: 502 })
    }

    const poem = sanitizePoem(textContent.text)
    if (!poem) {
      return NextResponse.json(
        {
          error: 'Failed to parse generated poem text.',
          details: 'Model response did not contain poem content after cleanup',
        },
        { status: 502 }
      )
    }

    return NextResponse.json({ poem })
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Failed to generate poem text.',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
