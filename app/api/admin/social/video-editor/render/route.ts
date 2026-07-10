import { InvokeCommand, LambdaClient } from '@aws-sdk/client-lambda'
import { NextRequest, NextResponse } from 'next/server'
import { getVoicemailRegion } from '@/lib/voicemailStorage'

export const runtime = 'nodejs'
export const maxDuration = 60

/** Per-clip options keyed by s3_key. Trim fields optional; grayscale-only is valid. */
interface ClipEdit {
  startSeconds?: number
  endSeconds?: number
  grayscale?: boolean
}

interface OverlayCaption {
  text: string
  position: 'top' | 'middle' | 'bottom'
  scope: 'full' | 'intro'
}

const ALLOWED_ASPECT_RATIOS = ['9:16', '1:1', '4:5', '16:9'] as const
type AspectRatio = (typeof ALLOWED_ASPECT_RATIOS)[number]
const OVERLAY_POSITIONS = ['top', 'middle', 'bottom'] as const
const OVERLAY_SCOPES = ['full', 'intro'] as const

interface RenderRequest {
  celebrityName?: string
  clipKeys?: string[]
  autoCaptions?: boolean
  manualEdit?: boolean
  /** Keyed by S3 clip key; endSeconds is exclusive when trim is set. */
  clipEdits?: Record<string, ClipEdit>
  overlayCaption?: OverlayCaption
  musicKey?: string
  aspectRatio?: string
  style?: {
    max_clip_seconds?: number
    xfade_seconds?: number
    music_volume?: number
    aspectRatio?: string
    aspect_ratio?: string
  }
}

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

const FUNCTION_NAME = process.env.MEMORIAL_REEL_FUNCTION_NAME?.trim() || 'memorial-reel'

function parseAspectRatio(raw: unknown): AspectRatio | null {
  if (raw === undefined || raw === null || raw === '') {
    return '9:16'
  }
  if (typeof raw !== 'string') {
    return null
  }
  const value = raw.trim() as AspectRatio
  return (ALLOWED_ASPECT_RATIOS as readonly string[]).includes(value) ? value : null
}

function parseClipEdits(
  raw: unknown,
  clipKeys: string[]
): Record<string, ClipEdit> | { error: string } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { error: 'clipEdits must be a Record keyed by s3_key' }
  }

  const allowed = new Set(clipKeys)
  const edits: Record<string, ClipEdit> = {}

  for (const [key, value] of Object.entries(raw)) {
    if (!allowed.has(key)) {
      return { error: `clipEdits key "${key}" is not in clipKeys` }
    }
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return { error: `clipEdits[${key}] must be an object` }
    }

    const record = value as ClipEdit
    const hasStart = record.startSeconds !== undefined && record.startSeconds !== null
    const hasEnd = record.endSeconds !== undefined && record.endSeconds !== null
    if (hasStart !== hasEnd) {
      return {
        error: `clipEdits[${key}]: startSeconds and endSeconds must both be set or both omitted`,
      }
    }

    const entry: ClipEdit = {}

    if (hasStart && hasEnd) {
      const startSeconds = Number(record.startSeconds)
      const endSeconds = Number(record.endSeconds)
      if (!Number.isFinite(startSeconds) || !Number.isFinite(endSeconds)) {
        return { error: `clipEdits[${key}] must have numeric startSeconds and endSeconds` }
      }
      entry.startSeconds = startSeconds
      entry.endSeconds = endSeconds
    }

    if (record.grayscale !== undefined && record.grayscale !== null) {
      if (typeof record.grayscale !== 'boolean') {
        return { error: `clipEdits[${key}].grayscale must be a boolean` }
      }
      entry.grayscale = record.grayscale
    }

    if (entry.startSeconds === undefined && entry.grayscale === undefined) {
      return {
        error: `clipEdits[${key}] must include trim (startSeconds/endSeconds) and/or grayscale`,
      }
    }

    edits[key] = entry
  }

  return edits
}

function validateClipEdits(edits: Record<string, ClipEdit>): string | null {
  for (const [key, edit] of Object.entries(edits)) {
    if (edit.grayscale !== undefined && typeof edit.grayscale !== 'boolean') {
      return `clipEdits[${key}]: grayscale must be a boolean`
    }
    if (edit.startSeconds === undefined || edit.endSeconds === undefined) {
      continue
    }
    if (edit.startSeconds < 0) {
      return `clipEdits[${key}]: startSeconds must be >= 0`
    }
    if (edit.endSeconds <= edit.startSeconds) {
      return `clipEdits[${key}]: endSeconds must be greater than startSeconds (end is exclusive)`
    }
    if (edit.endSeconds - edit.startSeconds < 0.5) {
      return `clipEdits[${key}]: segment must be at least 0.5 seconds`
    }
  }
  return null
}

