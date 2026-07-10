import { ECSClient, RunTaskCommand } from '@aws-sdk/client-ecs'
import { NextRequest, NextResponse } from 'next/server'
import { getVoicemailRegion } from '@/lib/voicemailStorage'

export const runtime = 'nodejs'
export const maxDuration = 60

const lambdaCredentials =
  process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
    ? {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      }
    : undefined

const ecsClient = new ECSClient({
  region: getVoicemailRegion(),
  credentials: lambdaCredentials,
})

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) {
    throw new Error(`${name} is not configured`)
  }
  return value
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { celebrityName?: string; download?: boolean }
    const celebrityName = body.celebrityName?.trim() || ''
    const download = body.download !== false

    if (!celebrityName) {
      return NextResponse.json({ error: 'celebrityName is required' }, { status: 400 })
    }

    const cluster = process.env.CELEBRITY_CLIPS_ECS_CLUSTER?.trim() || 'cele-zip-processing'
    const taskDefinition = requiredEnv('CELEBRITY_CLIPS_ECS_TASK_DEFINITION')
    const containerName = process.env.CELEBRITY_CLIPS_ECS_CONTAINER?.trim() || 'celebrity-clips'
    const subnets = (process.env.CELEBRITY_CLIPS_ECS_SUBNETS || '')
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean)
    const securityGroups = (process.env.CELEBRITY_CLIPS_ECS_SECURITY_GROUPS || '')
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean)

    if (subnets.length === 0) {
      return NextResponse.json(
        { error: 'CELEBRITY_CLIPS_ECS_SUBNETS must be configured for ECS fetch' },
        { status: 500 }
      )
    }

    const command = new RunTaskCommand({
      cluster,
      taskDefinition,
      launchType: 'FARGATE',
      startedBy: 'heartchime-admin-video-editor',
      networkConfiguration: {
        awsvpcConfiguration: {
          subnets,
          securityGroups: securityGroups.length > 0 ? securityGroups : undefined,
          assignPublicIp: 'ENABLED',
        },
      },
      overrides: {
        containerOverrides: [
          {
            name: containerName,
            command: ['python', 'handler.py', celebrityName, ...(download ? [] : ['--search-only'])],
          },
        ],
      },
    })

    const result = await ecsClient.send(command)
    const taskArn = result.tasks?.[0]?.taskArn
    const failures = result.failures || []

    if (!taskArn && failures.length > 0) {
      return NextResponse.json(
        {
          error: 'ECS RunTask failed',
          details: failures,
        },
        { status: 502 }
      )
    }

    return NextResponse.json(
      {
        celebrityName,
        status: 'fetching',
        fallback: 'ecs',
        cluster,
        taskArn: taskArn ?? null,
        download,
      },
      { status: 202 }
    )
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Failed to start ECS celebrity clip fetch',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
