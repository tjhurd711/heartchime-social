import { readFileSync, existsSync } from 'fs'
import { resolve, dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function resolveCookiesPath(arg) {
  if (arg) return resolve(arg)
  const home = process.env.USERPROFILE || process.env.HOME || ''
  const candidates = [
    join(home, 'Downloads', 'www.youtube.com_cookies.txt'),
    join(home, 'Downloads', 'youtube-cookies.txt'),
    join(home, 'youtube-cookies.txt'),
  ]
  return candidates.find((p) => existsSync(p)) || candidates[1]
}

function loadAwsCredentials(env) {
  if (env.AWS_S3_UPLOAD_ACCESS_KEY_ID?.trim() && env.AWS_S3_UPLOAD_SECRET_ACCESS_KEY?.trim()) {
    return {
      accessKeyId: env.AWS_S3_UPLOAD_ACCESS_KEY_ID.trim(),
      secretAccessKey: env.AWS_S3_UPLOAD_SECRET_ACCESS_KEY.trim(),
    }
  }
  const profile = process.env.AWS_PROFILE || env.AWS_S3_PROFILE
  if (profile) {
    const credsPath = join(process.env.USERPROFILE || process.env.HOME || '', '.aws', 'credentials')
    if (!existsSync(credsPath)) {
      throw new Error(`AWS profile "${profile}" requested but ${credsPath} not found`)
    }
    const section = `[${profile}]`
    let inSection = false
    let accessKeyId
    let secretAccessKey
    for (const line of readFileSync(credsPath, 'utf8').split('\n')) {
      const trimmed = line.trim()
      if (trimmed.startsWith('[')) {
        inSection = trimmed === section
        continue
      }
      if (!inSection) continue
      const eq = trimmed.indexOf('=')
      if (eq === -1) continue
      const k = trimmed.slice(0, eq).trim()
      const v = trimmed.slice(eq + 1).trim()
      if (k === 'aws_access_key_id') accessKeyId = v
      if (k === 'aws_secret_access_key') secretAccessKey = v
    }
    if (accessKeyId && secretAccessKey) return { accessKeyId, secretAccessKey }
    throw new Error(`Could not read credentials for AWS profile "${profile}"`)
  }
  return {
    accessKeyId: env.AWS_ACCESS_KEY_ID,
    secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
  }
}

const cookiesPath = resolveCookiesPath(process.argv[2])

function loadEnv() {
  const env = {}
  for (const line of readFileSync(resolve(root, '.env.local'), 'utf8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    env[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim()
  }
  return env
}

if (!existsSync(cookiesPath)) {
  console.error(`Cookies file not found: ${cookiesPath}`)
  console.error('Run: .\\scripts\\export-youtube-cookies.ps1')
  process.exit(1)
}

const env = loadEnv()
const bucket = env.YOUTUBE_COOKIES_S3_BUCKET || env.S3_BUCKET_NAME || 'heartbeat-photos-prod'
const key = env.YOUTUBE_COOKIES_S3_KEY || 'config/youtube-cookies.txt'

const credentials = loadAwsCredentials(env)
const s3 = new S3Client({
  region: env.AWS_REGION || 'us-east-2',
  credentials,
})

const body = readFileSync(cookiesPath)
await s3.send(
  new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: body,
    ContentType: 'text/plain',
  })
)

console.log(`Uploaded ${cookiesPath} → s3://${bucket}/${key}`)
console.log('Next: node scripts/configure-celebrity-clips-lambda.mjs')
