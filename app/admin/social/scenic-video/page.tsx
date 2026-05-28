'use client'

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

type ScenicDuration = 4 | 6 | 8
type ScenicLength = 8 | 16 | 24
type ScenicClipCount = 1 | 2 | 3
type ScenicUniqueClipCount = 1 | 2 | 3
type ScenicStatus = 'idle' | 'generating' | 'stitching' | 'done' | 'failed' | 'error'
type ScenePresetId = 'custom' | 'cardinal' | 'windchimes' | 'sunrise' | 'coastline'

interface GenerateResponse {
  jobId?: string
  parentJobId?: string
  clipCount?: number
  error?: string
  details?: string
}

interface StatusResponse {
  status?: 'pending' | 'generating' | 'stitching' | 'done' | 'failed'
  done?: number
  total?: number
  key?: string
  url?: string
  failedChildren?: string[]
  message?: string
  error?: string
  details?: string
}

interface MemoryThoughtResponse {
  thought?: string
  provider?: 'claude' | 'chatgpt'
  words?: number
  error?: string
  details?: string
}

interface SendToDeviceResult {
  imported_count?: number
  note_created?: boolean
}

type SharedVideoSource = 'scenic-final' | 'scenic-clip' | 'poem-final' | 'poem-clip'

interface ScenicLibraryItem {
  id: string
  source: SharedVideoSource
  jobId?: string
  parentJobId?: string
  clipCount?: number
  durationSeconds: number
  key: string
  url: string
  memoryThought: string
  savedAtIso: string
}

const POLL_MS = 8000
const DEFAULT_PROMPT =
  'A serene sunrise over rolling Appalachian hills, mist drifting through pine trees, gentle camera glide, cinematic natural light.'
const SCENE_PRESETS: Array<{ id: ScenePresetId; label: string; prompt: string }> = [
  {
    id: 'custom',
    label: 'Custom prompt',
    prompt: '',
  },
  {
    id: 'cardinal',
    label: 'Cardinal in a flowering garden',
    prompt:
      'A bright red cardinal perched gracefully on a flowering magnolia branch, petals drifting in warm golden light, shallow depth of field, pretty and cinematic nature footage.',
  },
  {
    id: 'windchimes',
    label: 'Winds rustling through wind chimes',
    prompt:
      'Close-up of brass wind chimes on a cozy porch with winds rustling through wind chimes, soft afternoon sunlight, gentle plant movement in the background, calming cinematic realism.',
  },
  {
    id: 'sunrise',
    label: 'Misty mountain sunrise',
    prompt:
      'A serene sunrise over rolling Appalachian hills, mist drifting through pine trees, gentle camera glide, cinematic natural light.',
  },
  {
    id: 'coastline',
    label: 'Rocky coastline at dusk',
    prompt:
      'Slow cinematic drone movement along a rocky coastline at dusk, sea spray catching amber light, gulls in the distance, rich natural color and realistic textures.',
  },
]

function getScenePromptById(id: ScenePresetId): string {
  return SCENE_PRESETS.find((preset) => preset.id === id)?.prompt || ''
}

