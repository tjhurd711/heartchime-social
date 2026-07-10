/**
 * Local / worker clip fetch entrypoints.
 * Implementation lives in celebrityClipLocalRunner.mjs (shared with fetch-worker.mjs).
 */
import {
  resolveLocalCookiesPath,
  runLocalCelebrityClipFetch as runFetch,
  runLocalCelebrityClipReplace as runReplace,
  runLocalCelebrityClipAdd as runAdd,
  runFetchJobParams,
  workerHostname,
} from './celebrityClipLocalRunner.mjs'

export function isLocalClipFetchEnabled(): boolean {
  return process.env.NODE_ENV !== 'production' || process.env.ALLOW_LOCAL_CLIP_FETCH === 'true'
}

export { resolveLocalCookiesPath, runFetchJobParams, workerHostname }

export interface LocalClipFetchOutcome {
  ok: boolean
  result?: Record<string, unknown>
  error?: string
  stderr?: string
  cookiesPath?: string
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
