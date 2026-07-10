import { spawnSync } from 'child_process'
import { existsSync, readFileSync } from 'fs'
import { homedir, hostname } from 'os'
import { join } from 'path'
import { createRequire } from 'module'
import { fileURLToPath } from 'url'
import { dirname } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

/**
 * Shared local yt-dlp runner used by Next local-fetch APIs and fetch-worker.mjs.
 * Does not talk to Supabase fetch_jobs — callers own job lifecycle.
 */

export function resolveLocalCookiesPath() {
  const override = process.env.YOUTUBE_COOKIES_FILE?.trim()
  if (override && existsSync(override)) return override

  const candidates = [
    join(homedir(), 'Downloads', 'www.youtube.com_cookies.txt'),
    join(homedir(), 'Downloads', 'youtube-cookies.txt'),
    join(homedir(), 'youtube-cookies.txt'),
  ]
  return candidates.find((path) => existsSync(path)) ?? null
}

function isLoggedInCookieExport(text) {
  const markers = [
    'LOGIN_INFO',
    '\tSID\t',
    '\t__Secure-1PSID\t',
    '\t__Secure-3PSID\t',
    '\t__Secure-1PSIDCC\t',
    '\t__Secure-3PSIDCC\t',
  ]
  return markers.some((marker) => text.includes(marker))
}

function validateCookiesFile(path) {
  const text = readFileSync(path, 'utf8')
  if (!text.includes('youtube.com')) {
    return 'Cookies file has no youtube.com entries. Export while signed into YouTube.'
  }
  if (!isLoggedInCookieExport(text)) {
    return (
      'Cookies look logged-out. On youtube.com (signed in), export with the Get cookies.txt LOCALLY ' +
      'Chrome extension to Downloads/youtube-cookies.txt, or close Chrome and run export-youtube-cookies.ps1.'
    )
  }
  return null
}

function buildChildEnv(cookiesPath) {
  const env = { ...process.env }
  delete env.AWS_PROFILE
  delete env.AWS_DEFAULT_PROFILE
  delete env.YOUTUBE_COOKIES_S3_KEY
  delete env.YOUTUBE_COOKIES_S3_BUCKET
  env.YOUTUBE_COOKIES_FILE = cookiesPath
  env.YOUTUBE_SEARCH_BACKEND = 'ytdlp'
  env.CELEBRITY_CLIPS_BUCKET = env.S3_BUCKET_NAME || 'heartbeat-photos-prod'

  if (env.AWS_S3_UPLOAD_ACCESS_KEY_ID && env.AWS_S3_UPLOAD_SECRET_ACCESS_KEY) {
    env.AWS_ACCESS_KEY_ID = env.AWS_S3_UPLOAD_ACCESS_KEY_ID
    env.AWS_SECRET_ACCESS_KEY = env.AWS_S3_UPLOAD_SECRET_ACCESS_KEY
  }

  if (!env.AWS_REGION) env.AWS_REGION = 'us-east-2'
  return env
}

function parseHandlerStdout(stdout) {
  const sentinel = '__HEARTCHIME_JSON__'
  const parts = stdout.split(sentinel)
  if (parts.length < 2 || !parts[parts.length - 1]?.trim()) {
    throw new Error('missing __HEARTCHIME_JSON__ sentinel')
  }
  return JSON.parse(parts[parts.length - 1].trim())
}

function resolveHandlerDir() {
  const override = process.env.CELEBRITY_CLIPS_HANDLER_DIR?.trim()
  if (override) return override

  // Prefer sibling repo when cwd is heartchime-social.
  const fromCwd = join(process.cwd(), '..', 'heartbeat_mobileapp', 'lambdas', 'celebrity_clips')
  if (existsSync(join(fromCwd, 'handler.py'))) return fromCwd

  // When imported from lib/, walk up to workspace root.
  const fromLib = join(__dirname, '..', '..', 'heartbeat_mobileapp', 'lambdas', 'celebrity_clips')
  if (existsSync(join(fromLib, 'handler.py'))) return fromLib

  return fromCwd
}