export default function ScenicVideoPage() {
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT)
  const [scenePresetId, setScenePresetId] = useState<ScenePresetId>('sunrise')
  const [durationSeconds, setDurationSeconds] = useState<ScenicDuration>(8)
  const [lengthSeconds, setLengthSeconds] = useState<ScenicLength>(8)
  const [activeClipCount, setActiveClipCount] = useState<ScenicClipCount>(1)
  const [uniqueClipCount, setUniqueClipCount] = useState<ScenicUniqueClipCount>(2)
  const [clipSceneSelections, setClipSceneSelections] = useState<ScenePresetId[]>([
    'cardinal',
    'windchimes',
    'sunrise',
  ])
  const [clipPrompts, setClipPrompts] = useState<string[]>([
    getScenePromptById('cardinal'),
    getScenePromptById('windchimes'),
    getScenePromptById('sunrise'),
  ])
  const [generateAudio, setGenerateAudio] = useState(true)
  const [status, setStatus] = useState<ScenicStatus>('idle')
  const [jobId, setJobId] = useState<string | null>(null)
  const [progressDone, setProgressDone] = useState(0)
  const [progressTotal, setProgressTotal] = useState(1)
  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  const [videoKey, setVideoKey] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [failedChildren, setFailedChildren] = useState<string[]>([])
  const [memoryThought, setMemoryThought] = useState('')
  const [isGeneratingMemoryThought, setIsGeneratingMemoryThought] = useState(false)
  const [isSendingToDevice, setIsSendingToDevice] = useState(false)
  const [sendToDeviceResult, setSendToDeviceResult] = useState<SendToDeviceResult | null>(null)
  const [scenicLibrary, setScenicLibrary] = useState<ScenicLibraryItem[]>([])
  const [startedAtMs, setStartedAtMs] = useState<number | null>(null)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)

  useEffect(() => {
    if ((status !== 'generating' && status !== 'stitching') || !startedAtMs) return
    const interval = window.setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startedAtMs) / 1000))
    }, 1000)
    return () => window.clearInterval(interval)
  }, [startedAtMs, status])

  const clipCount = useMemo(() => Math.max(1, Math.floor(lengthSeconds / 8)) as ScenicClipCount, [lengthSeconds])
  const maxUniqueClipCount = useMemo(
    () => Math.min(3, clipCount) as ScenicUniqueClipCount,
    [clipCount]
  )
  const repeatedSequence = useMemo(
    () =>
      Array.from(
        { length: clipCount },
        (_, index) => ((index % Math.max(1, uniqueClipCount)) + 1) as 1 | 2 | 3
      ),
    [clipCount, uniqueClipCount]
  )

  useEffect(() => {
    if (uniqueClipCount > maxUniqueClipCount) {
      setUniqueClipCount(maxUniqueClipCount)
    }
  }, [maxUniqueClipCount, uniqueClipCount])

  const loadLibrary = useCallback(async () => {
    try {
      const response = await fetch('/api/social-video/library', { cache: 'no-store' })
      const data = (await response.json()) as { items?: ScenicLibraryItem[]; error?: string; details?: string }
      if (!response.ok) {
        throw new Error(data.details || data.error || 'Failed to load shared video library.')
      }
      setScenicLibrary(Array.isArray(data.items) ? data.items : [])
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to load shared video library.')
    }
  }, [])

  useEffect(() => {
    void loadLibrary()
  }, [loadLibrary])

  useEffect(() => {
    if ((status !== 'generating' && status !== 'stitching') || !jobId) return

    let cancelled = false
    let timeoutId: number | null = null

    const poll = async () => {
      try {
        const url =
          activeClipCount === 1
            ? `/api/scenic-video/status?jobId=${encodeURIComponent(jobId)}`
            : `/api/scenic-video/status-long?parentJobId=${encodeURIComponent(jobId)}`
        const response = await fetch(url, { cache: 'no-store' })
        const data = (await response.json()) as StatusResponse
        if (!response.ok) {
          throw new Error(data.details || data.error || 'Failed to check scenic video status.')
        }
        if (cancelled) return

        if (data.status === 'done' && data.url && data.key) {
          setVideoUrl(data.url)
          setVideoKey(data.key)
          setFailedChildren([])
          setStatus('done')
          return
        }

        if (data.status === 'failed') {
          setStatus('failed')
          setFailedChildren(Array.isArray(data.failedChildren) ? data.failedChildren : [])
          setErrorMessage(
            data.message ||
              `Generation failed for children: ${(data.failedChildren || []).join(', ') || 'unknown'}`
          )
          return
        }

        if (activeClipCount > 1) {
          const done = Number.isFinite(data.done) ? Number(data.done) : 0
          const total = Number.isFinite(data.total) ? Number(data.total) : activeClipCount
          setProgressDone(done)
          setProgressTotal(total)
          setStatus(data.status === 'stitching' ? 'stitching' : 'generating')
        } else {
          setProgressDone(0)
          setProgressTotal(1)
          setStatus('generating')
        }

        timeoutId = window.setTimeout(() => {
          void poll()
        }, POLL_MS)
      } catch (error) {
        if (cancelled) return
        setStatus('error')
        setErrorMessage(error instanceof Error ? error.message : 'Failed while polling status.')
      }
    }

    void poll()

    return () => {
      cancelled = true
      if (timeoutId) window.clearTimeout(timeoutId)
    }
  }, [activeClipCount, jobId, status])

  const elapsedDisplay = useMemo(() => {
    const mins = Math.floor(elapsedSeconds / 60)
    const secs = elapsedSeconds % 60
    return `${mins}:${String(secs).padStart(2, '0')}`
  }, [elapsedSeconds])

  const handleGenerate = async () => {
    if (clipCount === 1 && !prompt.trim()) {
      setErrorMessage('Please enter a scenic prompt before generating.')
      return
    }
    if (clipCount > 1) {
      const selectedPrompts = clipPrompts.slice(0, uniqueClipCount).map((item) => item.trim())
      if (selectedPrompts.some((item) => !item)) {
        setErrorMessage('Please provide a scene prompt for each clip before generating.')
        return
      }
    }

    setErrorMessage(null)
    setStatus('generating')
    setVideoUrl(null)
    setVideoKey(null)
    setJobId(null)
    setSendToDeviceResult(null)
    setFailedChildren([])
    setActiveClipCount(clipCount)
    setProgressDone(0)
    setProgressTotal(clipCount)
    setStartedAtMs(Date.now())
    setElapsedSeconds(0)

    try {
      const endpoint = clipCount === 1 ? '/api/scenic-video/generate' : '/api/scenic-video/generate-long'
      const payload =
        clipCount === 1
          ? {
              prompt: prompt.trim(),
              durationSeconds,
              generateAudio,
            }
          : {
              prompt: clipPrompts[0]?.trim() || prompt.trim(),
              prompts: clipPrompts.slice(0, uniqueClipCount).map((item) => item.trim()),
              clipCount,
            }
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = (await response.json()) as GenerateResponse
      if (!response.ok) {
        throw new Error(data.details || data.error || 'Failed to start scenic video generation.')
      }
      const returnedJobId = clipCount === 1 ? data.jobId : data.parentJobId
      if (!returnedJobId) {
        throw new Error('Generate route did not return a job identifier.')
      }
      setJobId(returnedJobId)
    } catch (error) {
      setStatus('error')
      setErrorMessage(error instanceof Error ? error.message : 'Failed to enqueue scenic generation.')
    }
  }

  const handleGenerateMemoryThought = async () => {
    setIsGeneratingMemoryThought(true)
    setErrorMessage(null)
    try {
      const response = await fetch('/api/quotes/generate-memory-thought', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: 'auto' }),
      })
      const data = (await response.json()) as MemoryThoughtResponse
      if (!response.ok) {
        throw new Error(data.details || data.error || 'Failed to generate memory thought.')
      }
      const thought = data.thought?.trim()
      if (!thought) {
        throw new Error('Memory thought generator did not return text.')
      }
      setMemoryThought(thought)
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Failed to generate memory thought.'
      )
    } finally {
      setIsGeneratingMemoryThought(false)
    }
  }

  const upsertLibraryItem = () => {
    // Server-side DB is the source of truth.
  }

  const resolveLatestVideoUrl = async (
    entry: Pick<ScenicLibraryItem, 'source' | 'jobId' | 'parentJobId' | 'clipCount'>
  ): Promise<StatusResponse> => {
    let endpoint = ''
    if (entry.source === 'scenic-final') {
      endpoint =
        entry.clipCount === 1
          ? `/api/scenic-video/status?jobId=${encodeURIComponent(entry.jobId || '')}`
          : `/api/scenic-video/status-long?parentJobId=${encodeURIComponent(
              entry.parentJobId || entry.jobId || ''
            )}`
    } else if (entry.source === 'poem-final') {
      endpoint = `/api/poem-video/status?parentJobId=${encodeURIComponent(entry.parentJobId || '')}`
    } else {
      return { status: 'done' }
    }
    const response = await fetch(endpoint, { cache: 'no-store' })
    const data = (await response.json()) as StatusResponse
    if (!response.ok) {
      throw new Error(data.details || data.error || 'Failed to refresh scenic video URL.')
    }
    return data
  }

  useEffect(() => {
    if (status !== 'done') return
    void loadLibrary()
  }, [loadLibrary, status])

  const handleDownloadCurrentVideo = async () => {
    if (!videoUrl || !videoKey || !jobId) {
      setErrorMessage('Generate the scenic video first, then download.')
      return
    }

    const link = document.createElement('a')
    link.href = videoUrl
    link.target = '_blank'
    link.rel = 'noreferrer'
    link.download = ''
    document.body.appendChild(link)
    link.click()
    link.remove()
  }

  const handleOpenLibraryItem = async (item: ScenicLibraryItem, download: boolean) => {
    try {
      const latest = await resolveLatestVideoUrl({
        source: item.source,
        jobId: item.jobId,
        parentJobId: item.parentJobId,
        clipCount: item.clipCount,
      })
      const resolvedUrl = latest.url || item.url
      const updated: ScenicLibraryItem = {
        ...item,
        key: latest.key || item.key,
        url: resolvedUrl,
      }

      const link = document.createElement('a')
      link.href = resolvedUrl
      link.target = '_blank'
      link.rel = 'noreferrer'
      if (download) link.download = ''
      document.body.appendChild(link)
      link.click()
      link.remove()
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Failed to open library video.'
      )
    }
  }

  const handleSendToDevice = async () => {
    if (!videoUrl || !jobId) {
      setErrorMessage('Generate the scenic video first, then send to iPhone.')
      return
    }

    setIsSendingToDevice(true)
    setErrorMessage(null)
    setSendToDeviceResult(null)
    try {
      const response = await fetch('/api/admin/social/send-to-device', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          post_id: jobId,
          trend_name: 'Scenic Video',
          album_name: 'HC-Business',
          slides: [
            {
              order: 1,
              image_url: videoUrl,
              overlay_text: memoryThought.trim(),
            },
          ],
        }),
      })

      const data = await response.json()
      if (!response.ok) {
        throw new Error(data?.error || data?.details || 'Failed to send to iPhone')
      }

      setSendToDeviceResult({
        imported_count: data.imported_count,
        note_created: data.note_created,
      })
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to send to iPhone.')
    } finally {
      setIsSendingToDevice(false)
    }
  }

  const handleRetryFailedChildren = async () => {
    if (!jobId || failedChildren.length === 0) {
      setErrorMessage('No failed children to retry.')
      return
    }

    setErrorMessage(null)
    try {
      const response = await fetch('/api/scenic-video/retry-children', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          parentJobId: jobId,
          failedChildren,
        }),
      })
      const data = await response.json()
      if (!response.ok) {
        const retryFailedChildren = Array.isArray(data.failedChildren) ? data.failedChildren : failedChildren
        setFailedChildren(retryFailedChildren)
        throw new Error(
          data.error || `Retry failed for children: ${retryFailedChildren.join(', ') || 'unknown'}`
        )
      }

      setFailedChildren([])
      setStatus('generating')
    } catch (error) {
      setStatus('failed')
      setErrorMessage(error instanceof Error ? error.message : 'Failed to retry child clip generation.')
    }
  }

  return (
    <div className={`${bodyFont.className} min-h-screen bg-[#0b1120] text-[#f8f1df]`}>
      <div className="mx-auto max-w-6xl px-6 py-8">
        <header className="rounded-2xl border border-[#d4af37]/30 bg-[#121a2d] p-6">
          <p className="text-xs uppercase tracking-[0.2em] text-[#d4af37]">Admin Social</p>
          <h1 className={`${headingFont.className} mt-2 text-4xl font-semibold text-[#f8f1df]`}>
            Scenic Video
          </h1>
          <p className="mt-3 max-w-3xl text-sm text-[#f8f1df]/80">
            Generate one scenic clip or stitch multiple clips into one longer video. Rendering is asynchronous and
            usually completes in about 1-3 minutes.
          </p>
        </header>

        <div className="mt-6 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <section className="rounded-2xl border border-[#d4af37]/20 bg-[#121a2d] p-6">
            <h2 className={`${headingFont.className} text-2xl text-[#f8f1df]`}>Scene Prompt</h2>
            {clipCount === 1 ? (
              <>
                <label className="mt-4 block text-sm text-[#f8f1df]/85">
                  Scene presets
                  <select
                    value={scenePresetId}
                    onChange={(event) => {
                      const nextId = event.target.value as ScenePresetId
                      setScenePresetId(nextId)
                      const preset = SCENE_PRESETS.find((item) => item.id === nextId)
                      if (preset && preset.prompt) {
                        setPrompt(preset.prompt)
                      }
                    }}
                    className="mt-2 w-full rounded-lg border border-[#d4af37]/30 bg-[#0f172a] px-3 py-2 text-sm text-[#f8f1df] focus:outline-none focus:ring-2 focus:ring-[#d4af37]/40"
                  >
                    {SCENE_PRESETS.map((preset) => (
                      <option key={preset.id} value={preset.id}>
                        {preset.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="mt-4 block text-sm text-[#f8f1df]/85">
                  Describe the scene Veo should generate
                  <textarea
                    value={prompt}
                    onChange={(event) => {
                      setPrompt(event.target.value)
                      setScenePresetId('custom')
                    }}
                    rows={7}
                    className="mt-2 w-full rounded-lg border border-[#d4af37]/30 bg-[#0f172a] px-3 py-2 text-sm text-[#f8f1df] focus:outline-none focus:ring-2 focus:ring-[#d4af37]/40"
                    placeholder="Wide cinematic view of..."
                  />
                </label>
              </>
            ) : (
              <div className="mt-4 space-y-3">
                {Array.from({ length: uniqueClipCount }, (_, index) => (
                  <div
                    key={`clip-scene-${index}`}
                    className="rounded-lg border border-[#d4af37]/20 bg-[#0f172a] p-3"
                  >
                    <p className="text-xs uppercase tracking-[0.18em] text-[#d4af37]/90">
                      Clip {index + 1}
                    </p>
                    <label className="mt-2 block text-sm text-[#f8f1df]/85">
                      Scene
                      <select
                        value={clipSceneSelections[index] || 'custom'}
                        onChange={(event) => {
                          const nextId = event.target.value as ScenePresetId
                          const nextSelections = [...clipSceneSelections]
                          nextSelections[index] = nextId
                          setClipSceneSelections(nextSelections)

                          const presetPrompt = getScenePromptById(nextId)
                          if (presetPrompt) {
                            const nextPrompts = [...clipPrompts]
                            nextPrompts[index] = presetPrompt
                            setClipPrompts(nextPrompts)
                          }
                        }}
                        className="mt-1 w-full rounded-lg border border-[#d4af37]/30 bg-[#101a30] px-3 py-2 text-sm text-[#f8f1df] focus:outline-none focus:ring-2 focus:ring-[#d4af37]/40"
                      >
                        {SCENE_PRESETS.map((preset) => (
                          <option key={`${preset.id}-${index}`} value={preset.id}>
                            {preset.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="mt-2 block text-sm text-[#f8f1df]/85">
                      Prompt
                      <textarea
                        value={clipPrompts[index] || ''}
                        onChange={(event) => {
                          const nextPrompts = [...clipPrompts]
                          nextPrompts[index] = event.target.value
                          setClipPrompts(nextPrompts)

                          const nextSelections = [...clipSceneSelections]
                          nextSelections[index] = 'custom'
                          setClipSceneSelections(nextSelections)
                        }}
                        rows={3}
                        className="mt-1 w-full rounded-lg border border-[#d4af37]/30 bg-[#101a30] px-3 py-2 text-sm text-[#f8f1df] focus:outline-none focus:ring-2 focus:ring-[#d4af37]/40"
                        placeholder="Describe this specific clip..."
                      />
                    </label>
                  </div>
                ))}
              </div>
            )}

            <fieldset className="mt-5">
              <legend className="text-sm text-[#f8f1df]/85">Duration</legend>
              <div className="mt-2 flex flex-wrap gap-2">
                {[4, 6, 8].map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setDurationSeconds(value as ScenicDuration)}
                    className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
                      durationSeconds === value
                        ? 'bg-[#d4af37] text-[#0b1120]'
                        : 'border border-[#d4af37]/40 bg-[#0f172a] text-[#f8f1df] hover:bg-[#1a2642]'
                    }`}
                  >
                    {value}s
                  </button>
                ))}
              </div>
            </fieldset>

            <fieldset className="mt-5">
              <legend className="text-sm text-[#f8f1df]/85">Length</legend>
              <div className="mt-2 flex flex-wrap gap-2">
                {[
                  { label: '8s', value: 8 },
                  { label: '16s', value: 16 },
                  { label: '24s', value: 24 },
                ].map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setLengthSeconds(option.value as ScenicLength)}
                    className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
                      lengthSeconds === option.value
                        ? 'bg-[#d4af37] text-[#0b1120]'
                        : 'border border-[#d4af37]/40 bg-[#0f172a] text-[#f8f1df] hover:bg-[#1a2642]'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-xs text-[#f8f1df]/65">
                {clipCount === 1
                  ? 'Single clip mode uses the existing generate/status flow.'
                  : `Multi-clip mode stitches ${clipCount} scenes together into one final video.`}
              </p>
            </fieldset>

            {clipCount > 1 ? (
              <fieldset className="mt-5">
                <legend className="text-sm text-[#f8f1df]/85">Unique scenes to generate</legend>
                <div className="mt-2 flex flex-wrap gap-2">
                  {Array.from({ length: maxUniqueClipCount }, (_, index) => index + 1).map((value) => (
                    <button
                      key={`unique-clip-count-${value}`}
                      type="button"
                      onClick={() => setUniqueClipCount(value as ScenicUniqueClipCount)}
                      className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
                        uniqueClipCount === value
                          ? 'bg-[#d4af37] text-[#0b1120]'
                          : 'border border-[#d4af37]/40 bg-[#0f172a] text-[#f8f1df] hover:bg-[#1a2642]'
                      }`}
                    >
                      {value}
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-xs text-[#f8f1df]/65">
                  Stitch order: {repeatedSequence.map((value) => `clip ${value}`).join(' -> ')}
                </p>
              </fieldset>
            ) : null}

            <label className="mt-4 flex items-start gap-3 rounded-lg border border-[#d4af37]/25 bg-[#0f172a] p-3 text-sm text-[#f8f1df]/85">
              <input
                type="checkbox"
                checked={generateAudio}
                onChange={(event) => setGenerateAudio(event.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-[#d4af37]/50 bg-[#0b1120] text-[#d4af37] focus:ring-[#d4af37]/60"
              />
              <span>
                Include audio
                <span className="mt-1 block text-xs text-[#f8f1df]/65">
                  Veo generates ambient sound by default. Uncheck for silent clips (e.g. when you&apos;ll add a
                  voiceover).
                </span>
              </span>
            </label>

            <button
              type="button"
              onClick={() => void handleGenerate()}
              disabled={status === 'generating' || status === 'stitching'}
              className="mt-6 rounded-lg bg-[#d4af37] px-5 py-2.5 text-sm font-semibold text-[#0b1120] transition hover:bg-[#e2c462] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {status === 'generating' || status === 'stitching' ? 'Generating clip...' : 'Generate clip'}
            </button>

            {errorMessage ? <p className="mt-3 text-sm text-red-300">{errorMessage}</p> : null}

            <div className="mt-5 rounded-lg border border-[#d4af37]/20 bg-[#0f172a] p-4">
              <h3 className={`${headingFont.className} text-xl text-[#f8f1df]`}>
                Memory Thought
              </h3>
              <p className="mt-1 text-xs text-[#f8f1df]/70">
                Generate a short emotional line about missing someone (7-25 words).
              </p>
              <button
                type="button"
                onClick={() => void handleGenerateMemoryThought()}
                disabled={isGeneratingMemoryThought}
                className="mt-3 rounded-lg border border-[#d4af37]/40 px-4 py-2 text-sm font-semibold text-[#f8f1df] hover:bg-[#1a2642] disabled:opacity-50"
              >
                {isGeneratingMemoryThought ? 'Writing thought...' : 'Generate memory thought'}
              </button>
              <label className="mt-3 block text-xs text-[#f8f1df]/80">
                Thought text
                <textarea
                  value={memoryThought}
                  onChange={(event) => setMemoryThought(event.target.value)}
                  rows={3}
                  className="mt-1 w-full rounded-lg border border-[#d4af37]/25 bg-[#101a30] px-3 py-2 text-sm text-[#f8f1df] focus:outline-none focus:ring-2 focus:ring-[#d4af37]/40"
                  placeholder='Example: "I will tell you everything when I see you again."'
                />
              </label>
            </div>
          </section>

          <section className="rounded-2xl border border-[#d4af37]/20 bg-[#121a2d] p-6">
            <h2 className={`${headingFont.className} text-2xl text-[#f8f1df]`}>Generation Status</h2>

            {status === 'idle' ? (
              <p className="mt-4 text-sm text-[#f8f1df]/70">
                Submit a prompt to start generation. The clip and link will appear here once processing finishes.
              </p>
            ) : null}

            {status === 'generating' || status === 'stitching' ? (
              <div className="mt-4 rounded-xl border border-[#d4af37]/25 bg-[#0f172a] p-4">
                <div className="flex items-center gap-3">
                  <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-[#d4af37]/25 border-t-[#d4af37]" />
                  <p className="text-sm text-[#f8f1df]">
                    {activeClipCount === 1
                      ? 'Generating... this usually takes about 1-2 minutes.'
                      : status === 'stitching'
                        ? 'Stitching clips into one final video...'
                        : `Generating clip ${Math.min(progressDone + 1, progressTotal)}/${progressTotal}...`}
                  </p>
                </div>
                <p className="mt-3 text-xs text-[#f8f1df]/70">Elapsed: {elapsedDisplay}</p>
                {jobId ? (
                  <p className="mt-2 break-all text-xs text-[#f8f1df]/60">
                    Job ID: <span className="font-mono">{jobId}</span>
                  </p>
                ) : (
                  <p className="mt-2 text-xs text-[#f8f1df]/60">Queueing generation job...</p>
                )}
              </div>
            ) : null}

            {status === 'done' && videoUrl ? (
              <div className="mt-4 space-y-3">
                <video
                  src={videoUrl}
                  controls
                  className="w-full rounded-lg border border-[#d4af37]/25 bg-black"
                />
                <button
                  type="button"
                  onClick={() => void handleDownloadCurrentVideo()}
                  className="inline-flex rounded-lg bg-[#d4af37] px-4 py-2 text-sm font-semibold text-[#0b1120] hover:bg-[#e2c462]"
                >
                  Download MP4
                </button>
                {videoKey ? <p className="break-all text-xs text-[#f8f1df]/60">Key: {videoKey}</p> : null}
                <label className="block text-xs text-[#f8f1df]/80">
                  Raw URL
                  <textarea
                    readOnly
                    value={videoUrl}
                    rows={3}
                    className="mt-1 w-full rounded-lg border border-[#d4af37]/25 bg-[#0f172a] px-3 py-2 text-xs text-[#f8f1df]"
                  />
                </label>
              </div>
            ) : null}

            {status === 'error' ? (
              <p className="mt-4 text-sm text-red-300">
                Generation failed. Update your prompt and try again.
              </p>
            ) : null}

            {status === 'failed' ? (
              <div className="mt-4 space-y-3">
                <p className="text-sm text-red-300">
                  {errorMessage || 'Generation failed because one or more child clips did not complete in time.'}
                </p>
                <button
                  type="button"
                  onClick={() => void handleRetryFailedChildren()}
                  disabled={failedChildren.length === 0}
                  className="rounded-lg border border-[#d4af37]/40 px-4 py-2 text-xs font-semibold text-[#f8f1df] hover:bg-[#1a2642] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Retry failed children
                </button>
              </div>
            ) : null}

            {status === 'done' && videoUrl ? (
              <div className="mt-4 rounded-xl border border-[#d4af37]/25 bg-[#0f172a] p-4">
                <h3 className={`${headingFont.className} text-xl text-[#f8f1df]`}>
                  Send to iPhone
                </h3>
                <p className="mt-1 text-xs text-[#f8f1df]/70">
                  Sends the final scenic MP4 and includes the memory thought as note text.
                </p>
                <button
                  type="button"
                  onClick={() => void handleSendToDevice()}
                  disabled={isSendingToDevice}
                  className="mt-3 w-full rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSendingToDevice ? 'Sending to iPhone...' : 'Send to iPhone'}
                </button>
                {sendToDeviceResult ? (
                  <div className="mt-3 rounded-lg border border-[#d4af37]/20 bg-[#101a30] p-3 text-xs text-[#f8f1df]/80">
                    <p>
                      Imported: <span className="text-white">{sendToDeviceResult.imported_count ?? 'unknown'}</span>
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
              </div>
            ) : null}

            <div className="mt-4 rounded-xl border border-[#d4af37]/25 bg-[#0f172a] p-4">
              <h3 className={`${headingFont.className} text-xl text-[#f8f1df]`}>
                Shared Video Library
              </h3>
              <p className="mt-1 text-xs text-[#f8f1df]/70">
                Scenic and Poem outputs sync here automatically, including individual generated clips.
              </p>
              {scenicLibrary.length === 0 ? (
                <p className="mt-3 text-xs text-[#f8f1df]/65">No saved videos yet.</p>
              ) : (
                <div className="mt-3 space-y-2">
                  {scenicLibrary.map((item) => (
                    <div
                      key={item.id}
                      className="rounded-lg border border-[#d4af37]/20 bg-[#101a30] p-3"
                    >
                      <p className="text-xs text-[#f8f1df]/75">
                        Saved {new Date(item.savedAtIso).toLocaleString()} • {Math.max(1, item.durationSeconds)}s
                      </p>
                      <p className="mt-1 break-all text-[11px] text-[#f8f1df]/60">{item.key}</p>
                      {item.memoryThought ? (
                        <p className="mt-1 text-xs text-[#f8f1df]/80">{item.memoryThought}</p>
                      ) : null}
                      <div className="mt-2 flex gap-2">
                        <button
                          type="button"
                          onClick={() => void handleOpenLibraryItem(item, false)}
                          className="rounded-md border border-[#d4af37]/35 px-3 py-1.5 text-xs text-[#f8f1df] hover:bg-[#1a2642]"
                        >
                          Open
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleOpenLibraryItem(item, true)}
                          className="rounded-md bg-[#d4af37] px-3 py-1.5 text-xs font-semibold text-[#0b1120] hover:bg-[#e2c462]"
                        >
                          Download again
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
