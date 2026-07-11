import { spawnSync } from 'child_process'
import { existsSync, readFileSync } from 'fs'
import { homedir } from 'os'
import { isAbsolute, join, normalize, resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

/**
 * Shared local yt-dlp runner used by Next local-fetch / replace / add APIs.
 */

export const YOUTUBE_RATE_LIMIT_ERROR = 'YouTube rate-limited this IP — wait ~1 hour'

/** Strip quotes / markdown-link mangling from a cookies path env value. */
export function sanitizeCookiesPathInput(raw) {
  if (raw == null) return null
  let value = String(raw).trim()
  if (!value) return null

  // Strip wrapping quotes
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1).trim()
  }

  // Full-value markdown link: [label](url)
  const fullMd = value.match(/^\[([^\]]+)\]\(([^)]+)\)$/)
  if (fullMd) {
    value = fullMd[1].trim()
  } else if (value.includes('](')) {
    // Embedded markdown (e.g. C:\...\Downloads\[www.youtube.com_cookies.txt](https://...))
    const embedded = value.match(/^(.*?)\[([^\]\n]+)\]\((https?:\/\/[^)]+|[^)]+)\)(.*)$/i)
    if (embedded) {
      const before = embedded[1]
      const label = embedded[2].trim()
      const after = embedded[4] || ''
      value = `${before}${label}${after}`.trim()
    }
  }

  // Drop accidental URL-only values
  if (/^https?:\/\//i.test(value)) return null

  return value || null
}

export function isYouTubeRateLimitError(text) {
  const lowered = String(text || '').toLowerCase()
  return (
    lowered.includes('rate-limited') ||
    lowered.includes('rate limited') ||
    lowered.includes('too many requests') ||
    lowered.includes('http error 429') ||
    lowered.includes(YOUTUBE_RATE_LIMIT_ERROR.toLowerCase())
  )
}

function cookieCandidatePaths() {
  return [
    join(homedir(), 'Downloads', 'www.youtube.com_cookies.txt'),
    join(homedir(), 'Downloads', 'youtube-cookies.txt'),
    join(homedir(), 'youtube-cookies.txt'),
  ]
}

/**
 * Resolve a local Netscape cookies file. Never proceeds cookie-less when an
 * override is set but missing — logs WARNING and returns null.
 */
export function resolveLocalCookiesPath() {
  const rawOverride = process.env.YOUTUBE_COOKIES_FILE
  if (rawOverride != null && String(rawOverride).trim()) {
    const sanitized = sanitizeCookiesPathInput(rawOverride)
    const resolved = sanitized
      ? isAbsolute(sanitized)
        ? normalize(sanitized)
        : resolve(process.cwd(), sanitized)
      : null

    if (resolved && existsSync(resolved)) {
      if (sanitized !== String(rawOverride).trim()) {
        console.warn(`[cookies] sanitized YOUTUBE_COOKIES_FILE → ${resolved}`)
      }
      return resolved
    }

    console.warn(
      `[cookies] WARNING: YOUTUBE_COOKIES_FILE is set but not an existing file — ` +
        `raw=${JSON.stringify(String(rawOverride).trim())} ` +
        `sanitized=${JSON.stringify(sanitized)} ` +
        `resolved=${JSON.stringify(resolved)}. Not proceeding cookie-less.`
    )
    return null
  }

  for (const candidate of cookieCandidatePaths()) {
    if (existsSync(candidate)) return candidate
  }

  console.warn(
    `[cookies] WARNING: no cookies file found. Checked: ${cookieCandidatePaths().join(' | ')}`
  )
  return null
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
  const combined = `${stderr}\n${stdout}`

  if (isYouTubeRateLimitError(combined)) {
    return {
      ok: false,
      error: YOUTUBE_RATE_LIMIT_ERROR,
      rateLimited: true,
      stderr,
      cookiesPath,
    }
  }

  if (child.error) {
    return { ok: false, error: child.error.message, stderr, cookiesPath }
  }

  if (child.status !== 0) {
    return {
      ok: false,
      error: stderr || stdout || `Local fetch exited with code ${child.status ?? 'unknown'}`,
      stderr,
      cookiesPath,
      rateLimited: isYouTubeRateLimitError(stderr || stdout),
    }
  }

  try {
    const result = parseHandlerStdout(stdout)
    if (result?.rateLimited || isYouTubeRateLimitError(result?.error)) {
      return {
        ok: false,
        result,
        error: YOUTUBE_RATE_LIMIT_ERROR,
        rateLimited: true,
        stderr,
        cookiesPath,
      }
    }
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

  if (outcome.result.rateLimited || isYouTubeRateLimitError(outcome.result.error)) {
    return {
      ok: false,
      result: outcome.result,
      error: YOUTUBE_RATE_LIMIT_ERROR,
      rateLimited: true,
      cookiesPath: outcome.cookiesPath,
    }
  }

  const readyCount = Number(outcome.result.readyCount ?? 0)
  if (readyCount === 0) {
    const clips = Array.isArray(outcome.result.clips) ? outcome.result.clips : []
    const firstError = clips.find((clip) => clip && typeof clip === 'object' && clip.error)?.error
    const err = outcome.result.error || firstError || 'All clip downloads failed.'
    return {
      ok: false,
      result: outcome.result,
      error: isYouTubeRateLimitError(err) ? YOUTUBE_RATE_LIMIT_ERROR : err,
      rateLimited: isYouTubeRateLimitError(err),
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
