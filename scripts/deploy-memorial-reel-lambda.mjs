import { createHash } from 'crypto'
import {
  readFileSync,
  mkdirSync,
  rmSync,
  cpSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'fs'
import { resolve, dirname, join } from 'path'
import { fileURLToPath } from 'url'
import {
  CreateFunctionCommand,
  GetFunctionCommand,
  LambdaClient,
  UpdateFunctionCodeCommand,
  UpdateFunctionConfigurationCommand,
} from '@aws-sdk/client-lambda'
import AdmZip from 'adm-zip'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const lambdaDir = resolve(root, 'lambdas/memorial-reel')
const sharedDir = resolve(root, 'lambdas/shared/video_editor')
const SHARED_FILES = ['edit.py', 'captions.py', 'source.py']

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

function sha256File(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex').slice(0, 12)
}

function parsePipelineVersion(content) {
  const match = content.match(/PIPELINE_VERSION\s*=\s*["']([^"']+)["']/)
  return match?.[1] ?? null
}

function assertEditPyContainsPipelineVersion(content, context) {
  if (!content.includes('PIPELINE_VERSION')) {
    throw new Error(`Deploy aborted: ${context} edit.py missing PIPELINE_VERSION`)
  }
  const version = parsePipelineVersion(content)
  if (!version) {
    throw new Error(
      `Deploy aborted: ${context} edit.py has PIPELINE_VERSION but value could not be parsed`
    )
  }
  if (content.includes('-shortest')) {
    throw new Error(`Deploy aborted: ${context} edit.py still contains -shortest (stale mux code)`)
  }
  console.log(`Verified ${context} edit.py PIPELINE_VERSION=${version}`)
  return version
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

function readEditPyFromZip(zipPath) {
  const zip = new AdmZip(zipPath)
  const entry = zip.getEntry('edit.py')
  if (!entry) {
    throw new Error(`Deploy aborted: ${zipPath} missing edit.py at zip root`)
  }
  return entry.getData().toString('utf8')
}

async function downloadDeployedEditPy(client, functionName) {
  const { Code } = await client.send(new GetFunctionCommand({ FunctionName: functionName }))
  const location = Code?.Location
  if (!location) {
    console.warn('Warning: could not resolve deployed Code.Location — skipping remote diff')
    return null
  }

  const response = await fetch(location)
  if (!response.ok) {
    throw new Error(`Failed to download deployed package: HTTP ${response.status}`)
  }

  const bytes = Buffer.from(await response.arrayBuffer())
  const inspectZip = join(lambdaDir, '.deployed-inspect.zip')
  writeFileSync(inspectZip, bytes)
  try {
    return readEditPyFromZip(inspectZip)
  } finally {
    rmSync(inspectZip, { force: true })
  }
}

const env = loadEnv()
const region = env.AWS_REGION || 'us-east-2'
const functionName = env.MEMORIAL_REEL_FUNCTION_NAME || 'memorial-reel'

const client = new LambdaClient({
  region,
  credentials: {
    accessKeyId: env.AWS_ACCESS_KEY_ID,
    secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
  },
})

async function waitForFunctionReady(functionName, { maxAttempts = 60, delayMs = 2000 } = {}) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const { Configuration } = await client.send(
      new GetFunctionCommand({ FunctionName: functionName })
    )
    const status = Configuration?.LastUpdateStatus
    const reason = Configuration?.LastUpdateStatusReason
    if (status === 'Successful') {
      return
    }
    if (status === 'Failed') {
      throw new Error(`Lambda update failed: ${reason || 'unknown'}`)
    }
    console.log(
      `Waiting for Lambda update... (${status || 'InProgress'}, attempt ${attempt}/${maxAttempts})`
    )
    await new Promise((resolve) => setTimeout(resolve, delayMs))
  }
  throw new Error('Timed out waiting for Lambda update to complete')
}

