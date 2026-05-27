import { InvokeCommand, LambdaClient } from '@aws-sdk/client-lambda'
import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const maxDuration = 60

type ScenicVideoDuration = 4 | 6 | 8

interface GenerateScenicVideoRequest {
  prompt?: string
  durationSeconds?: ScenicVideoDuration
  generateAudio?: boolean
}

const lambdaCredentials =
  process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
    ? {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      }
    : undefined

const lambdaClient = new LambdaClient({
  region: process.env.SCENIC_VIDEO_LAMBDA_REGION || 'us-east-2',
  credentials: lambdaCredentials,
})

function normalizeDuration(value: unknown): ScenicVideoDuration {
  if (value === 4 || value === 6 || value === 8) return value
  return 8
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as GenerateScenicVideoRequest
    const prompt = body.prompt?.trim() || ''
    const durationSeconds = normalizeDuration(body.durationSeconds)
    const generateAudio = body.generateAudio ?? true

    if (!prompt) {
      return NextResponse.json({ error: 'prompt is required' }, { status: 400 })
    }

    const functionName = process.env.SCENIC_VIDEO_LAMBDA_NAME?.trim() || 'veo-generate'
    const jobId = crypto.randomUUID()

    const payload = {
      jobId,
      prompt,
      durationSeconds,
      generateAudio,
    }

    const command = new InvokeCommand({
      FunctionName: functionName,
      InvocationType: 'Event',
      Payload: Buffer.from(JSON.stringify(payload)),
    })

    const invokeResult = await lambdaClient.send(command)
    const lambdaPayloadRaw = invokeResult.Payload
      ? new TextDecoder().decode(invokeResult.Payload)
      : '{}'
    const lambdaPayload = lambdaPayloadRaw ? JSON.parse(lambdaPayloadRaw) : {}

    if (invokeResult.FunctionError) {
      const detail =
        lambdaPayload?.errorMessage ||
        lambdaPayload?.errorType ||
        lambdaPayload?.body ||
        'Lambda invocation failed'
      return NextResponse.json(
        { error: 'Failed to enqueue scenic video generation.', details: detail },
        { status: 500 }
      )
    }

    if ((invokeResult.StatusCode || 0) < 200 || (invokeResult.StatusCode || 0) > 299) {
      return NextResponse.json(
        {
          error: 'Failed to enqueue scenic video generation.',
          details: `Lambda invoke status code ${invokeResult.StatusCode || 'unknown'}`,
        },
        { status: 502 }
      )
    }

    return NextResponse.json({ jobId })
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Failed to enqueue scenic video generation.',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
