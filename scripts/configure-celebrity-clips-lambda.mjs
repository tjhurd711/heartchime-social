import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import {
  GetFunctionCommand,
  LambdaClient,
  UpdateFunctionConfigurationCommand,
} from '@aws-sdk/client-lambda'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const env = Object.fromEntries(
  readFileSync(resolve(root, '.env.local'), 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => {
      const eq = line.indexOf('=')
      return [line.slice(0, eq), line.slice(eq + 1)]
    })
)

const client = new LambdaClient({
  region: env.AWS_REGION || 'us-east-2',
  credentials: {
    accessKeyId: env.AWS_ACCESS_KEY_ID,
    secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
  },
})

const functionName = env.CELEBRITY_CLIPS_LAMBDA_NAME || 'celebrity-clips'

try {
  const { Configuration } = await client.send(new GetFunctionCommand({ FunctionName: functionName }))
  const merged = {
    ...(Configuration.Environment?.Variables || {}),
    YOUTUBE_API_KEY: env.YOUTUBE_API_KEY,
    SUPABASE_URL: env.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: env.SUPABASE_SERVICE_ROLE_KEY,
    CELEBRITY_CLIPS_BUCKET: env.S3_BUCKET_NAME || 'heartbeat-photos-prod',
  }
  delete merged.YT_DLP_BIN
  if (env.YOUTUBE_COOKIES_S3_KEY?.trim()) {
    merged.YOUTUBE_COOKIES_S3_KEY = env.YOUTUBE_COOKIES_S3_KEY.trim()
  }
  if (env.YOUTUBE_COOKIES_S3_BUCKET?.trim()) {
    merged.YOUTUBE_COOKIES_S3_BUCKET = env.YOUTUBE_COOKIES_S3_BUCKET.trim()
  }

  await client.send(
    new UpdateFunctionConfigurationCommand({
      FunctionName: functionName,
      Environment: { Variables: merged },
    })
  )

  console.log(`Updated ${functionName} environment variables.`)
} catch (error) {
  if (error.name === 'ResourceNotFoundException') {
    console.error(
      `${functionName} does not exist yet. Deploy it from your Mac first:\n` +
        '  cd heartbeat_mobileapp/lambdas/celebrity_clips && AWS_PROFILE=admin ./deploy.sh\n' +
        'Then re-run: node scripts/configure-celebrity-clips-lambda.mjs'
    )
    process.exit(1)
  }
  throw error
}