function parseOverlayCaption(raw: unknown): OverlayCaption | { error: string } | undefined {
  if (raw === undefined || raw === null) {
    return undefined
  }
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    return { error: 'overlayCaption must be an object' }
  }
  const record = raw as Record<string, unknown>
  const text = typeof record.text === 'string' ? record.text.trim() : ''
  if (!text) {
    // Empty text → omit overlay entirely (same as not sending the field).
    return undefined
  }
  if (text.length > 80) {
    return { error: 'overlayCaption.text must be 1–80 characters after trim' }
  }
  const position = String(record.position || '').trim().toLowerCase()
  if (!(OVERLAY_POSITIONS as readonly string[]).includes(position)) {
    return { error: `overlayCaption.position must be one of: ${OVERLAY_POSITIONS.join(', ')}` }
  }
  const scope = String(record.scope || '').trim().toLowerCase()
  if (!(OVERLAY_SCOPES as readonly string[]).includes(scope)) {
    return { error: `overlayCaption.scope must be one of: ${OVERLAY_SCOPES.join(', ')}` }
  }
  return {
    text,
    position: position as OverlayCaption['position'],
    scope: scope as OverlayCaption['scope'],
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as RenderRequest
    const clipKeys = Array.isArray(body.clipKeys)
      ? body.clipKeys.map((key) => (typeof key === 'string' ? key.trim() : '')).filter(Boolean)
      : []

    if (clipKeys.length < 1 || clipKeys.length > 8) {
      return NextResponse.json(
        { error: 'clipKeys must include between 1 and 8 S3 keys' },
        { status: 400 }
      )
    }

    for (const key of clipKeys) {
      if (!key.startsWith('celebrity_clips/') || !key.endsWith('.mp4')) {
        return NextResponse.json(
          { error: 'Each clip must be a celebrity_clips/*.mp4 key' },
          { status: 400 }
        )
      }
    }

    const aspectRatio = parseAspectRatio(
      body.aspectRatio ?? body.style?.aspectRatio ?? body.style?.aspect_ratio
    )
    if (!aspectRatio) {
      return NextResponse.json(
        {
          error: `aspectRatio must be one of: ${ALLOWED_ASPECT_RATIOS.join(', ')}`,
        },
        { status: 400 }
      )
    }

    const manualEdit = Boolean(body.manualEdit)
    let clipEdits: Record<string, ClipEdit> | undefined

    if (body.clipEdits != null) {
      const parsed = parseClipEdits(body.clipEdits, clipKeys)
      if ('error' in parsed) {
        return NextResponse.json({ error: parsed.error }, { status: 400 })
      }
      const validationError = validateClipEdits(parsed)
      if (validationError) {
        return NextResponse.json({ error: validationError }, { status: 400 })
      }
      clipEdits = parsed
    } else if (manualEdit) {
      return NextResponse.json(
        { error: 'manualEdit requires clipEdits as a Record keyed by s3_key' },
        { status: 400 }
      )
    }

    const overlayParsed = parseOverlayCaption(body.overlayCaption)
    if (overlayParsed && 'error' in overlayParsed) {
      return NextResponse.json({ error: overlayParsed.error }, { status: 400 })
    }
    const overlayCaption = overlayParsed

    const jobId = crypto.randomUUID()
    if (clipEdits) {
      console.log('[video-editor/render] forwarding clipEdits', JSON.stringify(clipEdits))
    }
    if (overlayCaption) {
      console.log(
        '[video-editor/render] forwarding overlayCaption',
        JSON.stringify(overlayCaption)
      )
    }
    const payload = {
      jobId,
      clipKeys,
      autoCaptions: Boolean(body.autoCaptions),
      manualEdit,
      clipEdits,
      overlayCaption,
      musicKey: body.musicKey?.trim() || undefined,
      celebrityName: body.celebrityName?.trim() || undefined,
      aspectRatio,
      style: {
        ...(body.style || {}),
        aspectRatio,
      },
    }

    const command = new InvokeCommand({
      FunctionName: FUNCTION_NAME,
      InvocationType: 'Event',
      Payload: Buffer.from(JSON.stringify(payload)),
    })

    const invokeResult = await lambdaClient.send(command)
    const accepted =
      typeof invokeResult.StatusCode === 'number' &&
      invokeResult.StatusCode >= 200 &&
      invokeResult.StatusCode < 300

    if (!accepted) {
      return NextResponse.json(
        {
          error: 'Failed to start memorial reel render',
          details: `Lambda invoke returned status ${invokeResult.StatusCode ?? 'unknown'}`,
        },
        { status: 502 }
      )
    }

    const estimatedDuration = clipKeys.length * (body.style?.max_clip_seconds ?? 4)

    return NextResponse.json(
      {
        jobId,
        status: 'processing',
        estimatedDuration,
        aspectRatio,
      },
      { status: 202 }
    )
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Failed to start memorial reel render',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
