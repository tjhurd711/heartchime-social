import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

export const runtime = 'nodejs'
export const maxDuration = 30

type ThoughtProvider = 'auto' | 'claude' | 'chatgpt'

interface GenerateMemoryThoughtRequest {
  provider?: ThoughtProvider
}

interface ThoughtResult {
  thought: string
  provider: Exclude<ThoughtProvider, 'auto'>
}

const MIN_WORDS = 7
const MAX_WORDS = 25

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || '',
})

function normalizeProvider(input: unknown): ThoughtProvider {
  if (input === 'claude') return 'claude'
  if (input === 'chatgpt') return 'chatgpt'
  return 'auto'
}

function countWords(input: string): number {
  return input.trim().split(/\s+/).filter(Boolean).length
}

function cleanThought(input: string): string {
  return input
    .trim()
    .replace(/^["'`“”]+|["'`“”]+$/g, '')
    .replace(/\s+/g, ' ')
}

function parseThoughtFromUnknown(raw: string): string | null {
  const trimmed = raw.trim()
  const cleaned = trimmed.startsWith('```')
    ? trimmed.replace(/^```(?:json|JSON)?\s*/, '').replace(/\s*```$/, '').trim()
    : trimmed

  try {
    const parsed = JSON.parse(cleaned) as { thought?: unknown }
    if (typeof parsed?.thought === 'string') {
      return cleanThought(parsed.thought)
    }
  } catch {
    // Fall back to plain-text extraction below.
  }

  const firstLine = cleaned.split('\n').find((line) => line.trim().length > 0)
  return firstLine ? cleanThought(firstLine) : null
}

function buildPrompt(): string {
  return `Write one short emotional remembrance thought about missing someone who has passed.

Hard constraints:
- Exactly one thought, not a list.
- Between ${MIN_WORDS} and ${MAX_WORDS} words.
- Tone: sweet, tender, heartfelt, grief-aware.
- No hashtags.
- No author attribution.
- May include at most one subtle emoji.

Return ONLY valid JSON:
{"thought":"..."}`
}

async function generateWithClaude(): Promise<ThoughtResult> {
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 180,
    temperature: 0.95,
    messages: [{ role: 'user', content: buildPrompt() }],
  })

  const text = response.content.find((chunk) => chunk.type === 'text')
  if (!text || text.type !== 'text') {
    throw new Error('Claude returned no text content.')
  }

  const thought = parseThoughtFromUnknown(text.text)
  if (!thought) {
    throw new Error('Failed to parse Claude thought response.')
  }

  return { thought, provider: 'claude' }
}

async function generateWithChatGpt(): Promise<ThoughtResult> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY not set')
  }

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: process.env.MEMORY_THOUGHT_OPENAI_MODEL || 'gpt-4.1-mini',
      temperature: 0.95,
      max_tokens: 180,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'user',
          content: buildPrompt(),
        },
      ],
    }),
  })

  const payload = await response.json()
  if (!response.ok) {
    const message =
      payload?.error?.message ||
      payload?.message ||
      `OpenAI request failed with status ${response.status}`
    throw new Error(message)
  }

  const rawText = payload?.choices?.[0]?.message?.content
  if (typeof rawText !== 'string' || !rawText.trim()) {
    throw new Error('ChatGPT returned no text content.')
  }

  const thought = parseThoughtFromUnknown(rawText)
  if (!thought) {
    throw new Error('Failed to parse ChatGPT thought response.')
  }

  return { thought, provider: 'chatgpt' }
}

function validateThoughtLength(thought: string): string | null {
  const words = countWords(thought)
  if (words < MIN_WORDS || words > MAX_WORDS) {
    return `Thought must be between ${MIN_WORDS} and ${MAX_WORDS} words (got ${words}).`
  }
  return null
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as GenerateMemoryThoughtRequest
    const provider = normalizeProvider(body.provider)

    if (!process.env.ANTHROPIC_API_KEY && !process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        {
          error:
            'Memory thought generator is not configured. Set ANTHROPIC_API_KEY or OPENAI_API_KEY.',
        },
        { status: 503 }
      )
    }

    let result: ThoughtResult
    if (provider === 'claude') {
      if (!process.env.ANTHROPIC_API_KEY) {
        return NextResponse.json(
          { error: 'Claude generator is not configured. Set ANTHROPIC_API_KEY.' },
          { status: 503 }
        )
      }
      result = await generateWithClaude()
    } else if (provider === 'chatgpt') {
      if (!process.env.OPENAI_API_KEY) {
        return NextResponse.json(
          { error: 'ChatGPT generator is not configured. Set OPENAI_API_KEY.' },
          { status: 503 }
        )
      }
      result = await generateWithChatGpt()
    } else {
      if (process.env.ANTHROPIC_API_KEY) {
        result = await generateWithClaude()
      } else {
        result = await generateWithChatGpt()
      }
    }

    const thought = cleanThought(result.thought)
    const validationError = validateThoughtLength(thought)
    if (validationError) {
      return NextResponse.json(
        {
          error: 'Generated thought failed length constraints.',
          details: validationError,
          thought,
          provider: result.provider,
        },
        { status: 502 }
      )
    }

    return NextResponse.json({
      thought,
      provider: result.provider,
      words: countWords(thought),
    })
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Failed to generate memory thought',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
