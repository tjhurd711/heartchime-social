import { InvokeCommand, LambdaClient } from '@aws-sdk/client-lambda'
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  NoSuchKey,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'

const DEFAULT_BACKOFF_MS = [1000, 2000]
export const CHILD_TIMEOUT_MS = 5 * 60 * 1000

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

export async function invokeLambdaEventWithRetry(params: {
  lambdaClient: LambdaClient
  functionName: string
  payload: Record<string, unknown>
  maxAttempts?: number
  backoffMs?: number[]
}): Promise<void> {
  const maxAttempts = params.maxAttempts ?? 3
  const backoffMs = params.backoffMs ?? DEFAULT_BACKOFF_MS

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const result = await params.lambdaClient.send(
        new InvokeCommand({
          FunctionName: params.functionName,
          InvocationType: 'Event',
          Payload: Buffer.from(JSON.stringify(params.payload)),
        })
      )
      const statusCode = result.StatusCode || 0
      if (statusCode >= 200 && statusCode <= 299) return
      throw new Error(`Lambda invoke status code ${statusCode || 'unknown'}`)
    } catch (error) {
      if (attempt === maxAttempts) throw error
      const waitMs = backoffMs[attempt - 1] ?? backoffMs[backoffMs.length - 1] ?? 1000
      await sleep(waitMs)
    }
  }
}

export async function invokeChildrenInParallelWithRetry<T>(params: {
  lambdaClient: LambdaClient
  functionName: string
  children: T[]
  makePayload: (child: T, index: number) => Record<string, unknown>
}): Promise<number[]> {
  const results = await Promise.allSettled(
    params.children.map((child, index) =>
      invokeLambdaEventWithRetry({
        lambdaClient: params.lambdaClient,
        functionName: params.functionName,
        payload: params.makePayload(child, index),
      })
    )
  )

  return results.flatMap((result, index) => (result.status === 'rejected' ? [index] : []))
}

export async function objectExists(s3Client: S3Client, bucket: string, key: string): Promise<boolean> {
  try {
    await s3Client.send(
      new HeadObjectCommand({
        Bucket: bucket,
        Key: key,
      })
    )
    return true
  } catch {
    return false
  }
}

export async function readJsonObject<T>(
  s3Client: S3Client,
  bucket: string,
  key: string
): Promise<T | null> {
  try {
    const response = await s3Client.send(
      new GetObjectCommand({
        Bucket: bucket,
        Key: key,
      })
    )
    const body = await response.Body?.transformToString()
    if (!body) return null
    return JSON.parse(body) as T
  } catch (error) {
    if (error instanceof NoSuchKey) return null
    return null
  }
}

export async function writeJsonObject(params: {
  s3Client: S3Client
  bucket: string
  key: string
  value: unknown
}): Promise<void> {
  await params.s3Client.send(
    new PutObjectCommand({
      Bucket: params.bucket,
      Key: params.key,
      Body: JSON.stringify(params.value),
      ContentType: 'application/json',
    })
  )
}

export function hasTimedOut(startedAt: string, timeoutMs: number = CHILD_TIMEOUT_MS): boolean {
  const startedAtMs = Date.parse(startedAt)
  if (!Number.isFinite(startedAtMs)) return false
  return Date.now() - startedAtMs > timeoutMs
}

export function resolveFailedChildren(childJobIds: string[], childDone: boolean[]): string[] {
  return childJobIds.filter((_, index) => !childDone[index])
}

export type ClipPlanEntryType = 'generate' | 'reuse'

export interface ClipPlanEntry {
  type: ClipPlanEntryType
  // For 'generate' entries.
  childJobId?: string
  prompt?: string
  // For 'reuse' entries (existing Shared Video Library clips).
  key?: string
  bucket?: string
  durationSeconds?: number
}

export interface ReusedClipInput {
  key: string
  bucket?: string
  durationSeconds?: number
}

