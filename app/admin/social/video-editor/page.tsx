'use client'
/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Cormorant_Garamond, DM_Sans } from 'next/font/google'

const headingFont = Cormorant_Garamond({
  subsets: ['latin'],
  weight: ['600', '700'],
})

const bodyFont = DM_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '700'],
})

interface CelebrityClip {
  id: string
  celebrity_name: string
  video_id: string
  source_url: string
  phase: string
  s3_key: string | null
  status: string
  title: string | null
  search_query: string | null
  error: string | null
  previewUrl?: string | null
  duration_seconds?: number | null
  download_start_seconds?: number | null
  download_duration_seconds?: number | null
}

interface ReplaceCandidate {
  video_id: string
  title: string
  source_url: string
  search_query?: string
  duration_seconds?: number | null
  thumbnail_url?: string
  phase?: string
}

interface RenderResult {
  jobId: string
  url: string
  key: string
  duration: number
}

interface SendToDeviceResult {
  imported_count?: number
  note_created?: boolean
}

interface UploadedMusic {
  key: string
  fileName: string
}

/** Per-clip options keyed by s3_key. Trim optional; grayscale-only is valid. */
interface ClipEdit {
  startSeconds?: number
  endSeconds?: number
  grayscale?: boolean
}

type AspectRatio = '9:16' | '1:1' | '4:5' | '16:9'

const ASPECT_RATIO_OPTIONS: Array<{
  value: AspectRatio
  label: string
  size: string
  platforms: string
}> = [
  {
    value: '9:16',
    label: '9:16',
    size: '1080×1920',
    platforms: 'TikTok, Instagram Reels, YouTube Shorts, Facebook Reels, Snapchat',
  },
  {
    value: '1:1',
    label: '1:1',
    size: '1080×1080',
    platforms: 'Instagram feed, Facebook feed, LinkedIn',
  },
  {
    value: '4:5',
    label: '4:5',
    size: '1080×1350',
    platforms: 'Instagram feed (max height), Facebook feed',
  },
  {
    value: '16:9',
    label: '16:9',
    size: '1920×1080',
    platforms: 'YouTube, X/Twitter, LinkedIn, Facebook landscape',
  },
]

const POLL_MS = 4000
const MIN_REEL_CLIPS = 1
const MAX_REEL_CLIPS = 8
/** Sentinel id for the "+ Add clip" picker (not a real clip row). */
const ADD_CLIP_SLOT_ID = '__add__'

function defaultClipEdit(phase: string, maxClipSeconds: number): ClipEdit {
  if (phase === 'intro') {
    return { startSeconds: 0, endSeconds: 18, grayscale: false }
  }
  return { startSeconds: 0, endSeconds: maxClipSeconds, grayscale: false }
}

function ensureClipEdits(
  prev: Record<string, ClipEdit>,
  clips: CelebrityClip[],
  maxClipSeconds: number
): Record<string, ClipEdit> {
  const next = { ...prev }
  for (const clip of clips) {
    if (!clip.s3_key || clip.status !== 'ready') continue
    const defaults = defaultClipEdit(clip.phase, maxClipSeconds)
    const existing = next[clip.s3_key]
    if (!existing) {
      next[clip.s3_key] = defaults
      continue
    }
    // Preserve grayscale; fill missing trim when Manual edit is enabled.
    if (existing.startSeconds == null || existing.endSeconds == null) {
      next[clip.s3_key] = {
        ...defaults,
        ...existing,
        startSeconds: existing.startSeconds ?? defaults.startSeconds,
        endSeconds: existing.endSeconds ?? defaults.endSeconds,
      }
    }
  }
  return next
}

function validateClipEdit(edit: ClipEdit): string | null {
  if (edit.startSeconds == null || edit.endSeconds == null) return null
  if (edit.startSeconds < 0) return 'Start must be >= 0'
  if (edit.endSeconds <= edit.startSeconds) return 'End must be greater than start (end is exclusive)'
  if (edit.endSeconds - edit.startSeconds < 0.5) return 'Segment must be at least 0.5 seconds'
  return null
}

function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds)) return '—'
  const total = Math.max(0, Math.round(seconds))
  const mins = Math.floor(total / 60)
  const secs = total % 60
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

/** Parse mm:ss, m:ss, or plain seconds into a non-negative number. */
function parseTimeInput(raw: string): number | null {
  const text = raw.trim()
  if (!text) return null
  if (/^\d+(\.\d+)?$/.test(text)) {
    const value = Number(text)
    return Number.isFinite(value) && value >= 0 ? value : null
  }
  const match = text.match(/^(\d+):([0-5]?\d)(?:\.(\d+))?$/)
  if (!match) return null
  const mins = Number(match[1])
  const secs = Number(match[2])
  const frac = match[3] ? Number(`0.${match[3]}`) : 0
  if (!Number.isFinite(mins) || !Number.isFinite(secs)) return null
  return mins * 60 + secs + frac
}

/** Parse YouTube t= / start= query values (123, 123s, 2m5s). */
function parseYouTubeTimeParam(raw: string | null): number | null {
  if (!raw) return null
  const text = raw.trim()
  if (!text) return null
  if (/^\d+(\.\d+)?s?$/i.test(text)) {
    const value = Number(text.replace(/s$/i, ''))
    return Number.isFinite(value) && value >= 0 ? value : null
  }
  const compound = text.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+(?:\.\d+)?)s)?$/i)
  if (compound && (compound[1] || compound[2] || compound[3])) {
    const hours = Number(compound[1] || 0)
    const mins = Number(compound[2] || 0)
    const secs = Number(compound[3] || 0)
    return hours * 3600 + mins * 60 + secs
  }
  return parseTimeInput(text)
}

function formatSourceWindow(
  start: number | null | undefined,
  duration: number | null | undefined
): string | null {
  if (start == null || duration == null || !Number.isFinite(start) || !Number.isFinite(duration)) {
    return null
  }
  const end = start + duration
  return `Source: ${formatDuration(start)}–${formatDuration(end)}`
}

function slotKeyForClip(clip: CelebrityClip): string {
  return `${clip.phase}:${clip.id}`
}

