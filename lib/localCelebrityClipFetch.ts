/**
 * Local clip fetch entrypoints.
 * Implementation lives in celebrityClipLocalRunner.mjs (shared by local-fetch / replace / add APIs).
 */
import {
  resolveLocalCookiesPath,
  runLocalCelebrityClipFetch as runFetch,
  runLocalCelebrityClipReplace as runReplace,
  runLocalCelebrityClipAdd as runAdd,
} from './celebrityClipLocalRunner.mjs'

export function isLocalClipFetchEnabled(): boolean {
  return process.env.NODE_ENV !== 'production' || process.env.ALLOW_LOCAL_CLIP_FETCH === 'true'
}

export { resolveLocalCookiesPath }

export interface LocalClipFetchOutcome {
  ok: boolean
  result?: Record<string, unknown>
  error?: string
  stderr?: string
  cookiesPath?: string
  rateLimited?: boolean
}

export function runLocalCelebrityClipFetch(celebrityName: string): LocalClipFetchOutcome {
  return runFetch(celebrityName) as LocalClipFetchOutcome
}

export function runLocalCelebrityClipReplace(params: {
  celebrityName: string
  phase: 'intro' | 'clip'
  excludeVideoIds: string[]
  replaceVideoId: string
  queryIndex?: number
  candidatesOnly?: boolean
  pickVideoId?: string
  manualVideoId?: string
  maxCandidates?: number
  downloadStart?: number
  downloadDuration?: number
}): LocalClipFetchOutcome {
  return runReplace(params) as LocalClipFetchOutcome
}

export function runLocalCelebrityClipAdd(params: {
  celebrityName: string
  excludeVideoIds: string[]
  queryIndex?: number
  candidatesOnly?: boolean
  pickVideoId?: string
  manualVideoId?: string
  maxCandidates?: number
  downloadStart?: number
  downloadDuration?: number
}): LocalClipFetchOutcome {
  return runAdd(params) as LocalClipFetchOutcome
}
