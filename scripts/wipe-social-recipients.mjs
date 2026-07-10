/**
 * One-shot cleanup: null social_posts.recipient_id, delete social_recipients rows,
 * delete S3 objects whose keys came from those rows.
 *
 * Usage: node scripts/wipe-social-recipients.mjs
 */
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { S3Client, DeleteObjectsCommand } from '@aws-sdk/client-s3'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')

function loadEnvLocal() {
  const text = readFileSync(resolve(root, '.env.local'), 'utf8')
  const env = {}
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    let val = trimmed.slice(eq + 1).trim()
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1)
    }
    env[key] = val
  }
  return env
}

function s3KeyFromUrl(url, bucket) {
  if (!url || typeof url !== 'string') return null
  try {
    const u = new URL(url)
    const host = u.hostname
    // https://bucket.s3.region.amazonaws.com/key
    // https://bucket.s3.amazonaws.com/key
    // https://s3.region.amazonaws.com/bucket/key
    if (host.startsWith(`${bucket}.s3.`)) {
      return decodeURIComponent(u.pathname.replace(/^\//, ''))
    }
    if (host === 's3.amazonaws.com' || host.startsWith('s3.')) {
      const parts = u.pathname.replace(/^\//, '').split('/')
      if (parts[0] === bucket) return decodeURIComponent(parts.slice(1).join('/'))
    }
    // Only delete keys that clearly belong to recipients prefix if host is unexpected but path matches
    const path = decodeURIComponent(u.pathname.replace(/^\//, ''))
    if (path.startsWith('social/recipients/')) return path
    return null
  } catch {
    return null
  }
}

async function main() {
  const env = loadEnvLocal()
  const supabaseUrl = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY
  const bucket = env.S3_BUCKET_NAME || 'heartbeat-photos-prod'
  const region = env.AWS_REGION || 'us-east-2'

  if (!supabaseUrl || !serviceKey) {
    throw new Error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env.local')
  }
  if (!env.AWS_ACCESS_KEY_ID || !env.AWS_SECRET_ACCESS_KEY) {
    console.warn('WARNING: AWS creds missing — will delete DB rows but skip S3 deletes')
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  // 1) Inspect referencing tables via PostgREST (social_posts is the known FK)
  // Also try to discover via a raw RPC if available — otherwise use known schema.
  const report = {
    recipientsBefore: 0,
    postsNulled: 0,
    recipientsDeleted: 0,
    photoUrlsCollected: 0,
    s3KeysToDelete: 0,
    s3ObjectsDeleted: 0,
    s3Errors: [],
    skippedUrls: [],
  }

  const { data: recipients, error: fetchErr } = await supabase
    .from('social_recipients')
    .select('id, image_clean_url, image_with_text_url')

  if (fetchErr) throw new Error(`Fetch recipients failed: ${fetchErr.message}`)
  report.recipientsBefore = recipients?.length || 0

  const urls = []
  for (const row of recipients || []) {
    if (row.image_clean_url) urls.push(row.image_clean_url)
    if (row.image_with_text_url) urls.push(row.image_with_text_url)
  }
  report.photoUrlsCollected = urls.length

  const keys = []
  const seen = new Set()
  for (const url of urls) {
    const key = s3KeyFromUrl(url, bucket)
    if (!key) {
      report.skippedUrls.push(url)
      continue
    }
    // Safety: only delete recipient-prefix objects
    if (!key.startsWith('social/recipients/')) {
      report.skippedUrls.push(url)
      continue
    }
    if (!seen.has(key)) {
      seen.add(key)
      keys.push(key)
    }
  }
  report.s3KeysToDelete = keys.length

  // 2) Null recipient_id on social_posts
  const { data: postsWithRecipient, error: postsCountErr } = await supabase
    .from('social_posts')
    .select('id')
    .not('recipient_id', 'is', null)

  if (postsCountErr) throw new Error(`Count posts failed: ${postsCountErr.message}`)
  const postIds = (postsWithRecipient || []).map((p) => p.id)

  if (postIds.length > 0) {
    const { error: nullErr, count } = await supabase
      .from('social_posts')
      .update({ recipient_id: null })
      .not('recipient_id', 'is', null)
      .select('id', { count: 'exact' })

    if (nullErr) throw new Error(`Null recipient_id failed: ${nullErr.message}`)
    report.postsNulled = count ?? postIds.length
  }

  // 3) Delete all social_recipients rows
  if (report.recipientsBefore > 0) {
    const { error: delErr, count } = await supabase
      .from('social_recipients')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000')
      .select('id', { count: 'exact' })

    if (delErr) throw new Error(`Delete recipients failed: ${delErr.message}`)
    report.recipientsDeleted = count ?? report.recipientsBefore
  }

  // Verify empty
  const { count: remaining, error: remErr } = await supabase
    .from('social_recipients')
    .select('id', { count: 'exact', head: true })
  if (remErr) throw new Error(`Verify failed: ${remErr.message}`)
  if ((remaining || 0) > 0) {
    throw new Error(`Expected 0 recipients remaining, got ${remaining}`)
  }

  // 4) Delete S3 objects
  if (keys.length > 0 && env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY) {
    const s3 = new S3Client({
      region,
      credentials: {
        accessKeyId: env.AWS_ACCESS_KEY_ID,
        secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
      },
    })

    // DeleteObjects accepts up to 1000 keys
    for (let i = 0; i < keys.length; i += 1000) {
      const chunk = keys.slice(i, i + 1000)
      const out = await s3.send(
        new DeleteObjectsCommand({
          Bucket: bucket,
          Delete: {
            Objects: chunk.map((Key) => ({ Key })),
            Quiet: false,
          },
        })
      )
      report.s3ObjectsDeleted += out.Deleted?.length || 0
      for (const err of out.Errors || []) {
        report.s3Errors.push(`${err.Key}: ${err.Code} ${err.Message}`)
      }
    }
  }

  console.log(JSON.stringify(report, null, 2))
}

main().catch((err) => {
  console.error('WIPE FAILED:', err.message || err)
  process.exit(1)
})