/** Extract an 11-char YouTube video ID from common URL forms or a bare ID. */
function parseYouTubeVideoId(input: string): string | null {
  const raw = input.trim()
  if (!raw) return null
  if (/^[A-Za-z0-9_-]{11}$/.test(raw)) return raw

  try {
    const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`
    const url = new URL(withScheme)
    const host = url.hostname.replace(/^www\./, '').toLowerCase()

    if (host === 'youtu.be') {
      const id = url.pathname.split('/').filter(Boolean)[0] || ''
      return /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null
    }

    if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'music.youtube.com') {
      const v = url.searchParams.get('v')
      if (v && /^[A-Za-z0-9_-]{11}$/.test(v)) return v

      const parts = url.pathname.split('/').filter(Boolean)
      if (parts[0] === 'shorts' || parts[0] === 'embed' || parts[0] === 'live' || parts[0] === 'v') {
        const id = parts[1] || ''
        return /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null
      }
    }
  } catch {
    return null
  }
  return null
}

/** Prefill download start from ?t= / &start= / youtu.be?t= when present. */
function parseYouTubeStartFromUrl(input: string): number | null {
  const raw = input.trim()
  if (!raw) return null
  try {
    const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`
    const url = new URL(withScheme)
    const fromT = parseYouTubeTimeParam(url.searchParams.get('t'))
    if (fromT != null) return fromT
    const fromStart = parseYouTubeTimeParam(url.searchParams.get('start'))
    if (fromStart != null) return fromStart
    // youtu.be/ID?t=… already covered; also support #t= in hash
    const hash = url.hash.replace(/^#/, '')
    if (hash.startsWith('t=')) {
      return parseYouTubeTimeParam(hash.slice(2))
    }
  } catch {
    return null
  }
  return null
}

export default function VideoEditorPage() {
  const [celebrityName, setCelebrityName] = useState('')
  const [knownNames, setKnownNames] = useState<string[]>([])
  const [clips, setClips] = useState<CelebrityClip[]>([])
  const [fetching, setFetching] = useState(false)
  const [fetchStatus, setFetchStatus] = useState('')
  const [renderJobId, setRenderJobId] = useState('')
  const [rendering, setRendering] = useState(false)
  const [renderStatus, setRenderStatus] = useState('')
  const [result, setResult] = useState<RenderResult | null>(null)
  const [music, setMusic] = useState<UploadedMusic | null>(null)
  const [isUploadingMusic, setIsUploadingMusic] = useState(false)
  const [maxClipSeconds, setMaxClipSeconds] = useState(4)
  const [xfadeSeconds, setXfadeSeconds] = useState(0.4)
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('9:16')
  const [autoCaptions, setAutoCaptions] = useState(true)
  const [manualEdit, setManualEdit] = useState(false)
  const [clipEdits, setClipEdits] = useState<Record<string, ClipEdit>>({})
  const [overlayCaptionText, setOverlayCaptionText] = useState('')
  const [overlayCaptionPosition, setOverlayCaptionPosition] = useState<
    'top' | 'middle' | 'bottom'
  >('bottom')
  const [overlayCaptionScope, setOverlayCaptionScope] = useState<'full' | 'intro'>('full')
  const [error, setError] = useState<string | null>(null)
  const [deviceNoteText, setDeviceNoteText] = useState('')
  const [isSendingToDevice, setIsSendingToDevice] = useState(false)
  const [sendToDeviceResult, setSendToDeviceResult] = useState<SendToDeviceResult | null>(null)

  const readyClips = useMemo(
    () => clips.filter((clip) => clip.status === 'ready' && clip.s3_key),
    [clips]
  )
  const reelClipCountOk =
    readyClips.length >= MIN_REEL_CLIPS && readyClips.length <= MAX_REEL_CLIPS
  const canAddClip = clips.length < MAX_REEL_CLIPS
  const canDeleteClip = clips.length > MIN_REEL_CLIPS

  const loadKnownNames = useCallback(async () => {
    try {
      const response = await fetch('/api/admin/social/celebrity-videos?listNames=true')
      const data = await response.json()
      if (response.ok && Array.isArray(data.names)) {
        setKnownNames(data.names)
      }
    } catch {
      // non-fatal
    }
  }, [])

  const loadClips = useCallback(async (name: string) => {
    const response = await fetch(
      `/api/admin/social/celebrity-videos?celebrityName=${encodeURIComponent(name)}`
    )
    const data = await response.json()
    if (!response.ok) {
      throw new Error(data?.details || data?.error || 'Failed to load clips')
    }
    const nextClips: CelebrityClip[] = Array.isArray(data.clips) ? data.clips : []
    setClips(nextClips)
    return {
      readyCount: Number(data.readyCount ?? 0),
      selectedCount: Number(data.selectedCount ?? 0),
      failedErrors: nextClips
        .filter((clip) => clip.status === 'failed' && clip.error)
        .map((clip) => (clip.error as string).split('\n').find((line) => line.includes('ERROR:'))?.replace('ERROR: ', '') || (clip.error as string).slice(0, 200)),
    }
  }, [])

  const [localFetchAvailable, setLocalFetchAvailable] = useState(false)
  const [replacingClipId, setReplacingClipId] = useState<string | null>(null)
  /** Session exclusion memory: celebrity → video IDs already used/rejected. */
  const [excludedByCelebrity, setExcludedByCelebrity] = useState<Record<string, string[]>>({})
  /** Per-slot rotating query index for Replace variants. */
  const [replaceQueryIndexBySlot, setReplaceQueryIndexBySlot] = useState<Record<string, number>>({})
  const [candidatePickerClipId, setCandidatePickerClipId] = useState<string | null>(null)
  const [replaceCandidates, setReplaceCandidates] = useState<ReplaceCandidate[]>([])
  const [replaceCandidatesQuery, setReplaceCandidatesQuery] = useState<string | null>(null)
  const [loadingCandidatesFor, setLoadingCandidatesFor] = useState<string | null>(null)
  const [manualUrlByClipId, setManualUrlByClipId] = useState<Record<string, string>>({})
  const [manualUrlErrorByClipId, setManualUrlErrorByClipId] = useState<Record<string, string>>({})
  const [replaceErrorByClipId, setReplaceErrorByClipId] = useState<Record<string, string>>({})
  const [downloadStartByClipId, setDownloadStartByClipId] = useState<Record<string, string>>({})
  const [downloadDurationByClipId, setDownloadDurationByClipId] = useState<Record<string, string>>(
    {}
  )
  const [removingClipId, setRemovingClipId] = useState<string | null>(null)

  function rememberExcludedIds(name: string, ids: Array<string | null | undefined>) {
    const clean = ids.map((id) => String(id || '').trim()).filter(Boolean)
    if (!clean.length) return
    setExcludedByCelebrity((prev) => {
      const existing = prev[name] || []
      return { ...prev, [name]: Array.from(new Set([...existing, ...clean])) }
    })
  }

  function excludeIdsForCelebrity(
    name: string,
    currentClip?: CelebrityClip,
    extraIds: string[] = []
  ): string[] {
    const session = excludedByCelebrity[name] || []
    const loaded = clips.map((clip) => clip.video_id).filter(Boolean)
    return Array.from(
      new Set(
        [...session, ...loaded, currentClip?.video_id, ...extraIds].filter(Boolean) as string[]
      )
    )
  }

  function nextQueryIndexForSlot(slotKey: string): number {
    return replaceQueryIndexBySlot[slotKey] ?? 0
  }

  function advanceQueryIndex(slotKey: string, usedIndex: number) {
    setReplaceQueryIndexBySlot((prev) => ({
      ...prev,
      [slotKey]: usedIndex + 1,
    }))
  }

  useEffect(() => {
    void loadKnownNames()
    void fetch('/api/admin/social/celebrity-videos/local-fetch')
      .then((response) => response.json())
      .then((data: { available?: boolean }) => setLocalFetchAvailable(Boolean(data.available)))
      .catch(() => setLocalFetchAvailable(false))
  }, [loadKnownNames])

  useEffect(() => {
    if (!manualEdit) return
    setClipEdits((prev) => ensureClipEdits(prev, clips, maxClipSeconds))
  }, [manualEdit, clips, maxClipSeconds])

  useEffect(() => {
    const name = celebrityName.trim()
    if (!name || clips.length === 0) return
    rememberExcludedIds(
      name,
      clips.map((clip) => clip.video_id)
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps -- seed exclusions when clip set changes
  }, [clips, celebrityName])

  function updateClipEdit(s3Key: string, patch: Partial<ClipEdit>) {
    setClipEdits((prev) => {
      const current =
        prev[s3Key] ??
        (manualEdit ? defaultClipEdit('clip', maxClipSeconds) : { grayscale: false })
      return { ...prev, [s3Key]: { ...current, ...patch } }
    })
  }

  async function handleFetchClipsViaEcs() {
    const name = celebrityName.trim()
    if (!name) {
      setError('Enter a celebrity name first.')
      return
    }

    setError(null)
    setResult(null)
    setSendToDeviceResult(null)
    setFetching(true)
    setFetchStatus('Starting ECS fetch (yt-dlp on cele-zip-processing)...')

    try {
      const response = await fetch('/api/admin/social/celebrity-videos/ecs-fetch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ celebrityName: name, download: true }),
      })
      const data = await response.json()
      if (!response.ok) {
        throw new Error(data?.details || data?.error || 'Failed to start ECS fetch')
      }

      const startedAt = Date.now()
      while (Date.now() - startedAt < 10 * 60 * 1000) {
        setFetchStatus('ECS task running — polling Supabase for ready clips...')
        await new Promise((resolve) => setTimeout(resolve, POLL_MS))
        const status = await loadClips(name)
        if (status.readyCount >= 3) {
          setFetchStatus(`Ready — ${status.readyCount} clips on S3 (via ECS).`)
          break
        }
        if (status.selectedCount >= 3 && status.readyCount > 0 && Date.now() - startedAt > 45_000) {
          setFetchStatus(`${status.readyCount}/${status.selectedCount} clips ready via ECS.`)
          break
        }
      }
      await loadKnownNames()
    } catch (ecsError) {
      setError(ecsError instanceof Error ? ecsError.message : 'Failed ECS fetch')
      setFetchStatus('')
    } finally {
      setFetching(false)
    }
  }

  async function handleFetchClipsLocally() {
    const name = celebrityName.trim()
    if (!name) {
      setError('Enter a celebrity name first.')
      return
    }

    setError(null)
    setResult(null)
    setSendToDeviceResult(null)
    setFetching(true)
    setFetchStatus('Fetching on this PC (local yt-dlp + your cookies)... This may take 1–2 minutes.')

    try {
      const response = await fetch('/api/admin/social/celebrity-videos/local-fetch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ celebrityName: name }),
      })
      const data = await response.json()
      if (!response.ok) {
        throw new Error(data?.error || data?.details || 'Local fetch failed')
      }

      await loadClips(name)
      const readyCount = Number(data.readyCount ?? 0)
      if (readyCount >= 3) {
        setFetchStatus(`Ready — ${readyCount} clips on S3 (fetched locally).`)
      } else {
        setFetchStatus(`${readyCount} clip(s) ready.`)
      }
      await loadKnownNames()
    } catch (localError) {
      setError(localError instanceof Error ? localError.message : 'Local fetch failed')
      setFetchStatus('')
      await loadClips(name).catch(() => undefined)
    } finally {
      setFetching(false)
    }
  }

  async function openReplaceCandidates(clip: CelebrityClip) {
    const name = celebrityName.trim()
    if (!name) {
      setError('Enter a celebrity name first.')
      return
    }

    const slotKey = slotKeyForClip(clip)
    const queryIndex = nextQueryIndexForSlot(slotKey)
    const extraExclude = [clip.video_id, ...clips.map((row) => row.video_id)]
    rememberExcludedIds(name, extraExclude)

    setError(null)
    setLoadingCandidatesFor(clip.id)
    setCandidatePickerClipId(clip.id)
    setReplaceCandidates([])
    setReplaceCandidatesQuery(null)

    try {
      const response = await fetch('/api/admin/social/celebrity-videos/replace-clip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clipId: clip.id,
          celebrityName: name,
          phase: clip.phase,
          excludeIds: excludeIdsForCelebrity(name, clip, extraExclude),
          queryIndex,
          candidatesOnly: true,
          maxCandidates: 10,
        }),
      })
      const data = await response.json()
      if (!response.ok) {
        throw new Error(data?.error || data?.details || 'Failed to load replace candidates')
      }

      const candidates = Array.isArray(data.candidates) ? (data.candidates as ReplaceCandidate[]) : []
      setReplaceCandidates(candidates)
      setReplaceCandidatesQuery(
        typeof data.searchQuery === 'string'
          ? data.searchQuery
          : typeof data.querySuffix === 'string'
            ? `${name} ${data.querySuffix}`
            : null
      )
      const usedIndex = Number.isFinite(Number(data.queryIndex))
        ? Number(data.queryIndex)
        : queryIndex
      advanceQueryIndex(slotKey, usedIndex)

      if (candidates.length === 0) {
        setError('No more results for this slot — try another celebrity or clear exclusions by refreshing clips.')
      }
    } catch (replaceError) {
      setError(
        replaceError instanceof Error ? replaceError.message : 'Failed to load replace candidates'
      )
      setCandidatePickerClipId(null)
    } finally {
      setLoadingCandidatesFor(null)
    }
  }

  async function commitReplaceClip(
    clip: CelebrityClip,
    options?: { pickVideoId?: string; manualVideoId?: string; surpriseMe?: boolean }
  ) {
    const name = celebrityName.trim()
    if (!name) {
      setError('Enter a celebrity name first.')
      return
    }

    const startRaw = (downloadStartByClipId[clip.id] || '').trim()
    const durationRaw = (downloadDurationByClipId[clip.id] || '').trim()
    let downloadStart: number | undefined
    let downloadDuration: number | undefined

    if (startRaw) {
      const parsedStart = parseTimeInput(startRaw)
      if (parsedStart == null) {
        const message = 'Download start must be seconds or mm:ss (e.g. 125 or 2:05).'
        setReplaceErrorByClipId((prev) => ({ ...prev, [clip.id]: message }))
        setError(message)
        return
      }
      downloadStart = parsedStart
    }
    if (durationRaw) {
      const parsedDuration = Number(durationRaw)
      if (!Number.isFinite(parsedDuration) || parsedDuration < 1 || parsedDuration > 120) {
        const message = 'Download duration must be between 1 and 120 seconds.'
        setReplaceErrorByClipId((prev) => ({ ...prev, [clip.id]: message }))
        setError(message)
        return
      }
      downloadDuration = parsedDuration
    }

    const slotKey = slotKeyForClip(clip)
    const queryIndex = nextQueryIndexForSlot(slotKey)
    const extraExclude = [clip.video_id, ...clips.map((row) => row.video_id)]
    rememberExcludedIds(name, extraExclude)

    setError(null)
    setReplaceErrorByClipId((prev) => {
      const next = { ...prev }
      delete next[clip.id]
      return next
    })
    setReplacingClipId(clip.id)

    try {
      const response = await fetch('/api/admin/social/celebrity-videos/replace-clip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clipId: clip.id,
          celebrityName: name,
          phase: clip.phase,
          excludeIds: excludeIdsForCelebrity(name, clip, extraExclude),
          queryIndex,
          pickVideoId: options?.pickVideoId,
          manualVideoId: options?.manualVideoId,
          maxCandidates: 10,
          ...(downloadStart != null ? { downloadStart } : {}),
          ...(downloadDuration != null ? { downloadDuration } : {}),
        }),
      })
      const data = await response.json()
      if (!response.ok) {
        throw new Error(data?.error || data?.details || 'Replace failed')
      }

      const newClip = data.clip as CelebrityClip
      if (!newClip?.video_id) {
        throw new Error('Replace succeeded but no clip returned')
      }

      rememberExcludedIds(name, [clip.video_id, newClip.video_id])
      const usedIndex = Number.isFinite(Number(data.queryIndex))
        ? Number(data.queryIndex)
        : queryIndex
      // Manual URL does not rotate search variants; surprise-me does.
      if (!options?.manualVideoId && (options?.surpriseMe || !options?.pickVideoId)) {
        advanceQueryIndex(slotKey, usedIndex)
      }

      setClips((prev) => prev.map((row) => (row.id === clip.id ? newClip : row)))
      setCandidatePickerClipId(null)
      setReplaceCandidates([])
      setReplaceCandidatesQuery(null)
      setManualUrlByClipId((prev) => {
        const next = { ...prev }
        delete next[clip.id]
        return next
      })
      setManualUrlErrorByClipId((prev) => {
        const next = { ...prev }
        delete next[clip.id]
        return next
      })
      setDownloadStartByClipId((prev) => {
        const next = { ...prev }
        delete next[clip.id]
        return next
      })
      setDownloadDurationByClipId((prev) => {
        const next = { ...prev }
        delete next[clip.id]
        return next
      })
    } catch (replaceError) {
      const message = replaceError instanceof Error ? replaceError.message : 'Replace failed'
      setReplaceErrorByClipId((prev) => ({ ...prev, [clip.id]: message }))
      setError(message)
    } finally {
      setReplacingClipId(null)
    }
  }

  function handleManualUrlFetch(clip: CelebrityClip) {
    const raw = manualUrlByClipId[clip.id] || ''
    const videoId = parseYouTubeVideoId(raw)
    if (!videoId) {
      setManualUrlErrorByClipId((prev) => ({
        ...prev,
        [clip.id]:
          'Enter a valid YouTube URL (watch, youtu.be, shorts) or an 11-character video ID.',
      }))
      return
    }
    setManualUrlErrorByClipId((prev) => {
      const next = { ...prev }
      delete next[clip.id]
      return next
    })
    void commitReplaceClip(clip, { manualVideoId: videoId })
  }

  async function handleSurpriseReplace(clip: CelebrityClip) {
    await commitReplaceClip(clip, { surpriseMe: true })
  }

  function readDownloadWindowForSlot(slotId: string): {
    downloadStart?: number
    downloadDuration?: number
    error?: string
  } {
    const startRaw = (downloadStartByClipId[slotId] || '').trim()
    const durationRaw = (downloadDurationByClipId[slotId] || '').trim()
    let downloadStart: number | undefined
    let downloadDuration: number | undefined

    if (startRaw) {
      const parsedStart = parseTimeInput(startRaw)
      if (parsedStart == null) {
        return { error: 'Download start must be seconds or mm:ss (e.g. 125 or 2:05).' }
      }
      downloadStart = parsedStart
    }
    if (durationRaw) {
      const parsedDuration = Number(durationRaw)
      if (!Number.isFinite(parsedDuration) || parsedDuration < 1 || parsedDuration > 120) {
        return { error: 'Download duration must be between 1 and 120 seconds.' }
      }
      downloadDuration = parsedDuration
    }
    return { downloadStart, downloadDuration }
  }

  function clearPickerFields(slotId: string) {
    setManualUrlByClipId((prev) => {
      const next = { ...prev }
      delete next[slotId]
      return next
    })
    setManualUrlErrorByClipId((prev) => {
      const next = { ...prev }
      delete next[slotId]
      return next
    })
    setDownloadStartByClipId((prev) => {
      const next = { ...prev }
      delete next[slotId]
      return next
    })
    setDownloadDurationByClipId((prev) => {
      const next = { ...prev }
      delete next[slotId]
      return next
    })
    setReplaceErrorByClipId((prev) => {
      const next = { ...prev }
      delete next[slotId]
      return next
    })
  }

  async function handleDeleteClip(clip: CelebrityClip) {
    const name = celebrityName.trim()
    if (!name) {
      setError('Enter a celebrity name first.')
      return
    }
    if (!canDeleteClip) {
      setError('Cannot delete the last remaining clip.')
      return
    }
    const label = clip.phase === 'intro' ? 'Intro' : 'Highlight'
    if (
      !window.confirm(
        `Remove this ${label} from the reel?\n\n${clip.title || clip.video_id}\n\nS3 file is kept; Refresh will not bring it back.`
      )
    ) {
      return
    }

    setError(null)
    setRemovingClipId(clip.id)
    try {
      const response = await fetch('/api/admin/social/celebrity-videos/remove-clip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clipId: clip.id, celebrityName: name }),
      })
      const data = await response.json()
      if (!response.ok) {
        throw new Error(data?.error || data?.details || 'Failed to remove clip')
      }

      if (clip.s3_key) {
        setClipEdits((prev) => {
          const next = { ...prev }
          delete next[clip.s3_key as string]
          return next
        })
      }
      if (candidatePickerClipId === clip.id) {
        setCandidatePickerClipId(null)
        setReplaceCandidates([])
        setReplaceCandidatesQuery(null)
      }
      await loadClips(name)
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Failed to remove clip')
    } finally {
      setRemovingClipId(null)
    }
  }

  async function openAddClipCandidates() {
    const name = celebrityName.trim()
    if (!name) {
      setError('Enter a celebrity name first.')
      return
    }
    if (!canAddClip) {
      setError(`Maximum ${MAX_REEL_CLIPS} clips per reel.`)
      return
    }

    const slotKey = `add:${name}`
    const queryIndex = nextQueryIndexForSlot(slotKey)
    rememberExcludedIds(
      name,
      clips.map((row) => row.video_id)
    )

    setError(null)
    setLoadingCandidatesFor(ADD_CLIP_SLOT_ID)
    setCandidatePickerClipId(ADD_CLIP_SLOT_ID)
    setReplaceCandidates([])
    setReplaceCandidatesQuery(null)

    try {
      const response = await fetch('/api/admin/social/celebrity-videos/add-clip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          celebrityName: name,
          excludeIds: excludeIdsForCelebrity(name),
          queryIndex,
          candidatesOnly: true,
          maxCandidates: 10,
        }),
      })
      const data = await response.json()
      if (!response.ok) {
        throw new Error(data?.error || data?.details || 'Failed to load add-clip candidates')
      }

      const candidates = Array.isArray(data.candidates) ? (data.candidates as ReplaceCandidate[]) : []
      setReplaceCandidates(candidates)
      setReplaceCandidatesQuery(
        typeof data.searchQuery === 'string'
          ? data.searchQuery
          : typeof data.querySuffix === 'string'
            ? `${name} ${data.querySuffix}`
            : null
      )
      const usedIndex = Number.isFinite(Number(data.queryIndex))
        ? Number(data.queryIndex)
        : queryIndex
      advanceQueryIndex(slotKey, usedIndex)

      if (candidates.length === 0) {
        setError('No more results to add — try a manual YouTube URL.')
      }
    } catch (addError) {
      setError(addError instanceof Error ? addError.message : 'Failed to open add-clip picker')
      setCandidatePickerClipId(null)
    } finally {
      setLoadingCandidatesFor(null)
    }
  }

  async function commitAddClip(options?: {
    pickVideoId?: string
    manualVideoId?: string
    surpriseMe?: boolean
  }) {
    const name = celebrityName.trim()
    if (!name) {
      setError('Enter a celebrity name first.')
      return
    }
    if (!canAddClip) {
      setError(`Maximum ${MAX_REEL_CLIPS} clips per reel.`)
      return
    }

    const window = readDownloadWindowForSlot(ADD_CLIP_SLOT_ID)
    if (window.error) {
      setReplaceErrorByClipId((prev) => ({ ...prev, [ADD_CLIP_SLOT_ID]: window.error as string }))
      setError(window.error)
      return
    }

    const slotKey = `add:${name}`
    const queryIndex = nextQueryIndexForSlot(slotKey)
    rememberExcludedIds(
      name,
      clips.map((row) => row.video_id)
    )

    setError(null)
    setReplaceErrorByClipId((prev) => {
      const next = { ...prev }
      delete next[ADD_CLIP_SLOT_ID]
      return next
    })
    setReplacingClipId(ADD_CLIP_SLOT_ID)

    try {
      const response = await fetch('/api/admin/social/celebrity-videos/add-clip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          celebrityName: name,
          excludeIds: excludeIdsForCelebrity(name),
          queryIndex,
          pickVideoId: options?.pickVideoId,
          manualVideoId: options?.manualVideoId,
          maxCandidates: 10,
          ...(window.downloadStart != null ? { downloadStart: window.downloadStart } : {}),
          ...(window.downloadDuration != null ? { downloadDuration: window.downloadDuration } : {}),
        }),
      })
      const data = await response.json()
      if (!response.ok) {
        throw new Error(data?.error || data?.details || 'Add clip failed')
      }

      const newClip = data.clip as CelebrityClip
      if (!newClip?.video_id) {
        throw new Error('Add succeeded but no clip returned')
      }

      rememberExcludedIds(name, [newClip.video_id])
      const usedIndex = Number.isFinite(Number(data.queryIndex))
        ? Number(data.queryIndex)
        : queryIndex
      if (!options?.manualVideoId && (options?.surpriseMe || !options?.pickVideoId)) {
        advanceQueryIndex(slotKey, usedIndex)
      }

      setClips((prev) => [...prev, newClip])
      setClipEdits((prev) => ensureClipEdits(prev, [newClip], maxClipSeconds))
      setCandidatePickerClipId(null)
      setReplaceCandidates([])
      setReplaceCandidatesQuery(null)
      clearPickerFields(ADD_CLIP_SLOT_ID)
    } catch (addError) {
      const message = addError instanceof Error ? addError.message : 'Add clip failed'
      setReplaceErrorByClipId((prev) => ({ ...prev, [ADD_CLIP_SLOT_ID]: message }))
      setError(message)
    } finally {
      setReplacingClipId(null)
    }
  }

  function handleManualUrlAdd() {
    const raw = manualUrlByClipId[ADD_CLIP_SLOT_ID] || ''
    const videoId = parseYouTubeVideoId(raw)
    if (!videoId) {
      setManualUrlErrorByClipId((prev) => ({
        ...prev,
        [ADD_CLIP_SLOT_ID]:
          'Enter a valid YouTube URL (watch, youtu.be, shorts) or an 11-character video ID.',
      }))
      return
    }
    setManualUrlErrorByClipId((prev) => {
      const next = { ...prev }
      delete next[ADD_CLIP_SLOT_ID]
      return next
    })
    void commitAddClip({ manualVideoId: videoId })
  }

  async function handleFetchClips() {
    const name = celebrityName.trim()
    if (!name) {
      setError('Enter a celebrity name first.')
      return
    }

    setError(null)
    setResult(null)
    setSendToDeviceResult(null)
    setFetching(true)
    setFetchStatus('Starting YouTube fetch...')

    try {
      const response = await fetch('/api/admin/social/celebrity-videos/fetch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ celebrityName: name, download: true }),
      })
      const data = await response.json()
      if (!response.ok) {
        throw new Error(data?.details || data?.error || 'Failed to start clip fetch')
      }

      const startedAt = Date.now()
      let lastStatus = { readyCount: 0, selectedCount: 0, failedErrors: [] as string[] }
      while (Date.now() - startedAt < 8 * 60 * 1000) {
        setFetchStatus('Fetching clips from YouTube and uploading to S3...')
        await new Promise((resolve) => setTimeout(resolve, POLL_MS))
        lastStatus = await loadClips(name)
        if (lastStatus.readyCount >= 3) {
          setFetchStatus(`Ready — ${lastStatus.readyCount} clips on S3.`)
          break
        }
        if (lastStatus.selectedCount >= 3 && lastStatus.readyCount > 0 && Date.now() - startedAt > 30_000) {
          setFetchStatus(`${lastStatus.readyCount}/${lastStatus.selectedCount} clips ready (some may still be downloading).`)
          break
        }
        if (lastStatus.failedErrors.length > 0 && lastStatus.readyCount === 0 && Date.now() - startedAt > 20_000) {
          break
        }
      }
      if (lastStatus.readyCount === 0) {
        if (lastStatus.failedErrors.some((msg) => msg.includes('Sign in to confirm'))) {
          setError(
            'YouTube blocked the download from AWS. Export Chrome cookies and upload to S3 — see heartchime-social/scripts/YOUTUBE-COOKIES.md — or try Fetch via ECS.'
          )
        } else if (lastStatus.failedErrors.length > 0) {
          setError(lastStatus.failedErrors[0] || 'All clip downloads failed.')
        } else if (lastStatus.selectedCount === 0) {
          setError(
            'No clips were saved. Enable YouTube Data API v3 for your Google API key (APIs & Services → Library → YouTube Data API v3 → Enable), then try again.'
          )
        } else {
          setError('Clips were found but none finished downloading. Try Fetch via ECS or check Lambda logs.')
        }
      }
      await loadKnownNames()
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : 'Failed to fetch clips')
      setFetchStatus('')
    } finally {
      setFetching(false)
    }
  }

  async function handleRefreshClips() {
    const name = celebrityName.trim()
    if (!name) return
    setError(null)
    try {
      await loadClips(name)
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : 'Failed to refresh clips')
    }
  }

  async function handleMusicSelected(fileList: FileList | null) {
    const file = fileList?.[0]
    if (!file) return
    if (!file.type.startsWith('audio/')) {
      setError('Music upload must be an audio file.')
      return
    }

    const jobId = renderJobId || crypto.randomUUID()
    if (!renderJobId) setRenderJobId(jobId)

    setError(null)
    setIsUploadingMusic(true)
    try {
      const response = await fetch('/api/memorial-video/upload-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobId,
          fileName: file.name,
          contentType: file.type,
          kind: 'music',
        }),
      })
      const data = await response.json()
      if (!response.ok) {
        throw new Error(data?.error || 'Failed to create upload URL')
      }
      const uploadResponse = await fetch(data.uploadUrl, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': file.type || 'application/octet-stream' },
      })
      if (!uploadResponse.ok) {
        throw new Error('Failed uploading music to S3')
      }
      setMusic({ key: data.key, fileName: file.name })
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'Failed to upload music')
    } finally {
      setIsUploadingMusic(false)
    }
  }

  async function pollRenderStatus(jobId: string): Promise<RenderResult> {
    const startedAt = Date.now()
    while (Date.now() - startedAt < 8 * 60 * 1000) {
      const elapsed = Math.round((Date.now() - startedAt) / 1000)
      setRenderStatus(`Rendering reel... (${elapsed}s)`)
      await new Promise((resolve) => setTimeout(resolve, POLL_MS))

      const response = await fetch(
        `/api/admin/social/video-editor/render-status?jobId=${encodeURIComponent(jobId)}`
      )
      const data = await response.json()
      if (!response.ok) {
        throw new Error(data?.details || data?.error || 'Failed to check render status')
      }
      if (data?.status === 'failed') {
        throw new Error(data?.details || data?.error || 'Render failed')
      }
      if (data?.status === 'ready' && data.url && data.key) {
        return {
          jobId,
          url: data.url,
          key: data.key,
          duration: Number(data.duration ?? 0),
        }
      }
    }
    throw new Error('Render timed out. Check Lambda logs or try again.')
  }

  async function handleGenerateReel() {
    const name = celebrityName.trim()
    if (!name) {
      setError('Enter a celebrity name.')
      return
    }
    if (!reelClipCountOk) {
      setError(
        readyClips.length < MIN_REEL_CLIPS
          ? 'Fetch clips first — need at least one ready S3 clip.'
          : `Too many clips — keep between ${MIN_REEL_CLIPS} and ${MAX_REEL_CLIPS}.`
      )
      return
    }

    setError(null)
    setResult(null)
    setSendToDeviceResult(null)
    setRendering(true)
    setRenderStatus('Starting render...')

    const clipRows = [...readyClips]
      .sort((a, b) => {
        if (a.phase === 'intro' && b.phase !== 'intro') return -1
        if (b.phase === 'intro' && a.phase !== 'intro') return 1
        return 0
      })

    try {
      if (manualEdit) {
        for (const clip of clipRows) {
          const s3Key = clip.s3_key
          if (!s3Key) continue
          const edit = clipEdits[s3Key]
          if (!edit) continue
          const validationError = validateClipEdit(edit)
          if (validationError) {
            throw new Error(
              `${clip.phase === 'intro' ? 'Intro' : 'Clip'} (${clip.title || clip.video_id}): ${validationError}`
            )
          }
        }
      }

      const payloadClipEdits: Record<string, ClipEdit> = {}
      for (const clip of clipRows) {
        const s3Key = clip.s3_key
        if (!s3Key) continue
        const edit = clipEdits[s3Key]
        if (!edit) continue

        const entry: ClipEdit = {}
        if (manualEdit && edit.startSeconds != null && edit.endSeconds != null) {
          entry.startSeconds = Number(edit.startSeconds) || 0
          entry.endSeconds = Number(edit.endSeconds) || 0
        }
        if (edit.grayscale) {
          entry.grayscale = true
        }
        if (entry.grayscale || entry.startSeconds != null) {
          payloadClipEdits[s3Key] = entry
        }
      }
      const hasClipEdits = Object.keys(payloadClipEdits).length > 0
      if (hasClipEdits) {
        console.log('[video-editor] clipEdits payload', payloadClipEdits)
      }

      const overlayText = overlayCaptionText.trim().slice(0, 80)
      const overlayCaption = overlayText
        ? {
            text: overlayText,
            position: overlayCaptionPosition,
            scope: overlayCaptionScope,
          }
        : undefined

      const renderBody = {
        celebrityName: name,
        clipKeys: clipRows.map((clip) => clip.s3_key),
        autoCaptions,
        manualEdit,
        clipEdits: hasClipEdits ? payloadClipEdits : undefined,
        overlayCaption,
        musicKey: music?.key,
        aspectRatio,
        style: {
          max_clip_seconds: maxClipSeconds,
          xfade_seconds: xfadeSeconds,
          aspectRatio,
        },
      }
      if (hasClipEdits) {
        console.log('[video-editor] render body clipEdits', renderBody.clipEdits)
      }
      if (overlayCaption) {
        console.log('[video-editor] render body overlayCaption', overlayCaption)
      }

      const response = await fetch('/api/admin/social/video-editor/render', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(renderBody),
      })
      const data = await response.json()
      if (!response.ok) {
        throw new Error(data?.details || data?.error || 'Failed to start render')
      }
      const jobId = String(data.jobId || '')
      if (!jobId) throw new Error('No job id returned')
      setRenderJobId(jobId)
      const finished = await pollRenderStatus(jobId)
      setResult(finished)
      setRenderStatus('')
    } catch (renderError) {
      setError(renderError instanceof Error ? renderError.message : 'Failed to render reel')
      setRenderStatus('')
    } finally {
      setRendering(false)
    }
  }

  async function handleSendToDevice() {
    if (!result?.url) {
      setError('Generate the memorial reel first, then send to iPhone.')
      return
    }

    setError(null)
    setIsSendingToDevice(true)
    setSendToDeviceResult(null)

    try {
      const response = await fetch('/api/admin/social/send-to-device', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          post_id: result.jobId,
          trend_name: 'Memorial Reel',
          album_name: 'HC-Business',
          slides: [
            {
              order: 1,
              image_url: result.url,
              overlay_text: deviceNoteText.trim(),
            },
          ],
        }),
      })

      const data = await response.json()
      if (!response.ok) {
        throw new Error(data?.details || data?.error || 'Failed to send to iPhone')
      }

      setSendToDeviceResult({
        imported_count: data.imported_count,
        note_created: data.note_created,
      })
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : 'Failed to send to iPhone')
    } finally {
      setIsSendingToDevice(false)
    }
  }

  return (
    <div className={`${bodyFont.className} min-h-screen bg-[#0b1120] text-[#f8f1df]`}>
      <div className="mx-auto max-w-6xl px-6 py-8">
        <div className="mb-8 rounded-2xl border border-[#d4af37]/30 bg-[#121a2d] p-6">
          <p className="text-xs uppercase tracking-[0.2em] text-[#d4af37]">Admin Social</p>
          <h1 className={`${headingFont.className} mt-2 text-4xl font-semibold text-[#f8f1df]`}>
            Short-Form Reel Editor
          </h1>
          <p className="mt-3 max-w-3xl text-sm text-[#f8f1df]/80">
            Fetch short celebrity clips from YouTube, review them, then stitch an emotional edit in your
            chosen aspect ratio. The intro is auto-trimmed to the best 15–20s segment (Whisper + Claude).
            Intro keeps its audio; highlight clips play muted under your music bed. Optional animated
            captions use the same Whisper timestamps on the intro only.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <section className="rounded-2xl border border-[#d4af37]/20 bg-[#121a2d] p-6">
            <h2 className={`${headingFont.className} text-2xl text-[#f8f1df]`}>1) Fetch clips</h2>
            <label className="mt-4 block text-sm text-[#f8f1df]/85">
              Celebrity name
              <input
                list="celebrity-names"
                value={celebrityName}
                onChange={(event) => setCelebrityName(event.target.value)}
                placeholder="e.g. Robin Williams"
                className="mt-2 w-full rounded-lg border border-[#d4af37]/30 bg-[#0f172a] px-3 py-2 text-sm text-[#f8f1df] focus:outline-none focus:ring-2 focus:ring-[#d4af37]/40"
              />
              <datalist id="celebrity-names">
                {knownNames.map((name) => (
                  <option key={name} value={name} />
                ))}
              </datalist>
            </label>

            <div className="mt-4 flex flex-wrap gap-3">
              {localFetchAvailable ? (
                <button
                  type="button"
                  onClick={() => void handleFetchClipsLocally()}
                  disabled={fetching || rendering}
                  className="rounded-lg bg-[#d4af37] px-4 py-2 text-sm font-semibold text-[#0b1120] hover:bg-[#e2c462] disabled:opacity-50"
                >
                  {fetching ? 'Fetching...' : 'Fetch locally (this PC)'}
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => void handleFetchClips()}
                disabled={fetching || rendering}
                className={`rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50 ${
                  localFetchAvailable
                    ? 'border border-[#d4af37]/40 text-[#f8f1df] hover:bg-[#1a2440]'
                    : 'bg-[#d4af37] text-[#0b1120] hover:bg-[#e2c462]'
                }`}
              >
                {fetching ? 'Fetching...' : 'Fetch from YouTube (AWS)'}
              </button>
              <button
                type="button"
                onClick={() => void handleRefreshClips()}
                disabled={fetching || !celebrityName.trim()}
                className="rounded-lg border border-[#d4af37]/40 px-4 py-2 text-sm text-[#f8f1df] disabled:opacity-50"
              >
                Refresh
              </button>
              <button
                type="button"
                onClick={() => void handleFetchClipsViaEcs()}
                disabled={fetching || rendering}
                className="rounded-lg border border-[#d4af37]/40 px-4 py-2 text-sm text-[#f8f1df] hover:bg-[#1a2440] disabled:opacity-50"
              >
                {fetching ? 'Working...' : 'Fetch via ECS'}
              </button>
            </div>
            <p className="mt-2 text-xs text-[#f8f1df]/55">
              {localFetchAvailable
                ? 'Use Fetch locally while running npm run dev. Needs youtube-cookies.txt in Downloads. AWS fetch often hits YouTube bot blocks.'
                : 'Use ECS when Lambda yt-dlp fails (cluster cele-zip-processing).'}
            </p>
            {fetchStatus ? <p className="mt-3 text-sm text-[#d4af37]">{fetchStatus}</p> : null}

            <div className="mt-6 space-y-3">
              {clips.length === 0 ? (
                <p className="rounded-lg border border-dashed border-[#d4af37]/25 p-4 text-sm text-[#f8f1df]/65">
                  No clips loaded yet.
                </p>
              ) : (
                clips.map((clip) => {
                  const sourceWindowLabel = formatSourceWindow(
                    clip.download_start_seconds,
                    clip.download_duration_seconds
                  )
                  return (
                  <div key={clip.id} className="rounded-xl border border-[#d4af37]/25 bg-[#0f172a] p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                              clip.phase === 'intro'
                                ? 'bg-[#d4af37]/25 text-[#e2c462]'
                                : 'bg-[#f8f1df]/10 text-[#f8f1df]/70'
                            }`}
                          >
                            {clip.phase === 'intro' ? 'Intro' : 'Highlight'}
                          </span>
                          <p className="text-sm font-medium text-[#f8f1df]">
                            {clip.title || clip.video_id}
                          </p>
                        </div>
                        <p className="text-xs text-[#f8f1df]/60">{clip.status}</p>
                        {sourceWindowLabel ? (
                          <p className="text-xs text-[#d4af37]/80">
                            {sourceWindowLabel}
                            <span className="text-[#f8f1df]/45">
                              {' '}
                              (Manual edit uses 0–{formatDuration(clip.duration_seconds)} of this
                              file)
                            </span>
                          </p>
                        ) : null}
                        <a
                          href={clip.source_url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs text-[#d4af37] hover:underline"
                        >
                          YouTube source
                        </a>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`rounded-full px-2 py-1 text-xs ${
                            clip.status === 'ready'
                              ? 'bg-green-500/20 text-green-300'
                              : clip.status === 'failed'
                                ? 'bg-red-500/20 text-red-300'
                                : 'bg-amber-500/20 text-amber-300'
                          }`}
                        >
                          {clip.status}
                        </span>
                        <button
                          type="button"
                          onClick={() => void handleDeleteClip(clip)}
                          disabled={
                            fetching ||
                            rendering ||
                            replacingClipId !== null ||
                            removingClipId !== null ||
                            loadingCandidatesFor !== null ||
                            !canDeleteClip
                          }
                          className="rounded-lg border border-red-400/40 px-2 py-1 text-xs text-red-300 hover:bg-red-500/10 disabled:opacity-50"
                          title={
                            !canDeleteClip
                              ? 'Cannot delete the last remaining clip'
                              : 'Remove from reel (keeps S3 file)'
                          }
                        >
                          {removingClipId === clip.id ? 'Removing…' : 'Delete'}
                        </button>
                        {localFetchAvailable ? (
                          <>
                            <button
                              type="button"
                              onClick={() => void openReplaceCandidates(clip)}
                              disabled={
                                fetching ||
                                rendering ||
                                replacingClipId !== null ||
                                loadingCandidatesFor !== null ||
                                (clip.phase !== 'intro' && clip.phase !== 'clip')
                              }
                              className="rounded-lg border border-[#d4af37]/40 px-2 py-1 text-xs text-[#f8f1df] hover:bg-[#1a2440] disabled:opacity-50"
                            >
                              {loadingCandidatesFor === clip.id ? 'Searching…' : 'Replace'}
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleSurpriseReplace(clip)}
                              disabled={
                                fetching ||
                                rendering ||
                                replacingClipId !== null ||
                                loadingCandidatesFor !== null ||
                                (clip.phase !== 'intro' && clip.phase !== 'clip')
                              }
                              className="rounded-lg border border-[#d4af37]/25 px-2 py-1 text-xs text-[#d4af37] hover:bg-[#1a2440] disabled:opacity-50"
                              title="Auto-pick the next non-excluded result"
                            >
                              {replacingClipId === clip.id ? 'Replacing…' : 'Surprise me'}
                            </button>
                          </>
                        ) : null}
                      </div>
                    </div>
                    {candidatePickerClipId === clip.id ? (
                      <div className="mt-3 rounded-xl border border-[#d4af37]/30 bg-[#121a2d] p-3">
                        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <p className="text-xs font-medium text-[#f8f1df]">Pick a replacement</p>
                            {replaceCandidatesQuery ? (
                              <p className="text-[11px] text-[#f8f1df]/55">
                                Query: {replaceCandidatesQuery}
                              </p>
                            ) : null}
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setCandidatePickerClipId(null)
                              setReplaceCandidates([])
                              setReplaceCandidatesQuery(null)
                            }}
                            className="text-[11px] text-[#f8f1df]/60 hover:text-[#f8f1df]"
                          >
                            Close
                          </button>
                        </div>
                        {loadingCandidatesFor === clip.id ? (
                          <p className="text-xs text-[#d4af37]">Loading candidates…</p>
                        ) : replaceCandidates.length === 0 ? (
                          <p className="text-xs text-red-300">
                            No more results — all matches were excluded. Try Surprise me on another
                            query, or fetch a different celebrity.
                          </p>
                        ) : (
                          <div className="space-y-2">
                            {replaceCandidates.map((candidate) => (
                              <button
                                key={candidate.video_id}
                                type="button"
                                disabled={replacingClipId !== null}
                                onClick={() =>
                                  void commitReplaceClip(clip, { pickVideoId: candidate.video_id })
                                }
                                className="flex w-full items-center gap-3 rounded-lg border border-[#d4af37]/20 bg-[#0f172a] p-2 text-left hover:border-[#d4af37]/50 disabled:opacity-50"
                              >
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={
                                    candidate.thumbnail_url ||
                                    `https://i.ytimg.com/vi/${candidate.video_id}/hqdefault.jpg`
                                  }
                                  alt=""
                                  className="h-14 w-24 flex-shrink-0 rounded object-cover bg-black"
                                />
                                <span className="min-w-0 flex-1">
                                  <span className="block truncate text-xs font-medium text-[#f8f1df]">
                                    {candidate.title || candidate.video_id}
                                  </span>
                                  <span className="mt-0.5 block text-[11px] text-[#f8f1df]/55">
                                    {formatDuration(candidate.duration_seconds)} ·{' '}
                                    {candidate.video_id}
                                  </span>
                                </span>
                              </button>
                            ))}
                          </div>
                        )}

                        <div className="mt-3 border-t border-[#d4af37]/20 pt-3">
                          <p className="text-xs font-medium text-[#f8f1df]">Download window</p>
                          <p className="mt-0.5 text-[11px] text-[#f8f1df]/50">
                            Which part of the source video to pull. Trim precisely afterward with
                            Manual edit. Leave empty for the first 20s.
                          </p>
                          <div className="mt-2 flex flex-wrap gap-2">
                            <label className="block min-w-[7rem] flex-1 text-[11px] text-[#f8f1df]/65">
                              Start (mm:ss)
                              <input
                                type="text"
                                inputMode="numeric"
                                placeholder="0:00"
                                value={downloadStartByClipId[clip.id] || ''}
                                onChange={(event) =>
                                  setDownloadStartByClipId((prev) => ({
                                    ...prev,
                                    [clip.id]: event.target.value,
                                  }))
                                }
                                disabled={replacingClipId !== null}
                                className="mt-0.5 w-full rounded-lg border border-[#d4af37]/30 bg-[#0f172a] px-2 py-1.5 text-xs text-[#f8f1df] placeholder:text-[#f8f1df]/35 focus:outline-none focus:ring-2 focus:ring-[#d4af37]/40 disabled:opacity-50"
                              />
                            </label>
                            <label className="block min-w-[7rem] flex-1 text-[11px] text-[#f8f1df]/65">
                              Duration (s)
                              <input
                                type="number"
                                min={1}
                                max={120}
                                step={1}
                                placeholder="20"
                                value={downloadDurationByClipId[clip.id] || ''}
                                onChange={(event) =>
                                  setDownloadDurationByClipId((prev) => ({
                                    ...prev,
                                    [clip.id]: event.target.value,
                                  }))
                                }
                                disabled={replacingClipId !== null}
                                className="mt-0.5 w-full rounded-lg border border-[#d4af37]/30 bg-[#0f172a] px-2 py-1.5 text-xs text-[#f8f1df] placeholder:text-[#f8f1df]/35 focus:outline-none focus:ring-2 focus:ring-[#d4af37]/40 disabled:opacity-50"
                              />
                            </label>
                          </div>
                        </div>

                        <div className="mt-3 border-t border-[#d4af37]/20 pt-3">
                          <p className="text-xs font-medium text-[#f8f1df]">Paste YouTube URL</p>
                          <p className="mt-0.5 text-[11px] text-[#f8f1df]/50">
                            Local fetch only — watch, youtu.be, shorts, or an 11-character video ID.
                            URLs with ?t= prefill start above.
                          </p>
                          <div className="mt-2 flex flex-wrap gap-2">
                            <input
                              type="text"
                              value={manualUrlByClipId[clip.id] || ''}
                              onChange={(event) => {
                                const value = event.target.value
                                setManualUrlByClipId((prev) => ({ ...prev, [clip.id]: value }))
                                setManualUrlErrorByClipId((prev) => {
                                  const next = { ...prev }
                                  delete next[clip.id]
                                  return next
                                })
                                const fromUrl = parseYouTubeStartFromUrl(value)
                                if (fromUrl != null) {
                                  setDownloadStartByClipId((prev) => ({
                                    ...prev,
                                    [clip.id]: formatDuration(fromUrl),
                                  }))
                                }
                              }}
                              onKeyDown={(event) => {
                                if (event.key === 'Enter') {
                                  event.preventDefault()
                                  handleManualUrlFetch(clip)
                                }
                              }}
                              placeholder="https://www.youtube.com/watch?v=…&t=125s"
                              disabled={replacingClipId !== null}
                              className="min-w-0 flex-1 rounded-lg border border-[#d4af37]/30 bg-[#0f172a] px-2 py-1.5 text-xs text-[#f8f1df] placeholder:text-[#f8f1df]/35 focus:outline-none focus:ring-2 focus:ring-[#d4af37]/40 disabled:opacity-50"
                            />
                            <button
                              type="button"
                              onClick={() => handleManualUrlFetch(clip)}
                              disabled={replacingClipId !== null || !(manualUrlByClipId[clip.id] || '').trim()}
                              className="rounded-lg bg-[#d4af37] px-3 py-1.5 text-xs font-semibold text-[#0b1120] hover:bg-[#e2c462] disabled:opacity-50"
                            >
                              {replacingClipId === clip.id ? 'Fetching…' : 'Fetch'}
                            </button>
                          </div>
                          {manualUrlErrorByClipId[clip.id] ? (
                            <p className="mt-1.5 text-[11px] text-red-300">
                              {manualUrlErrorByClipId[clip.id]}
                            </p>
                          ) : null}
                          {replaceErrorByClipId[clip.id] ? (
                            <p className="mt-1.5 text-[11px] text-red-300">
                              {replaceErrorByClipId[clip.id]}
                            </p>
                          ) : null}
                        </div>
                      </div>
                    ) : null}
                    {clip.previewUrl ? (
                      <video
                        className="mt-3 w-full max-w-xs rounded-lg border border-[#d4af37]/20"
                        style={
                          clip.s3_key && clipEdits[clip.s3_key]?.grayscale
                            ? { filter: 'grayscale(1)' }
                            : undefined
                        }
                        controls
                        src={clip.previewUrl}
                        onLoadedMetadata={(event) => {
                          if (!manualEdit || !clip.s3_key) return
                          const video = event.currentTarget
                          const edit = clipEdits[clip.s3_key]
                          if (edit && Number.isFinite(edit.startSeconds)) {
                            video.currentTime = edit.startSeconds as number
                          }
                        }}
                      />
                    ) : null}
                    {clip.status === 'ready' && clip.s3_key ? (
                      <label className="mt-3 flex items-center gap-2 text-xs text-[#f8f1df]/75">
                        <input
                          type="checkbox"
                          checked={Boolean(clipEdits[clip.s3_key]?.grayscale)}
                          onChange={(event) =>
                            updateClipEdit(clip.s3_key as string, {
                              grayscale: event.target.checked,
                            })
                          }
                          className="rounded border-[#d4af37]/40"
                        />
                        Grayscale
                      </label>
                    ) : null}
                    {manualEdit && clip.status === 'ready' && clip.s3_key ? (
                      <div className="mt-3 grid gap-3 sm:grid-cols-3">
                        <label className="block text-xs text-[#f8f1df]/75">
                          Start (s)
                          <input
                            type="number"
                            min={0}
                            step={0.1}
                            value={clipEdits[clip.s3_key]?.startSeconds ?? 0}
                            onChange={(event) =>
                              updateClipEdit(clip.s3_key as string, {
                                startSeconds: Number(event.target.value) || 0,
                              })
                            }
                            className="mt-1 w-full rounded-lg border border-[#d4af37]/30 bg-[#0f172a] px-2 py-1.5 text-sm"
                          />
                        </label>
                        <label className="block text-xs text-[#f8f1df]/75">
                          End (s, exclusive)
                          <input
                            type="number"
                            min={0.5}
                            step={0.1}
                            value={clipEdits[clip.s3_key]?.endSeconds ?? maxClipSeconds}
                            onChange={(event) =>
                              updateClipEdit(clip.s3_key as string, {
                                endSeconds: Number(event.target.value) || 0.5,
                              })
                            }
                            className="mt-1 w-full rounded-lg border border-[#d4af37]/30 bg-[#0f172a] px-2 py-1.5 text-sm"
                          />
                        </label>
                        <div className="flex flex-col justify-end text-xs text-[#f8f1df]/60">
                          <span>
                            Duration:{' '}
                            {(
                              (clipEdits[clip.s3_key]?.endSeconds ?? 0) -
                              (clipEdits[clip.s3_key]?.startSeconds ?? 0)
                            ).toFixed(1)}
                            s
                          </span>
                          {clipEdits[clip.s3_key] &&
                          validateClipEdit(clipEdits[clip.s3_key]) ? (
                            <span className="mt-1 text-red-300">
                              {validateClipEdit(clipEdits[clip.s3_key])}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    ) : null}
                    {clip.error ? (
                      <p className="mt-2 text-xs text-red-300">
                        {clip.error.includes('ERROR:')
                          ? clip.error.split('\n').find((line) => line.includes('ERROR:'))?.replace(/^ERROR:\s*/, '') || clip.error.slice(0, 200)
                          : clip.error.slice(0, 200)}
                      </p>
                    ) : null}
                  </div>
                  )
                })
              )}

              {localFetchAvailable && celebrityName.trim() ? (
                <div className="space-y-2">
                  <button
                    type="button"
                    onClick={() => void openAddClipCandidates()}
                    disabled={
                      fetching ||
                      rendering ||
                      replacingClipId !== null ||
                      removingClipId !== null ||
                      loadingCandidatesFor !== null ||
                      !canAddClip
                    }
                    className="w-full rounded-xl border border-dashed border-[#d4af37]/40 px-4 py-3 text-sm font-medium text-[#d4af37] hover:bg-[#1a2440] disabled:opacity-50"
                  >
                    {loadingCandidatesFor === ADD_CLIP_SLOT_ID
                      ? 'Searching…'
                      : canAddClip
                        ? '+ Add clip'
                        : `Maximum ${MAX_REEL_CLIPS} clips`}
                  </button>

                  {candidatePickerClipId === ADD_CLIP_SLOT_ID ? (
                    <div className="rounded-xl border border-[#d4af37]/30 bg-[#121a2d] p-3">
                      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="text-xs font-medium text-[#f8f1df]">
                            Add highlight clip
                          </p>
                          {replaceCandidatesQuery ? (
                            <p className="text-[11px] text-[#f8f1df]/55">
                              Query: {replaceCandidatesQuery}
                            </p>
                          ) : null}
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setCandidatePickerClipId(null)
                            setReplaceCandidates([])
                            setReplaceCandidatesQuery(null)
                          }}
                          className="text-[11px] text-[#f8f1df]/60 hover:text-[#f8f1df]"
                        >
                          Close
                        </button>
                      </div>
                      {loadingCandidatesFor === ADD_CLIP_SLOT_ID ? (
                        <p className="text-xs text-[#d4af37]">Loading candidates…</p>
                      ) : replaceCandidates.length === 0 ? (
                        <p className="text-xs text-[#f8f1df]/55">
                          No search results — paste a YouTube URL below.
                        </p>
                      ) : (
                        <div className="space-y-2">
                          {replaceCandidates.map((candidate) => (
                            <button
                              key={candidate.video_id}
                              type="button"
                              disabled={replacingClipId !== null}
                              onClick={() =>
                                void commitAddClip({ pickVideoId: candidate.video_id })
                              }
                              className="flex w-full items-center gap-3 rounded-lg border border-[#d4af37]/20 bg-[#0f172a] p-2 text-left hover:border-[#d4af37]/50 disabled:opacity-50"
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={
                                  candidate.thumbnail_url ||
                                  `https://i.ytimg.com/vi/${candidate.video_id}/hqdefault.jpg`
                                }
                                alt=""
                                className="h-14 w-24 flex-shrink-0 rounded object-cover bg-black"
                              />
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-xs font-medium text-[#f8f1df]">
                                  {candidate.title || candidate.video_id}
                                </span>
                                <span className="mt-0.5 block text-[11px] text-[#f8f1df]/55">
                                  {formatDuration(candidate.duration_seconds)} ·{' '}
                                  {candidate.video_id}
                                </span>
                              </span>
                            </button>
                          ))}
                        </div>
                      )}

                      <div className="mt-3 border-t border-[#d4af37]/20 pt-3">
                        <p className="text-xs font-medium text-[#f8f1df]">Download window</p>
                        <p className="mt-0.5 text-[11px] text-[#f8f1df]/50">
                          Which part of the source video to pull. Leave empty for the first 20s.
                        </p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          <label className="block min-w-[7rem] flex-1 text-[11px] text-[#f8f1df]/65">
                            Start (mm:ss)
                            <input
                              type="text"
                              inputMode="numeric"
                              placeholder="0:00"
                              value={downloadStartByClipId[ADD_CLIP_SLOT_ID] || ''}
                              onChange={(event) =>
                                setDownloadStartByClipId((prev) => ({
                                  ...prev,
                                  [ADD_CLIP_SLOT_ID]: event.target.value,
                                }))
                              }
                              disabled={replacingClipId !== null}
                              className="mt-0.5 w-full rounded-lg border border-[#d4af37]/30 bg-[#0f172a] px-2 py-1.5 text-xs text-[#f8f1df] placeholder:text-[#f8f1df]/35 focus:outline-none focus:ring-2 focus:ring-[#d4af37]/40 disabled:opacity-50"
                            />
                          </label>
                          <label className="block min-w-[7rem] flex-1 text-[11px] text-[#f8f1df]/65">
                            Duration (s)
                            <input
                              type="number"
                              min={1}
                              max={120}
                              step={1}
                              placeholder="20"
                              value={downloadDurationByClipId[ADD_CLIP_SLOT_ID] || ''}
                              onChange={(event) =>
                                setDownloadDurationByClipId((prev) => ({
                                  ...prev,
                                  [ADD_CLIP_SLOT_ID]: event.target.value,
                                }))
                              }
                              disabled={replacingClipId !== null}
                              className="mt-0.5 w-full rounded-lg border border-[#d4af37]/30 bg-[#0f172a] px-2 py-1.5 text-xs text-[#f8f1df] placeholder:text-[#f8f1df]/35 focus:outline-none focus:ring-2 focus:ring-[#d4af37]/40 disabled:opacity-50"
                            />
                          </label>
                        </div>
                      </div>

                      <div className="mt-3 border-t border-[#d4af37]/20 pt-3">
                        <p className="text-xs font-medium text-[#f8f1df]">Paste YouTube URL</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          <input
                            type="text"
                            value={manualUrlByClipId[ADD_CLIP_SLOT_ID] || ''}
                            onChange={(event) => {
                              const value = event.target.value
                              setManualUrlByClipId((prev) => ({
                                ...prev,
                                [ADD_CLIP_SLOT_ID]: value,
                              }))
                              setManualUrlErrorByClipId((prev) => {
                                const next = { ...prev }
                                delete next[ADD_CLIP_SLOT_ID]
                                return next
                              })
                              const fromUrl = parseYouTubeStartFromUrl(value)
                              if (fromUrl != null) {
                                setDownloadStartByClipId((prev) => ({
                                  ...prev,
                                  [ADD_CLIP_SLOT_ID]: formatDuration(fromUrl),
                                }))
                              }
                            }}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter') {
                                event.preventDefault()
                                handleManualUrlAdd()
                              }
                            }}
                            placeholder="https://www.youtube.com/watch?v=…&t=125s"
                            disabled={replacingClipId !== null}
                            className="min-w-0 flex-1 rounded-lg border border-[#d4af37]/30 bg-[#0f172a] px-2 py-1.5 text-xs text-[#f8f1df] placeholder:text-[#f8f1df]/35 focus:outline-none focus:ring-2 focus:ring-[#d4af37]/40 disabled:opacity-50"
                          />
                          <button
                            type="button"
                            onClick={() => handleManualUrlAdd()}
                            disabled={
                              replacingClipId !== null ||
                              !(manualUrlByClipId[ADD_CLIP_SLOT_ID] || '').trim()
                            }
                            className="rounded-lg bg-[#d4af37] px-3 py-1.5 text-xs font-semibold text-[#0b1120] hover:bg-[#e2c462] disabled:opacity-50"
                          >
                            {replacingClipId === ADD_CLIP_SLOT_ID ? 'Fetching…' : 'Fetch'}
                          </button>
                        </div>
                        {manualUrlErrorByClipId[ADD_CLIP_SLOT_ID] ? (
                          <p className="mt-1.5 text-[11px] text-red-300">
                            {manualUrlErrorByClipId[ADD_CLIP_SLOT_ID]}
                          </p>
                        ) : null}
                        {replaceErrorByClipId[ADD_CLIP_SLOT_ID] ? (
                          <p className="mt-1.5 text-[11px] text-red-300">
                            {replaceErrorByClipId[ADD_CLIP_SLOT_ID]}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          </section>

          <section className="space-y-6">
            <div className="rounded-2xl border border-[#d4af37]/20 bg-[#121a2d] p-6">
              <h2 className={`${headingFont.className} text-2xl text-[#f8f1df]`}>2) Style + music</h2>
              <label className="mt-4 flex items-center gap-2 text-sm text-[#f8f1df]/85">
                <input
                  type="checkbox"
                  checked={manualEdit}
                  onChange={(event) => setManualEdit(event.target.checked)}
                />
                Manual edit (choose in/out per clip)
              </label>
              {!manualEdit ? (
                <label className="mt-4 block text-sm text-[#f8f1df]/85">
                  Max seconds per clip
                  <input
                    type="number"
                    min={1}
                    step={0.5}
                    value={maxClipSeconds}
                    onChange={(event) => setMaxClipSeconds(Number(event.target.value) || 4)}
                    className="mt-2 w-full rounded-lg border border-[#d4af37]/30 bg-[#0f172a] px-3 py-2 text-sm"
                  />
                </label>
              ) : null}
              <label className="mt-4 block text-sm text-[#f8f1df]/85">
                Crossfade (seconds)
                <input
                  type="number"
                  min={0}
                  step={0.1}
                  value={xfadeSeconds}
                  onChange={(event) => setXfadeSeconds(Number(event.target.value) || 0.4)}
                  className="mt-2 w-full rounded-lg border border-[#d4af37]/30 bg-[#0f172a] px-3 py-2 text-sm"
                />
              </label>

              <fieldset className="mt-5">
                <legend className="text-sm text-[#f8f1df]/85">Aspect ratio</legend>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {ASPECT_RATIO_OPTIONS.map((option) => {
                    const selected = aspectRatio === option.value
                    return (
                      <label
                        key={option.value}
                        className={`cursor-pointer rounded-xl border px-3 py-3 transition-colors ${
                          selected
                            ? 'border-[#d4af37] bg-[#d4af37]/10'
                            : 'border-[#d4af37]/25 bg-[#0f172a] hover:border-[#d4af37]/45'
                        }`}
                      >
                        <span className="flex items-center gap-2">
                          <input
                            type="radio"
                            name="aspect-ratio"
                            value={option.value}
                            checked={selected}
                            onChange={() => setAspectRatio(option.value)}
                            className="accent-[#d4af37]"
                          />
                          <span className="text-sm font-medium text-[#f8f1df]">
                            {option.label}{' '}
                            <span className="font-normal text-[#f8f1df]/55">({option.size})</span>
                          </span>
                        </span>
                      </label>
                    )
                  })}
                </div>
                <p className="mt-2 text-xs text-[#d4af37]/80">
                  {ASPECT_RATIO_OPTIONS.find((option) => option.value === aspectRatio)?.platforms}
                </p>
              </fieldset>

              <label className="mt-4 flex items-center gap-2 text-sm text-[#f8f1df]/85">
                <input
                  type="checkbox"
                  checked={autoCaptions}
                  onChange={(event) => setAutoCaptions(event.target.checked)}
                />
                Burn animated captions on intro
              </label>
              <p className="mt-1 text-xs text-[#f8f1df]/55">
                {manualEdit
                  ? 'Set start and exclusive end seconds on each clip card. Missing entries fall back to auto trim. Intro keeps audio; highlights stay muted.'
                  : 'Intro segment is auto-picked (~15–20s). Highlights use the first few seconds, muted under music.'}
              </p>

              <div className="mt-5 rounded-xl border border-[#d4af37]/25 bg-[#0f172a] p-4">
                <p className="text-sm font-medium text-[#f8f1df]">Caption overlay (optional)</p>
                <p className="mt-1 text-xs text-[#f8f1df]/55">
                  Static text burned on the reel (separate from Whisper intro captions). Leave empty
                  to skip. Bottom + auto-captions may overlap — prefer Top/Middle when both are on.
                </p>
                <label className="mt-3 block text-xs text-[#f8f1df]/75">
                  Text
                  <input
                    type="text"
                    maxLength={80}
                    value={overlayCaptionText}
                    onChange={(event) => setOverlayCaptionText(event.target.value.slice(0, 80))}
                    placeholder="In loving memory…"
                    className="mt-1 w-full rounded-lg border border-[#d4af37]/30 bg-[#121a2d] px-3 py-2 text-sm text-[#f8f1df] placeholder:text-[#f8f1df]/35"
                  />
                  <span className="mt-1 block text-right text-[11px] text-[#f8f1df]/45">
                    {overlayCaptionText.trim().length}/80
                  </span>
                </label>

                <p className="mt-2 text-xs text-[#f8f1df]/75">Position</p>
                <div className="mt-1.5 flex overflow-hidden rounded-lg border border-[#d4af37]/30">
                  {(['top', 'middle', 'bottom'] as const).map((pos) => (
                    <button
                      key={pos}
                      type="button"
                      onClick={() => setOverlayCaptionPosition(pos)}
                      className={`flex-1 px-3 py-2 text-xs font-medium capitalize ${
                        overlayCaptionPosition === pos
                          ? 'bg-[#d4af37] text-[#0b1120]'
                          : 'bg-transparent text-[#f8f1df]/75 hover:bg-[#1a2440]'
                      }`}
                    >
                      {pos}
                    </button>
                  ))}
                </div>

                <p className="mt-3 text-xs text-[#f8f1df]/75">Duration</p>
                <div className="mt-1.5 space-y-1.5">
                  <label className="flex items-center gap-2 text-xs text-[#f8f1df]/80">
                    <input
                      type="radio"
                      name="overlay-scope"
                      checked={overlayCaptionScope === 'full'}
                      onChange={() => setOverlayCaptionScope('full')}
                      className="accent-[#d4af37]"
                    />
                    Whole reel
                  </label>
                  <label className="flex items-center gap-2 text-xs text-[#f8f1df]/80">
                    <input
                      type="radio"
                      name="overlay-scope"
                      checked={overlayCaptionScope === 'intro'}
                      onChange={() => setOverlayCaptionScope('intro')}
                      className="accent-[#d4af37]"
                    />
                    Intro only
                  </label>
                </div>
              </div>

              <div className="mt-5">
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-[#d4af37]/40 bg-[#1a2440] px-4 py-2 text-sm font-medium text-[#f8f1df] hover:bg-[#223058]">
                  <span>{isUploadingMusic ? 'Uploading music...' : 'Upload optional music'}</span>
                  <input
                    type="file"
                    accept="audio/*"
                    className="hidden"
                    disabled={isUploadingMusic || rendering}
                    onChange={(event) => void handleMusicSelected(event.target.files)}
                  />
                </label>
                {music ? (
                  <p className="mt-2 text-xs text-[#f8f1df]/70">{music.fileName}</p>
                ) : null}
              </div>
            </div>

            <div className="rounded-2xl border border-[#d4af37]/20 bg-[#121a2d] p-6">
              <h2 className={`${headingFont.className} text-2xl text-[#f8f1df]`}>3) Generate reel</h2>
              <p className="mt-2 text-sm text-[#f8f1df]/70">
                {readyClips.length} ready clip{readyClips.length === 1 ? '' : 's'} will be stitched in
                order (intro first). Use {MIN_REEL_CLIPS}–{MAX_REEL_CLIPS} clips.
              </p>
              {!reelClipCountOk ? (
                <p className="mt-2 text-sm text-amber-300">
                  {readyClips.length < MIN_REEL_CLIPS
                    ? 'Need at least 1 ready clip to generate.'
                    : `Too many clips (${readyClips.length}). Delete down to ${MAX_REEL_CLIPS} or fewer.`}
                </p>
              ) : null}
              <button
                type="button"
                onClick={() => void handleGenerateReel()}
                disabled={rendering || fetching || !reelClipCountOk}
                className="mt-4 w-full rounded-lg bg-[#d4af37] px-4 py-3 text-sm font-semibold text-[#0b1120] hover:bg-[#e2c462] disabled:opacity-50"
              >
                {rendering ? 'Generating...' : 'Generate memorial reel'}
              </button>
              {renderStatus ? <p className="mt-3 text-sm text-[#d4af37]">{renderStatus}</p> : null}
              {error ? <p className="mt-3 text-sm text-red-300">{error}</p> : null}
            </div>
          </section>
        </div>

        {result ? (
          <section className="mt-8 rounded-2xl border border-[#d4af37]/30 bg-[#121a2d] p-6">
            <h2 className={`${headingFont.className} text-3xl text-[#f8f1df]`}>Generated reel</h2>
            <p className="mt-2 text-sm text-[#f8f1df]/75">
              Job <span className="font-mono">{result.jobId}</span> · {result.duration.toFixed(1)}s
            </p>
            <video
              className="mt-4 mx-auto max-h-[70vh] rounded-xl border border-[#d4af37]/25 bg-black"
              controls
              src={result.url}
            />
            <div className="mt-4 flex flex-wrap gap-3">
              <a
                href={result.url}
                download
                target="_blank"
                rel="noreferrer"
                className="rounded-lg bg-[#d4af37] px-4 py-2 text-sm font-semibold text-[#0b1120]"
              >
                Download MP4
              </a>
            </div>
          </section>
        ) : null}

        {result ? (
          <section className="mt-6 rounded-2xl border border-[#d4af37]/30 bg-[#121a2d] p-6">
            <h2 className={`${headingFont.className} text-2xl text-[#f8f1df]`}>Send to iPhone</h2>
            <p className="mt-2 text-sm text-[#f8f1df]/75">
              Sends the finished memorial reel and optional note text using the existing device-delivery flow.
            </p>
            <label className="mt-4 block text-sm text-[#f8f1df]/85">
              Note text (optional)
              <textarea
                value={deviceNoteText}
                onChange={(event) => setDeviceNoteText(event.target.value)}
                rows={3}
                className="mt-2 w-full rounded-lg border border-[#d4af37]/30 bg-[#0f172a] px-3 py-2 text-sm text-[#f8f1df] focus:outline-none focus:ring-2 focus:ring-[#d4af37]/40"
                placeholder="Write the note text to include in iPhone delivery..."
              />
            </label>
            <button
              type="button"
              onClick={() => void handleSendToDevice()}
              disabled={isSendingToDevice || rendering || fetching}
              className="mt-4 w-full rounded-lg bg-emerald-600 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSendingToDevice ? 'Sending to iPhone...' : 'Send to iPhone'}
            </button>
            {sendToDeviceResult ? (
              <div className="mt-3 space-y-1 rounded-lg border border-[#d4af37]/20 bg-[#0f172a] p-3 text-xs text-[#f8f1df]/80">
                <p>
                  Imported:{' '}
                  <span className="text-white">{sendToDeviceResult.imported_count ?? 'unknown'}</span>
                </p>
                <p>
                  Note created:{' '}
                  <span className="text-white">
                    {sendToDeviceResult.note_created === undefined
                      ? 'unknown'
                      : sendToDeviceResult.note_created
                        ? 'yes'
                        : 'no'}
                  </span>
                </p>
              </div>
            ) : null}
          </section>
        ) : null}
      </div>
    </div>
  )
}
