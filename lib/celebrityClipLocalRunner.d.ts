export function resolveLocalCookiesPath(): string | null

export function sanitizeCookiesPathInput(raw: unknown): string | null

export function isYouTubeRateLimitError(text: unknown): boolean

export const YOUTUBE_RATE_LIMIT_ERROR: string

export function runLocalCelebrityClipFetch(celebrityName: string): {
  ok: boolean
  result?: Record<string, unknown>
  error?: string
  stderr?: string
  cookiesPath?: string
  rateLimited?: boolean
}

export function runLocalCelebrityClipReplace(params: Record<string, unknown>): {
  ok: boolean
  result?: Record<string, unknown>
  error?: string
  stderr?: string
  cookiesPath?: string
  rateLimited?: boolean
}

export function runLocalCelebrityClipAdd(params: Record<string, unknown>): {
  ok: boolean
  result?: Record<string, unknown>
  error?: string
  stderr?: string
  cookiesPath?: string
  rateLimited?: boolean
}
