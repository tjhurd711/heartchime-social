export function resolveLocalCookiesPath(): string | null

export function workerHostname(): string

export function runLocalCelebrityClipFetch(celebrityName: string): {
  ok: boolean
  result?: Record<string, unknown>
  error?: string
  stderr?: string
  cookiesPath?: string
}

export function runLocalCelebrityClipReplace(params: Record<string, unknown>): {
  ok: boolean
  result?: Record<string, unknown>
  error?: string
  stderr?: string
  cookiesPath?: string
}

export function runLocalCelebrityClipAdd(params: Record<string, unknown>): {
  ok: boolean
  result?: Record<string, unknown>
  error?: string
  stderr?: string
  cookiesPath?: string
}

export function runFetchJobParams(params: Record<string, unknown>): {
  ok: boolean
  result?: Record<string, unknown>
  error?: string
  stderr?: string
  cookiesPath?: string
}
