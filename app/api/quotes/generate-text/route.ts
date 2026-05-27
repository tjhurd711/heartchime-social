import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

export const runtime = 'nodejs'
export const maxDuration = 30

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || '',
})

interface GenerateQuoteTextRequest {
  count?: number
}

const MIN_QUOTES = 1
const MAX_QUOTES = 10
const DEFAULT_COUNT = 5

function resolveCount(input: unknown): number {
  const parsed = Number(input)
  if (!Number.isFinite(parsed)) return DEFAULT_COUNT
  return Math.min(MAX_QUOTES, Math.max(MIN_QUOTES, Math.floor(parsed)))
}

function stripCodeFences(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed.startsWith('```')) {
    return trimmed
  }
  return trimmed
    .replace(/^```(?:json|JSON)?\s*/, '')
    .replace(/\s*```$/, '')
    .trim()
}

function normalizeQuotesFromUnknown(parsed: unknown): string[] | null {
  const sourceArray = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === 'object' && Array.isArray((parsed as { quotes?: unknown }).quotes)
      ? (parsed as { quotes: unknown[] }).quotes
      : null

  if (!sourceArray) return null

  const quotes = sourceArray
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean)

  return quotes.length > 0 ? quotes.slice(0, MAX_QUOTES) : null
}

function extractFirstJsonArraySlice(input: string): string | null {
  let start = -1
  let depth = 0
  let inString = false
  let escaped = false

  for (let idx = 0; idx < input.length; idx += 1) {
    const char = input[idx]

    if (inString) {
      if (escaped) {
        escaped = false
      } else if (char === '\\') {
        escaped = true
      } else if (char === '"') {
        inString = false
      }
      continue
    }

    if (char === '"') {
      inString = true
      continue
    }

    if (char === '[') {
      if (depth === 0) start = idx
      depth += 1
      continue
    }

    if (char === ']' && depth > 0) {
      depth -= 1
      if (depth === 0 && start >= 0) {
        return input.slice(start, idx + 1)
      }
    }
  }

  return null
}

function limitQuoteWords(quote: string, maxWords: number = 20): string {
  const words = quote.split(/\s+/).filter(Boolean)
  if (words.length <= maxWords) return quote
  return words.slice(0, maxWords).join(' ')
}

function normalizePlainQuote(candidate: string): string {
  return limitQuoteWords(
    candidate
      .replace(/^[-*•\d.)\s]+/, '')
      .replace(/^["'`“”]+|["'`“”]+$/g, '')
      .replace(/\s+/g, ' ')
      .trim()
  )
}

function extractQuotesFromPlainText(raw: string): string[] {
  const stripped = stripCodeFences(raw)
  const lineCandidates = stripped
    .split('\n')
    .map((line) => normalizePlainQuote(line))
    .filter((line) => line.length > 0)

  const maybeSentences =
    lineCandidates.length <= 1
      ? stripped
          .split(/(?<=[.!?])\s+(?=[A-Z"'`“”])/)
          .map((part) => normalizePlainQuote(part))
          .filter((part) => part.length > 0)
      : lineCandidates

  const deduped = Array.from(new Set(maybeSentences))
  return deduped.filter((quote) => quote.length > 0 && quote.length <= 220).slice(0, MAX_QUOTES)
}

function parseQuotesArray(raw: string): string[] | null {
  const candidates: string[] = []
  const trimmedRaw = raw.trim()
  const stripped = stripCodeFences(raw)
  if (stripped) candidates.push(stripped)
  if (trimmedRaw && trimmedRaw !== stripped) candidates.push(trimmedRaw)

  const fencedPattern = /```(?:json|JSON)?\s*([\s\S]*?)```/g
  let fencedMatch: RegExpExecArray | null = fencedPattern.exec(raw)
  while (fencedMatch) {
    const block = fencedMatch[1]?.trim()
    if (block) candidates.push(block)
    fencedMatch = fencedPattern.exec(raw)
  }

  for (const candidate of candidates) {
    try {
      const directParsed = JSON.parse(candidate)
      const directQuotes = normalizeQuotesFromUnknown(directParsed)
      if (directQuotes) return directQuotes
    } catch {
      // Continue to array-slice fallback for this candidate.
    }

    const arraySlice = extractFirstJsonArraySlice(candidate)
    if (arraySlice) {
      try {
        const parsedSlice = JSON.parse(arraySlice)
        const slicedQuotes = normalizeQuotesFromUnknown(parsedSlice)
        if (slicedQuotes) return slicedQuotes
      } catch {
        // Try next candidate.
      }
    }
  }

  return null
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as GenerateQuoteTextRequest
    const count = resolveCount(body.count)

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json(
        { error: 'Quote text generator is not configured. Set ANTHROPIC_API_KEY.' },
        { status: 503 }
      )
    }

    const prompt = `Write ${count} short remembrance quotes for a memorial/presence platform about rememebring somerone after they have passed, about grief, about death anything in regards to that. Make sure that they are in quotes too. Max 30 words each. Return ONLY a JSON array of strings, no preamble, no markdown.`

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 900,
      temperature: 0.9,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    })

    const textContent = response.content.find((chunk) => chunk.type === 'text')
    if (!textContent || textContent.type !== 'text') {
      return NextResponse.json({ error: 'No text returned from quote generator.' }, { status: 502 })
    }

    const parsedQuotes = parseQuotesArray(textContent.text)
    const fallbackQuotes = parsedQuotes ?? extractQuotesFromPlainText(textContent.text)
    const quotes = fallbackQuotes.slice(0, count)

    if (quotes.length === 0) {
      return NextResponse.json(
        {
          error: 'Failed to parse quote generator response.',
          details: 'Model response did not include parseable quote content',
        },
        { status: 502 }
      )
    }

    return NextResponse.json({ quotes })
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Failed to generate quote text',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