function runHandlerScript(handlerArgs) {
  const cookiesPath = resolveLocalCookiesPath()
  if (!cookiesPath) {
    return {
      ok: false,
      error:
        'No cookies file found. Save youtube-cookies.txt to Downloads (Chrome extension or scripts/export-youtube-cookies.ps1).',
    }
  }

  const cookieError = validateCookiesFile(cookiesPath)
  if (cookieError) {
    return { ok: false, error: cookieError, cookiesPath }
  }

  const pip = spawnSync('python', ['-m', 'pip', 'install', '-q', '-U', 'yt-dlp[default]'], {
    encoding: 'utf-8',
  })
  if (pip.status !== 0) {
    console.warn('pip install yt-dlp[default] warning:', (pip.stderr || '').slice(0, 200))
  }

  const handlerDir = resolveHandlerDir()
  if (!existsSync(join(handlerDir, 'handler.py'))) {
    return {
      ok: false,
      error: `handler.py not found at ${handlerDir}. Set CELEBRITY_CLIPS_HANDLER_DIR or run from heartchime-social.`,
    }
  }

  const child = spawnSync('python', handlerArgs, {
    cwd: handlerDir,
    env: buildChildEnv(cookiesPath),
    encoding: 'utf-8',
    timeout: 10 * 60 * 1000,
    maxBuffer: 16 * 1024 * 1024,
  })

  const stderr = (child.stderr || '').trim()
  const stdout = (child.stdout || '').trim()

  if (child.error) {
    return { ok: false, error: child.error.message, stderr, cookiesPath }
  }

  if (child.status !== 0) {
    return {
      ok: false,
      error: stderr || stdout || `Local fetch exited with code ${child.status ?? 'unknown'}`,
      stderr,
      cookiesPath,
    }
  }

  try {
    const result = parseHandlerStdout(stdout)
    return { ok: true, result, cookiesPath }
  } catch {
    return {
      ok: false,
      error: 'Local fetch finished but returned invalid JSON.',
      stderr: stderr || stdout,
      cookiesPath,
    }
  }
}

export function runLocalCelebrityClipFetch(celebrityName) {
  const outcome = runHandlerScript(['handler.py', celebrityName])
  if (!outcome.ok || !outcome.result) {
    return outcome
  }

  const readyCount = Number(outcome.result.readyCount ?? 0)
  if (readyCount === 0) {
    const clips = Array.isArray(outcome.result.clips) ? outcome.result.clips : []
    const firstError = clips.find((clip) => clip && typeof clip === 'object' && clip.error)?.error
    return {
      ok: false,
      result: outcome.result,
      error: outcome.result.error || firstError || 'All clip downloads failed.',
      cookiesPath: outcome.cookiesPath,
    }
  }

  return outcome
}

export function runLocalCelebrityClipReplace(params) {
  const args = [
    'handler.py',
    params.celebrityName,
    '--replace',
    '--phase',
    params.phase,
    '--exclude',
    (params.excludeVideoIds || []).join(','),
    '--replace-video-id',
    params.replaceVideoId,
    '--query-index',
    String(params.queryIndex ?? 0),
    '--max-candidates',
    String(params.maxCandidates ?? 10),
  ]
  if (params.candidatesOnly) {
    args.push('--candidates-only')
  }
  if (params.manualVideoId?.trim()) {
    args.push('--manual-video-id', params.manualVideoId.trim())
  } else if (params.pickVideoId?.trim()) {
    args.push('--pick-video-id', params.pickVideoId.trim())
  }
  if (params.downloadStart != null && Number.isFinite(params.downloadStart)) {
    args.push('--download-start', String(params.downloadStart))
  }
  if (params.downloadDuration != null && Number.isFinite(params.downloadDuration)) {
    args.push('--download-duration', String(params.downloadDuration))
  }

  const outcome = runHandlerScript(args)
  if (!outcome.ok || !outcome.result) {
    return outcome
  }

  if (params.candidatesOnly) {
    const candidates = Array.isArray(outcome.result.candidates) ? outcome.result.candidates : []
    if (candidates.length === 0) {
      return {
        ok: false,
        result: outcome.result,
        error:
          outcome.result.error ||
          'No more alternative YouTube videos found (all results excluded or empty)',
        cookiesPath: outcome.cookiesPath,
      }
    }
    return outcome
  }

  const readyCount = Number(outcome.result.readyCount ?? 0)
  const clip = outcome.result.clip
  if (readyCount === 0 || clip?.status !== 'ready') {
    return {
      ok: false,
      result: outcome.result,
      error:
        outcome.result.error ||
        clip?.error ||
        'Replace failed — no ready clip downloaded.',
      cookiesPath: outcome.cookiesPath,
    }
  }

  return outcome
}