// Reused clips reference objects already produced by the social video
// pipeline. Restrict to the known output prefixes so a generation request
// can never be used to stitch arbitrary S3 objects into a downloadable video.
export function isReusableClipKey(key: unknown): key is string {
  if (typeof key !== 'string') return false
  const trimmed = key.trim()
  if (!trimmed.endsWith('.mp4')) return false
  return trimmed.startsWith('scenic-video/') || trimmed.startsWith('poem-video/')
}

export function normalizeReusedClips(
  input: unknown,
  defaultBucket: string,
  maxCount: number
): ReusedClipInput[] | { error: string } {
  if (input === undefined || input === null) return []
  if (!Array.isArray(input)) {
    return { error: 'reusedClips must be an array' }
  }
  if (input.length > maxCount) {
    return { error: `reusedClips supports at most ${maxCount} clips` }
  }

  const normalized: ReusedClipInput[] = []
  for (const raw of input) {
    const key = (raw && typeof raw === 'object' ? (raw as { key?: unknown }).key : raw) as unknown
    if (!isReusableClipKey(key)) {
      return { error: 'each reused clip must reference a valid scenic-video/ or poem-video/ .mp4 key' }
    }
    const bucketRaw =
      raw && typeof raw === 'object' ? (raw as { bucket?: unknown }).bucket : undefined
    const durationRaw =
      raw && typeof raw === 'object' ? (raw as { durationSeconds?: unknown }).durationSeconds : undefined
    const durationSeconds = Number(durationRaw)
    normalized.push({
      key: (key as string).trim(),
      bucket: typeof bucketRaw === 'string' && bucketRaw.trim() ? bucketRaw.trim() : defaultBucket,
      durationSeconds: Number.isFinite(durationSeconds) && durationSeconds > 0 ? durationSeconds : 8,
    })
  }
  return normalized
}

// Builds the ordered list of S3 keys passed to the stitch/mix lambdas.
// 'generate' entries resolve to the standard Veo child clip key; 'reuse'
// entries use the existing library key directly.
export function clipPlanToOrderedKeys(clips: ClipPlanEntry[]): string[] {
  return clips.map((clip) =>
    clip.type === 'reuse' ? String(clip.key) : `scenic-video/${clip.childJobId}/clip-0.mp4`
  )
}

export function generateEntriesFromPlan(clips: ClipPlanEntry[]): ClipPlanEntry[] {
  return clips.filter((clip) => clip.type === 'generate' && clip.childJobId)
}

interface ChildErrorMarker {
  jobId?: string
  error?: string
  failedAt?: string
}

export async function readChildErrorMarkers(params: {
  s3Client: S3Client
  bucket: string
  childJobIds: string[]
  errorKeyForChild?: (childJobId: string) => string
}): Promise<Array<{ childJobId: string; error: string }>> {
  const errorKeyForChild =
    params.errorKeyForChild ||
    ((childJobId: string) => `scenic-video/${childJobId}/error.json`)

  const markerResults = await Promise.all(
    params.childJobIds.map(async (childJobId) => {
      const key = errorKeyForChild(childJobId)
      const marker = await readJsonObject<ChildErrorMarker>(params.s3Client, params.bucket, key)
      if (!marker) return null
      return {
        childJobId,
        error: marker.error || 'no_video_output',
      }
    })
  )

  return markerResults.filter(
    (entry): entry is { childJobId: string; error: string } => entry !== null
  )
}

export async function invokeWithSentinel(params: {
  s3Client: S3Client
  bucket: string
  sentinelKey: string
  sentinelBody: Record<string, unknown>
  alreadyFired: boolean
  invoke: () => Promise<void>
}): Promise<void> {
  if (params.alreadyFired) return

  await writeJsonObject({
    s3Client: params.s3Client,
    bucket: params.bucket,
    key: params.sentinelKey,
    value: params.sentinelBody,
  })

  try {
    await params.invoke()
  } catch (error) {
    await params.s3Client.send(
      new DeleteObjectCommand({
        Bucket: params.bucket,
        Key: params.sentinelKey,
      })
    )
    throw error
  }
}
