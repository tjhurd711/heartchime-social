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

console.log('Creating zip...')
zipDirectory(buildDir, zipPath)
const zipBuffer = readFileSync(zipPath)
console.log(`Zip size: ${(zipBuffer.length / 1024 / 1024).toFixed(1)} MB`)

const code = { ZipFile: zipBuffer }

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
}
if (env.YOUTUBE_COOKIES_S3_BUCKET?.trim()) {
  lambdaEnv.Variables.YOUTUBE_COOKIES_S3_BUCKET = env.YOUTUBE_COOKIES_S3_BUCKET.trim()
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
      ZipFile: zipBuffer,
    })
  )
  console.log(`Waiting for ${functionName} code update...`)
  await new Promise((resolve) => setTimeout(resolve, 10000))
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