export function runLocalCelebrityClipAdd(params) {
  const args = [
    'handler.py',
    params.celebrityName,
    '--add',
    '--phase',
    'clip',
    '--exclude',
    (params.excludeVideoIds || []).join(','),
    '--query-index',
    String(params.queryIndex ?? 0),
    '--max-candidates',
    String(params.maxCandidates ?? 10),
  ]
  if (params.candidatesOnly) {
    args.push('--candidates-only')
  }
  if (params.manualVideoId?.trim()) {
    args.push('--manual-video-id', params.manualVideoId.trim())
  } else if (params.pickVideoId?.trim()) {
    args.push('--pick-video-id', params.pickVideoId.trim())
  }
  if (params.downloadStart != null && Number.isFinite(params.downloadStart)) {
    args.push('--download-start', String(params.downloadStart))
  }
  if (params.downloadDuration != null && Number.isFinite(params.downloadDuration)) {
    args.push('--download-duration', String(params.downloadDuration))
  }

  const outcome = runHandlerScript(args)
  if (!outcome.ok || !outcome.result) {
    return outcome
  }

  if (params.candidatesOnly) {
    const candidates = Array.isArray(outcome.result.candidates) ? outcome.result.candidates : []
    if (candidates.length === 0) {
      return {
        ok: false,
        result: outcome.result,
        error:
          outcome.result.error ||
          'No more alternative YouTube videos found (all results excluded or empty)',
        cookiesPath: outcome.cookiesPath,
      }
    }
    return outcome
  }

  const readyCount = Number(outcome.result.readyCount ?? 0)
  const clip = outcome.result.clip
  if (readyCount === 0 || clip?.status !== 'ready') {
    return {
      ok: false,
      result: outcome.result,
      error:
        outcome.result.error ||
        clip?.error ||
        'Add clip failed — no ready clip downloaded.',
      cookiesPath: outcome.cookiesPath,
    }
  }

  return outcome
}

/** Execute a fetch_jobs.params payload (fetch | replace | add). */
export function runFetchJobParams(params) {
  const mode = String(params?.mode || 'fetch').toLowerCase()
  const celebrityName = String(params?.celebrityName || '').trim()
  if (!celebrityName) {
    return { ok: false, error: 'params.celebrityName is required' }
  }

  if (mode === 'fetch') {
    return runLocalCelebrityClipFetch(celebrityName)
  }

  if (mode === 'replace') {
    return runLocalCelebrityClipReplace({
      celebrityName,
      phase: params.phase === 'intro' ? 'intro' : 'clip',
      excludeVideoIds: Array.isArray(params.excludeVideoIds) ? params.excludeVideoIds : [],
      replaceVideoId: String(params.replaceVideoId || ''),
      queryIndex: params.queryIndex,
      candidatesOnly: Boolean(params.candidatesOnly),
      pickVideoId: params.pickVideoId,
      manualVideoId: params.manualVideoId,
      maxCandidates: params.maxCandidates,
      downloadStart: params.downloadStart ?? params.downloadWindow?.start,
      downloadDuration: params.downloadDuration ?? params.downloadWindow?.duration,
    })
  }

  if (mode === 'add') {
    return runLocalCelebrityClipAdd({
      celebrityName,
      excludeVideoIds: Array.isArray(params.excludeVideoIds) ? params.excludeVideoIds : [],
      queryIndex: params.queryIndex,
      candidatesOnly: Boolean(params.candidatesOnly),
      pickVideoId: params.pickVideoId,
      manualVideoId: params.manualVideoId,
      maxCandidates: params.maxCandidates,
      downloadStart: params.downloadStart ?? params.downloadWindow?.start,
      downloadDuration: params.downloadDuration ?? params.downloadWindow?.duration,
    })
  }

  return { ok: false, error: `Unsupported fetch job mode: ${mode}` }
}

export function workerHostname() {
  try {
    return hostname() || 'unknown-host'
  } catch {
    return 'unknown-host'
  }
}

// Silence unused import if bundlers tree-shake createRequire oddly
void createRequire
