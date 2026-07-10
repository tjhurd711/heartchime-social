import { readFileSync, existsSync, mkdirSync, rmSync, writeFileSync, cpSync, readdirSync, statSync } from 'fs'
import { resolve, dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { execSync } from 'child_process'
import {
  CreateFunctionCommand,
  GetFunctionCommand,
  LambdaClient,
  UpdateFunctionCodeCommand,
  UpdateFunctionConfigurationCommand,
} from '@aws-sdk/client-lambda'
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import AdmZip from 'adm-zip'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const repoRoot = resolve(root, '..')
const lambdaDir = resolve(repoRoot, 'heartbeat_mobileapp/lambdas/celebrity_clips')

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

function zipDirectory(dir, outZip) {
  const zip = new AdmZip()
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    const stat = statSync(full)
    if (stat.isDirectory()) {
      zip.addLocalFolder(full, entry)
    } else {
      zip.addLocalFile(full, '')
    }
  }
  zip.writeZip(outZip)
}

const env = loadEnv()
const region = env.AWS_REGION || 'us-east-2'
const functionName = env.CELEBRITY_CLIPS_LAMBDA_NAME || 'celebrity-clips'

const client = new LambdaClient({
  region,
  credentials: {
    accessKeyId: env.AWS_ACCESS_KEY_ID,
    secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
  },
})

console.log('Getting IAM role from memorial-slideshow...')
const { Configuration: slideshow } = await client.send(
  new GetFunctionCommand({ FunctionName: 'memorial-slideshow' })
)
const role = slideshow.Role
if (!role) throw new Error('Could not resolve IAM role from memorial-slideshow')

const buildDir = join(lambdaDir, '.build')
const zipPath = join(lambdaDir, 'celebrity-clips.zip')
rmSync(buildDir, { recursive: true, force: true })
mkdirSync(buildDir, { recursive: true })

console.log('Installing Linux-compatible Python dependencies for Lambda...')
const pipCmd = process.platform === 'win32' ? 'python' : 'python3'
execSync(
  `${pipCmd} -m pip install -r "${join(lambdaDir, 'requirements.txt')}" -t "${buildDir}" --quiet --upgrade ` +
    '--platform manylinux2014_x86_64 --implementation cp --python-version 3.11 --only-binary=:all: ',
  { stdio: 'inherit' }
)

for (const file of ['handler.py', 'celebrity_videos.py', 'ecs_fallback.py']) {
  cpSync(join(lambdaDir, file), join(buildDir, file))
}

// Never ship cookie files inside the deploy zip (cloud fetch loads from private S3).
for (const banned of ['youtube-cookies.txt', 'www.youtube.com_cookies.txt', 'cookies.txt']) {
  const bannedPath = join(buildDir, banned)
  if (existsSync(bannedPath)) {
    throw new Error(`Refusing to deploy: cookie file found in build dir (${bannedPath})`)
  }
}

console.log('Creating zip...')
zipDirectory(buildDir, zipPath)
const zipBuffer = readFileSync(zipPath)
console.log(`Zip size: ${(zipBuffer.length / 1024 / 1024).toFixed(1)} MB`)

const bucket = env.S3_BUCKET_NAME || 'heartbeat-photos-prod'
const s3Key = `lambda-deploys/${functionName}/${Date.now()}.zip`
// Direct UpdateFunctionCode ZipFile limit is ~50MB; use S3 for larger packages.
const useS3Code = zipBuffer.length > 45 * 1024 * 1024
let code
if (useS3Code) {
  console.log(`Uploading zip to s3://${bucket}/${s3Key} (too large for direct ZipFile)...`)
  const s3 = new S3Client({
    region,
    credentials: {
      accessKeyId: env.AWS_ACCESS_KEY_ID,
      secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
    },
  })
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: s3Key,
      Body: zipBuffer,
      ContentType: 'application/zip',
    })
  )
  code = { S3Bucket: bucket, S3Key: s3Key }
} else {
  code = { ZipFile: zipBuffer }
}

let existingConfig = null
let exists = true
try {
  const { Configuration } = await client.send(new GetFunctionCommand({ FunctionName: functionName }))
  existingConfig = Configuration
} catch (error) {
  if (error.name === 'ResourceNotFoundException') exists = false
  else throw error
}

const lambdaEnv = {
  Variables: {
    ...(existingConfig?.Environment?.Variables || {}),
    YOUTUBE_API_KEY: env.YOUTUBE_API_KEY,
    SUPABASE_URL: env.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: env.SUPABASE_SERVICE_ROLE_KEY,
    CELEBRITY_CLIPS_BUCKET: env.S3_BUCKET_NAME || 'heartbeat-photos-prod',
    MAX_YT_SEARCH_SECONDS: env.MAX_YT_SEARCH_SECONDS || '120',
    MAX_YT_DOWNLOAD_SECONDS: env.MAX_YT_DOWNLOAD_SECONDS || '20',
  },
}
delete lambdaEnv.Variables.YT_DLP_BIN
if (env.YOUTUBE_COOKIES_S3_KEY?.trim()) {
  lambdaEnv.Variables.YOUTUBE_COOKIES_S3_KEY = env.YOUTUBE_COOKIES_S3_KEY.trim()
} else {
  lambdaEnv.Variables.YOUTUBE_COOKIES_S3_KEY = 'config/youtube-cookies.txt'
}
if (env.YOUTUBE_COOKIES_S3_BUCKET?.trim()) {
  lambdaEnv.Variables.YOUTUBE_COOKIES_S3_BUCKET = env.YOUTUBE_COOKIES_S3_BUCKET.trim()
} else {
  lambdaEnv.Variables.YOUTUBE_COOKIES_S3_BUCKET = bucket
}

const config = {
  Timeout: 900,
  MemorySize: 1024,
  Handler: 'handler.handler',
  Runtime: 'python3.11',
  Environment: lambdaEnv,
}

if (exists) {
  console.log(`Updating ${functionName} code...`)
  await client.send(
    new UpdateFunctionCodeCommand({
      FunctionName: functionName,
      ...code,
    })
  )
  console.log(`Waiting for ${functionName} code update...`)
  await new Promise((resolve) => setTimeout(resolve, 15000))
  console.log(`Updating ${functionName} environment...`)
  await client.send(
    new UpdateFunctionConfigurationCommand({
      FunctionName: functionName,
      ...config,
    })
  )
} else {
  console.log(`Creating ${functionName}...`)
  await client.send(
    new CreateFunctionCommand({
      FunctionName: functionName,
      Role: role,
      Code: code,
      ...config,
    })
  )
}

rmSync(buildDir, { recursive: true, force: true })
console.log(`Done. ${functionName} is deployed in ${region}.`)
if (useS3Code) {
  console.log(`Deploy artifact: s3://${bucket}/${s3Key}`)
}