import { GetObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3'

import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

import { NextRequest, NextResponse } from 'next/server'

import { s3Client } from '@/lib/s3'



export const runtime = 'nodejs'



const OUTPUT_BUCKET = process.env.S3_BUCKET_NAME || 'heartbeat-photos-prod'

const UUID_PATTERN = /^[0-9a-fA-F-]{16,64}$/



function videoKey(jobId: string): string {

  return `memorial-reel/${jobId}/output.mp4`

}



function metadataKey(jobId: string): string {

  return `memorial-reel/${jobId}/metadata.json`

}



function errorKey(jobId: string): string {

  return `memorial-reel/${jobId}/error.json`

}



function isMissingObjectError(error: unknown): boolean {

  const name = (error as { name?: string })?.name

  const code = (error as { Code?: string })?.Code

  const statusCode = (error as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode

  return name === 'NoSuchKey' || code === 'NoSuchKey' || name === 'NotFound' || statusCode === 404

}



export async function GET(request: NextRequest) {

  const jobId = request.nextUrl.searchParams.get('jobId')?.trim() || ''

  if (!jobId || !UUID_PATTERN.test(jobId)) {

    return NextResponse.json({ error: 'A valid jobId is required.' }, { status: 400 })

  }



  try {

    try {

      const errorObject = await s3Client.send(

        new GetObjectCommand({ Bucket: OUTPUT_BUCKET, Key: errorKey(jobId) })

      )

      const errorBody = await errorObject.Body?.transformToString()

      const errorPayload = errorBody

        ? (JSON.parse(errorBody) as { error?: string; details?: string })

        : null

      return NextResponse.json({

        status: 'failed',

        jobId,

        error: errorPayload?.error || 'Render failed',

        details: errorPayload?.details || null,

      })

    } catch (errorCheckError) {

      if (!isMissingObjectError(errorCheckError)) {

        throw errorCheckError

      }

    }



    let metadata: Record<string, unknown> | null = null

    try {

      const metadataObject = await s3Client.send(

        new GetObjectCommand({ Bucket: OUTPUT_BUCKET, Key: metadataKey(jobId) })

      )

      const body = await metadataObject.Body?.transformToString()

      metadata = body ? (JSON.parse(body) as Record<string, unknown>) : null

    } catch (metadataError) {

      if (isMissingObjectError(metadataError)) {

        return NextResponse.json({ status: 'processing', jobId })

      }

      throw metadataError

    }



    const key = videoKey(jobId)

    try {

      await s3Client.send(new HeadObjectCommand({ Bucket: OUTPUT_BUCKET, Key: key }))

    } catch (videoError) {

      if (isMissingObjectError(videoError)) {

        return NextResponse.json({ status: 'processing', jobId })

      }

      throw videoError

    }



    const url = await getSignedUrl(

      s3Client,

      new GetObjectCommand({ Bucket: OUTPUT_BUCKET, Key: key }),

      { expiresIn: 60 * 60 * 24 }

    )



    return NextResponse.json({

      status: 'ready',

      jobId,

      key,

      url,

      duration: Number(metadata?.duration ?? 0),

      clipCount: Number(metadata?.clipCount ?? 0),

      celebrityName: metadata?.celebrityName ?? null,

    })

  } catch (error) {

    return NextResponse.json(

      {

        error: 'Failed to check memorial reel status.',

        details: error instanceof Error ? error.message : 'Unknown error',

      },

      { status: 500 }

    )

  }

}