function formatBytes(bytes) {
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`
  }
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

console.log('Getting IAM role and ffmpeg layers from memorial-slideshow...')
const { Configuration: slideshow } = await client.send(
  new GetFunctionCommand({ FunctionName: 'memorial-slideshow' })
)
const role = slideshow.Role
const layers = (slideshow.Layers || []).map((layer) => layer.Arn).filter(Boolean)
if (!role) throw new Error('Could not resolve IAM role from memorial-slideshow')
if (layers.length === 0) {
  console.warn('Warning: memorial-slideshow has no layers — ffmpeg may be missing at /opt/bin/ffmpeg')
}

const localSharedEditPath = join(sharedDir, 'edit.py')
const localEditContent = readFileSync(localSharedEditPath, 'utf8')
const localPipelineVersion = assertEditPyContainsPipelineVersion(localEditContent, 'local shared')
console.log(`Local shared edit.py sha256=${sha256File(localSharedEditPath)}`)

let deployedEditContent = null
try {
  deployedEditContent = await downloadDeployedEditPy(client, functionName)
} catch (error) {
  console.warn(`Warning: could not inspect currently deployed package: ${error.message}`)
}

if (deployedEditContent) {
  const deployedVersion = parsePipelineVersion(deployedEditContent)
  const deployedHasMarker = deployedEditContent.includes('PIPELINE_VERSION')
  console.log(
    `Currently deployed edit.py: PIPELINE_VERSION=${deployedVersion ?? 'MISSING'} ` +
      `has_shortest=${deployedEditContent.includes('-shortest')}`
  )
  if (!deployedHasMarker || deployedVersion !== localPipelineVersion) {
    console.log(
      `Deployed package is stale (deployed=${deployedVersion ?? 'none'}, ` +
        `local=${localPipelineVersion}) — uploading fresh build`
    )
  } else {
    console.log('Currently deployed edit.py already matches local PIPELINE_VERSION')
  }
}

const buildDir = join(lambdaDir, '.build')
const zipPath = join(lambdaDir, 'memorial-reel.zip')

// Always rebuild from scratch — never reuse cached .build/ or memorial-reel.zip
rmSync(buildDir, { recursive: true, force: true })
rmSync(zipPath, { force: true })
mkdirSync(buildDir, { recursive: true })

console.log(`Copying handler from ${lambdaDir}`)
cpSync(join(lambdaDir, 'lambda_function.py'), join(buildDir, 'lambda_function.py'), { force: true })

for (const fileName of SHARED_FILES) {
  const sourcePath = join(sharedDir, fileName)
  const destPath = join(buildDir, fileName)
  console.log(`Copying ${sourcePath} -> ${destPath}`)
  cpSync(sourcePath, destPath, { force: true })
}

const builtEditContent = readFileSync(join(buildDir, 'edit.py'), 'utf8')
const builtPipelineVersion = assertEditPyContainsPipelineVersion(builtEditContent, 'build dir')

console.log('Creating zip from fresh .build/...')
zipDirectory(buildDir, zipPath)

const zippedEditContent = readEditPyFromZip(zipPath)
const zippedPipelineVersion = assertEditPyContainsPipelineVersion(zippedEditContent, 'zip artifact')
if (zippedPipelineVersion !== builtPipelineVersion || zippedPipelineVersion !== localPipelineVersion) {
  throw new Error(
    'Deploy aborted: zip artifact PIPELINE_VERSION mismatch against build dir / local shared'
  )
}

const zipBuffer = readFileSync(zipPath)
console.log(`Zip size: ${formatBytes(zipBuffer.length)} (PIPELINE_VERSION=${zippedPipelineVersion})`)

let exists = true
try {
  await client.send(new GetFunctionCommand({ FunctionName: functionName }))
} catch (error) {
  if (error.name === 'ResourceNotFoundException') exists = false
  else throw error
}

const config = {
  Timeout: 900,
  MemorySize: 3008,
  Handler: 'lambda_function.handler',
  Runtime: 'python3.11',
  Layers: layers,
  Environment: {
    Variables: {
      ...(env.OPENAI_API_KEY ? { OPENAI_API_KEY: env.OPENAI_API_KEY } : {}),
      ...(env.ANTHROPIC_API_KEY ? { ANTHROPIC_API_KEY: env.ANTHROPIC_API_KEY } : {}),
    },
  },
}

if (exists) {
  console.log(`Updating ${functionName} code (PIPELINE_VERSION=${zippedPipelineVersion})...`)
  await client.send(
    new UpdateFunctionCodeCommand({
      FunctionName: functionName,
      ZipFile: zipBuffer,
    })
  )
  await waitForFunctionReady(functionName)
  console.log(`Updating ${functionName} configuration...`)
  await client.send(
    new UpdateFunctionConfigurationCommand({
      FunctionName: functionName,
      ...config,
    })
  )
  await waitForFunctionReady(functionName)
} else {
  console.log(`Creating ${functionName}...`)
  await client.send(
    new CreateFunctionCommand({
      FunctionName: functionName,
      Role: role,
      Code: { ZipFile: zipBuffer },
      ...config,
    })
  )
  await waitForFunctionReady(functionName)
}

// Post-deploy verification: re-download deployed package and assert version
const uploadedEditContent = await downloadDeployedEditPy(client, functionName)
if (!uploadedEditContent) {
  throw new Error('Deploy aborted: could not verify uploaded package')
}
const uploadedVersion = assertEditPyContainsPipelineVersion(uploadedEditContent, 'deployed AWS package')
if (uploadedVersion !== localPipelineVersion) {
  throw new Error(
    `Deploy verification failed: AWS has ${uploadedVersion}, expected ${localPipelineVersion}`
  )
}

rmSync(buildDir, { recursive: true, force: true })
console.log(
  `Done. ${functionName} is deployed in ${region} with PIPELINE_VERSION=${uploadedVersion}.`
)
console.log(
  'After a test render, confirm CloudWatch shows: [build] PIPELINE_VERSION=' + uploadedVersion
)
