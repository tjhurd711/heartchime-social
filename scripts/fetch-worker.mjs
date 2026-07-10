/**
 * Home-PC fetch worker — polls Supabase fetch_jobs and runs local yt-dlp.
 *
 * Usage (from heartchime-social):
 *   node scripts/fetch-worker.mjs
 *
 * Requires .env.local with SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (+ AWS keys).
 * See scripts/WORKERS.md.
 */
import { readFileSync, existsSync } from 'fs'
import { resolve, dirname, join } from 'path'
import { fileURLToPath, pathToFileURL } from 'url'
import { createClient } from '@supabase/supabase-js'
import {
  runFetchJobParams,
  workerHostname,
  resolveLocalCookiesPath,
} from '../lib/celebrityClipLocalRunner.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const POLL_MS = 10_000
const STALE_NOTE = 'claimed >10m auto-requeued by claim_fetch_job()'

function loadEnvFile(filePath) {
  if (!existsSync(filePath)) return {}
  const env = {}
  for (const line of readFileSync(filePath, 'utf8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    env[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim()
  }
  return env
}

function applyEnv(fileEnv) {
  for (const [key, value] of Object.entries(fileEnv)) {
    if (process.env[key] === undefined) {
      process.env[key] = value
    }
  }
}

applyEnv(loadEnvFile(resolve(root, '.env.local')))
applyEnv(loadEnvFile(resolve(root, '.env')))

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !serviceKey) {
  console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (put them in .env.local)')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const workerId = process.env.FETCH_WORKER_ID?.trim() || workerHostname()

async function claimNextJob() {
  const { data, error } = await supabase.rpc('claim_fetch_job', {
    p_worker_id: workerId,
  })
  if (error) {
    throw new Error(`claim_fetch_job failed: ${error.message}`)
  }
  if (!data) return null
  if (Array.isArray(data)) return data[0] || null
  return data
}

async function markJob(jobId, patch) {
  const { error } = await supabase
    .from('fetch_jobs')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', jobId)
  if (error) {
    console.error(`[worker] failed to update job ${jobId}:`, error.message)
  }
}

async function processJob(job) {
  const params = job.params && typeof job.params === 'object' ? job.params : {}
  console.log(
    `[worker] claimed ${job.id} mode=${params.mode || 'fetch'} celebrity=${params.celebrityName || job.celebrity_slug} by=${workerId}`
  )

  const cookiesPath = resolveLocalCookiesPath()
  if (!cookiesPath) {
    await markJob(job.id, {
      status: 'failed',
      error:
        'No local youtube-cookies.txt found on this worker PC. Export cookies to Downloads.',
    })
    return
  }

  // Clear transient rows for full fetches (mirrors local-fetch API).
  if ((params.mode || 'fetch') === 'fetch' && params.celebrityName) {
    await supabase
      .from('celebrity_videos')
      .delete()
      .eq('celebrity_name', params.celebrityName)
      .in('status', ['failed', 'downloading', 'searching'])
  }

  const outcome = runFetchJobParams(params)
  if (!outcome.ok) {
    await markJob(job.id, {
      status: 'failed',
      error: (outcome.error || 'Fetch failed').slice(0, 2000),
    })
    console.error(`[worker] job ${job.id} failed:`, outcome.error)
    return
  }

  await markJob(job.id, {
    status: 'done',
    error: null,
  })
  console.log(
    `[worker] job ${job.id} done readyCount=${outcome.result?.readyCount ?? '?'} cookies=${cookiesPath}`
  )
}

console.log(`[worker] starting id=${workerId} poll=${POLL_MS}ms cwd=${process.cwd()}`)
console.log(`[worker] cookies=${resolveLocalCookiesPath() || 'MISSING'}`)
console.log(`[worker] stale reclaim: ${STALE_NOTE}`)
console.log(`[worker] runner=${pathToFileURL(join(root, 'lib', 'celebrityClipLocalRunner.mjs')).href}`)

let busy = false

async function tick() {
  if (busy) return
  busy = true
  try {
    const job = await claimNextJob()
    if (!job) {
      return
    }
    await processJob(job)
  } catch (error) {
    console.error('[worker] tick error:', error instanceof Error ? error.message : error)
  } finally {
    busy = false
  }
}

await tick()
setInterval(() => {
  void tick()
}, POLL_MS)
