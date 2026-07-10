import { InvokeCommand, LambdaClient } from '@aws-sdk/client-lambda'
import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { getVoicemailRegion } from '@/lib/voicemailStorage'

export const runtime = 'nodejs'
export const maxDuration = 60

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const lambdaCredentials =
  process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
    ? {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      }
    : undefined

const lambdaClient = new LambdaClient({
  region: getVoicemailRegion(),
  credentials: lambdaCredentials,
})

const FUNCTION_NAME =
  process.env.CELEBRITY_CLIPS_LAMBDA_NAME?.trim() || 'celebrity-clips'

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      celebrityName?: string
      download?: boolean
    }
    const celebrityName = body.celebrityName?.trim() || ''
    const download = body.download !== false

    if (!celebrityName) {
      return NextResponse.json({ error: 'celebrityName is required' }, { status: 400 })
    }

    await supabase
      .from('celebrity_videos')
      .delete()
      .eq('celebrity_name', celebrityName)
      .in('status', ['failed', 'downloading', 'searching'])

    const command = new InvokeCommand({
      FunctionName: FUNCTION_NAME,
      InvocationType: 'Event',
      Payload: Buffer.from(
        JSON.stringify({
          celebrityName,
          download,
        })
      ),
    })

    const invokeResult = await lambdaClient.send(command)
    const accepted =
      typeof invokeResult.StatusCode === 'number' &&
      invokeResult.StatusCode >= 200 &&
      invokeResult.StatusCode < 300

    if (!accepted) {
      return NextResponse.json(
        {
          error: 'Failed to start celebrity clip fetch',
          details: `Lambda invoke returned status ${invokeResult.StatusCode ?? 'unknown'}`,
        },
        { status: 502 }
      )
    }

    return NextResponse.json(
      {
        celebrityName,
        status: 'fetching',
        download,
      },
      { status: 202 }
    )
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Failed to start celebrity clip fetch',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
