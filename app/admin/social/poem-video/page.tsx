'use client'

import { useEffect, useMemo, useState } from 'react'
import { Cormorant_Garamond, DM_Sans } from 'next/font/google'

const headingFont = Cormorant_Garamond({
  subsets: ['latin'],
  weight: ['600', '700'],
})

const bodyFont = DM_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '700'],
})

type PoemTheme = 'presence' | 'grief-hook' | 'pure-grief'
type GenerationStatus = 'idle' | 'generating' | 'mixing' | 'done' | 'failed' | 'error'
type SharedVideoSource = 'scenic-final' | 'scenic-clip' | 'poem-final' | 'poem-clip'

interface VoiceOption {
  voiceId: string
  name: string
  preview_url: string | null
}

interface GeneratePoemResponse {
  poem?: string
  error?: string
  details?: string
}

interface GenerateVoiceResponse {
  voiceKey?: string
  voiceDuration?: number
  voiceUrl?: string
  error?: string
  details?: string
}

interface GenerateVideoResponse {
  parentJobId?: string
  clipCount?: number
  error?: string
  details?: string
}

interface StatusResponse {
  status?: 'pending' | 'generating' | 'mixing' | 'done' | 'failed'
  done?: number
  total?: number
  key?: string
  url?: string
  failedChildren?: string[]
  message?: string
  error?: string
  details?: string
}

interface SharedVideoLibraryItem {
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
const SOCIAL_VIDEO_LIBRARY_STORAGE_KEY = 'socialVideoLibrary.v1'
const S3_REGION = 'us-east-2'
const S3_BUCKET = 'heartbeat-photos-prod'
const THEME_OPTIONS: Array<{ value: PoemTheme; label: string; helper: string }> = [
  {
    value: 'presence',
    label: 'Presence',
    helper: 'Still present in songs, seasons, and ordinary moments.',
  },
  {
    value: 'grief-hook',
    label: 'Grief-hook',
    helper: 'Opens with loss, then bridges to continued presence.',
  },
  {
    value: 'pure-grief',
    label: 'Pure grief',
    helper: 'Raw and image-driven grief throughout.',
  },
]
const DEFAULT_SCENE_PROMPT =
  'Cinematic, gentle, remembrance-focused natural scenery with soft movement, warm light, and realistic textures in a 9:16 frame.'

function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0:00'
  const rounded = Math.max(1, Math.round(seconds))
  const mins = Math.floor(rounded / 60)
  const secs = rounded % 60
  return `${mins}:${String(secs).padStart(2, '0')}`
}

function getS3VideoUrl(key: string): string {
  return `https://${S3_BUCKET}.s3.${S3_REGION}.amazonaws.com/${key}`
}

export default function PoemVideoPage() {
  const [theme, setTheme] = useState<PoemTheme>('presence')
  const [userPrompt, setUserPrompt] = useState('')
  const [poem, setPoem] = useState('')
  const [isGeneratingPoem, setIsGeneratingPoem] = useState(false)

  const [voices, setVoices] = useState<VoiceOption[]>([])
  const [voicesError, setVoicesError] = useState<string | null>(null)
  const [isLoadingVoices, setIsLoadingVoices] = useState(false)
  const [selectedVoiceId, setSelectedVoiceId] = useState('')

  const [parentJobId, setParentJobId] = useState<string | null>(null)
  const [voiceKey, setVoiceKey] = useState<string | null>(null)
  const [voiceDuration, setVoiceDuration] = useState<number | null>(null)
  const [voiceUrl, setVoiceUrl] = useState<string | null>(null)
  const [isGeneratingVoice, setIsGeneratingVoice] = useState(false)

  const [singlePrompt, setSinglePrompt] = useState(DEFAULT_SCENE_PROMPT)
  const [useDifferentScenes, setUseDifferentScenes] = useState(false)
  const [clipPrompts, setClipPrompts] = useState<string[]>([])
  const [keepAmbient, setKeepAmbient] = useState(false)

  const [status, setStatus] = useState<GenerationStatus>('idle')
  const [progressDone, setProgressDone] = useState(0)
  const [progressTotal, setProgressTotal] = useState(1)
  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  const [videoKey, setVideoKey] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [failedChildren, setFailedChildren] = useState<string[]>([])
  const [isGeneratingVideo, setIsGeneratingVideo] = useState(false)
  const [videoLibrary, setVideoLibrary] = useState<SharedVideoLibraryItem[]>([])
  const [isLibraryLoaded, setIsLibraryLoaded] = useState(false)

  const clipCountPreview = useMemo(() => {
    if (!voiceDuration) return 0
    return Math.min(8, Math.max(1, Math.ceil(voiceDuration / 8)))
  }, [voiceDuration])

  useEffect(() => {
    let cancelled = false

    const loadVoices = async () => {
      setIsLoadingVoices(true)
      setVoicesError(null)
      try {
        const response = await fetch('/api/voicemail/voices', { cache: 'no-store' })
        const data = (await response.json()) as { voices?: VoiceOption[]; error?: string; details?: string }
        if (!response.ok) {
          throw new Error(data.details || data.error || 'Failed to load voice list.')
        }
        if (cancelled) return
        const nextVoices = Array.isArray(data.voices) ? data.voices : []
        setVoices(nextVoices)
        if (nextVoices.length > 0) {
          setSelectedVoiceId(nextVoices[0].voiceId)
        }
      } catch (error) {
        if (cancelled) return
        setVoicesError(error instanceof Error ? error.message : 'Failed to load voice list.')
      } finally {
        if (!cancelled) setIsLoadingVoices(false)
      }
    }

    void loadVoices()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(SOCIAL_VIDEO_LIBRARY_STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw)
        if (Array.isArray(parsed)) {
          const normalized = parsed
            .filter(
              (item): item is SharedVideoLibraryItem =>
                item &&
                typeof item === 'object' &&
                typeof item.id === 'string' &&
                typeof item.source === 'string' &&
                typeof item.key === 'string' &&
                typeof item.url === 'string' &&
                typeof item.durationSeconds === 'number' &&
                typeof item.memoryThought === 'string' &&
                typeof item.savedAtIso === 'string'
            )
            .slice(0, 80)
          setVideoLibrary(normalized)
        }
      }
    } catch {
      // Ignore malformed localStorage contents.
    } finally {
      setIsLibraryLoaded(true)
    }
  }, [])

  useEffect(() => {
    if (!isLibraryLoaded) return
    window.localStorage.setItem(SOCIAL_VIDEO_LIBRARY_STORAGE_KEY, JSON.stringify(videoLibrary))
  }, [isLibraryLoaded, videoLibrary])

  useEffect(() => {
    if (!useDifferentScenes || clipCountPreview <= 0) return
    setClipPrompts((current) => {
      const next = Array.from({ length: clipCountPreview }, (_, index) => current[index] || singlePrompt)
      return next
    })
  }, [clipCountPreview, singlePrompt, useDifferentScenes])

  useEffect(() => {
    if ((status !== 'generating' && status !== 'mixing') || !parentJobId) return

    let cancelled = false
    let timeoutId: number | null = null

    const poll = async () => {
      try {
        const response = await fetch(
          `/api/poem-video/status?parentJobId=${encodeURIComponent(parentJobId)}`,
          { cache: 'no-store' }
        )
        const data = (await response.json()) as StatusResponse
        if (!response.ok) {
          throw new Error(data.details || data.error || 'Failed to check poem video status.')
        }
        if (cancelled) return

        if (data.status === 'done' && data.url && data.key) {
          setVideoUrl(data.url)
          setVideoKey(data.key)
          setStatus('done')
          setIsGeneratingVideo(false)
          setFailedChildren([])

          const now = new Date().toISOString()
          upsertLibraryItem({
            id: crypto.randomUUID(),
            source: 'poem-final',
            jobId: parentJobId,
            parentJobId,
            clipCount: Math.max(1, clipCountPreview),
            durationSeconds: Math.max(1, Math.round(voiceDuration || clipCountPreview * 8)),
            key: data.key,
            url: data.url,
            memoryThought: '',
            savedAtIso: now,
          })

          const totalClips = Math.max(1, clipCountPreview)
          for (let index = 0; index < totalClips; index += 1) {
            const childJobId = `${parentJobId}-c${index}`
            const childKey = `scenic-video/${childJobId}/clip-0.mp4`
            upsertLibraryItem({
              id: crypto.randomUUID(),
              source: 'poem-clip',
              jobId: childJobId,
              parentJobId,
              clipCount: 1,
              durationSeconds: 8,
              key: childKey,
              url: getS3VideoUrl(childKey),
              memoryThought: '',
              savedAtIso: now,
            })
          }
          return
        }

        if (data.status === 'failed') {
          setStatus('failed')
          setIsGeneratingVideo(false)
          setFailedChildren(Array.isArray(data.failedChildren) ? data.failedChildren : [])
          setErrorMessage(
            data.message ||
              `Generation failed for children: ${(data.failedChildren || []).join(', ') || 'unknown'}`
          )
          return
        }

        const done = Number.isFinite(data.done) ? Number(data.done) : progressDone
        const total = Number.isFinite(data.total) ? Number(data.total) : progressTotal
        setProgressDone(done)
        setProgressTotal(total)
        setStatus(data.status === 'mixing' ? 'mixing' : 'generating')

        timeoutId = window.setTimeout(() => {
          void poll()
        }, POLL_MS)
      } catch (error) {
        if (cancelled) return
        setStatus('error')
        setIsGeneratingVideo(false)
        setErrorMessage(error instanceof Error ? error.message : 'Failed while polling status.')
      }
    }

    void poll()
    return () => {
      cancelled = true
      if (timeoutId) window.clearTimeout(timeoutId)
    }
  }, [clipCountPreview, parentJobId, progressDone, progressTotal, status, voiceDuration])

  const upsertLibraryItem = (item: SharedVideoLibraryItem) => {
    setVideoLibrary((prev) => {
      const existingIndex = prev.findIndex((entry) => entry.key === item.key)
      if (existingIndex >= 0) {
        const updated = [...prev]
        updated[existingIndex] = item
        return updated
      }
      return [item, ...prev].slice(0, 80)
    })
  }

  const resolveLatestVideoUrl = async (
    entry: Pick<SharedVideoLibraryItem, 'source' | 'jobId' | 'parentJobId' | 'clipCount'>
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
      throw new Error(data.details || data.error || 'Failed to refresh video URL.')
    }
    return data
  }

  const handleOpenLibraryItem = async (item: SharedVideoLibraryItem, download: boolean) => {
    try {
      const latest = await resolveLatestVideoUrl({
        source: item.source,
        jobId: item.jobId,
        parentJobId: item.parentJobId,
        clipCount: item.clipCount,
      })
      const resolvedUrl = latest.url || item.url
      upsertLibraryItem({
        ...item,
        key: latest.key || item.key,
        url: resolvedUrl,
      })

      const link = document.createElement('a')
      link.href = resolvedUrl
      link.target = '_blank'
      link.rel = 'noreferrer'
      if (download) link.download = ''
      document.body.appendChild(link)
      link.click()
      link.remove()
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to open library video.')
    }
  }

  const handleRetryFailedChildren = async () => {
    if (!parentJobId || failedChildren.length === 0) {
      setErrorMessage('No failed children to retry.')
      return
    }

    setErrorMessage(null)
    try {
      const response = await fetch('/api/poem-video/retry-children', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          parentJobId,
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
      setIsGeneratingVideo(true)
      setStatus('generating')
    } catch (error) {
      setStatus('failed')
      setIsGeneratingVideo(false)
      setErrorMessage(error instanceof Error ? error.message : 'Failed to retry child clip generation.')
    }
  }

  const handleGeneratePoem = async () => {
    setIsGeneratingPoem(true)
    setErrorMessage(null)
    try {
      const response = await fetch('/api/poem-video/generate-poem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          theme,
          userPrompt: userPrompt.trim() || undefined,
        }),
      })
      const data = (await response.json()) as GeneratePoemResponse
      if (!response.ok) {
        throw new Error(data.details || data.error || 'Failed to generate poem.')
      }
      const poemText = data.poem?.trim()
      if (!poemText) {
        throw new Error('Poem generator returned empty content.')
      }
      setPoem(poemText)
      setVoiceKey(null)
      setVoiceDuration(null)
      setVoiceUrl(null)
      setStatus('idle')
      setVideoUrl(null)
      setVideoKey(null)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to generate poem.')
    } finally {
      setIsGeneratingPoem(false)
    }
  }

  const handleGenerateVoice = async () => {
    const poemText = poem.trim()
    if (!poemText) {
      setErrorMessage('Generate or edit the poem first.')
      return
    }
    if (!selectedVoiceId) {
      setErrorMessage('Select a voice first.')
      return
    }

    const resolvedParentJobId = parentJobId || crypto.randomUUID()
    if (!parentJobId) setParentJobId(resolvedParentJobId)

    setIsGeneratingVoice(true)
    setErrorMessage(null)
    try {
      const response = await fetch('/api/poem-video/generate-voice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          poem: poemText,
          voiceId: selectedVoiceId,
          jobId: resolvedParentJobId,
        }),
      })
      const data = (await response.json()) as GenerateVoiceResponse
      if (!response.ok) {
        throw new Error(data.details || data.error || 'Failed to generate voiceover.')
      }
      if (!data.voiceKey || !data.voiceUrl || !Number.isFinite(data.voiceDuration)) {
        throw new Error('Voice route did not return the expected payload.')
      }
      setVoiceKey(data.voiceKey)
      setVoiceDuration(Number(data.voiceDuration))
      setVoiceUrl(data.voiceUrl)
      setStatus('idle')
      setVideoUrl(null)
      setVideoKey(null)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to generate voiceover.')
    } finally {
      setIsGeneratingVoice(false)
    }
  }

  const handleGenerateVideo = async () => {
    if (!voiceKey || !voiceDuration || !parentJobId) {
      setErrorMessage('Generate the voiceover first.')
      return
    }

    const single = singlePrompt.trim()
    if (!useDifferentScenes && !single) {
      setErrorMessage('Enter a scenic prompt before generating video.')
      return
    }

    const resolvedPrompts = useDifferentScenes
      ? clipPrompts.slice(0, clipCountPreview).map((item) => item.trim())
      : single

    if (Array.isArray(resolvedPrompts) && resolvedPrompts.some((item) => !item)) {
      setErrorMessage('Each clip prompt must be non-empty.')
      return
    }

    setErrorMessage(null)
    setIsGeneratingVideo(true)
    setStatus('generating')
    setProgressDone(0)
    setProgressTotal(Math.max(1, clipCountPreview))
    setVideoUrl(null)
    setVideoKey(null)
    setFailedChildren([])

    try {
      const response = await fetch('/api/poem-video/generate-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          parentJobId,
          voiceKey,
          voiceDuration,
          keepAmbient,
          prompts: resolvedPrompts,
        }),
      })
      const data = (await response.json()) as GenerateVideoResponse
      if (!response.ok) {
        throw new Error(data.details || data.error || 'Failed to start poem video generation.')
      }
      if (!data.parentJobId) {
        throw new Error('Generate video route did not return parentJobId.')
      }
      setParentJobId(data.parentJobId)
      if (Number.isFinite(data.clipCount)) {
        const total = Number(data.clipCount)
        setProgressTotal(total)
      }
    } catch (error) {
      setStatus('error')
      setIsGeneratingVideo(false)
      setErrorMessage(error instanceof Error ? error.message : 'Failed to queue poem video generation.')
    }
  }

  return (
    <div className={`${bodyFont.className} min-h-screen bg-[#0b1120] text-[#f8f1df]`}>
      <div className="mx-auto max-w-6xl px-6 py-8">
        <header className="rounded-2xl border border-[#d4af37]/30 bg-[#121a2d] p-6">
          <p className="text-xs uppercase tracking-[0.2em] text-[#d4af37]">Admin Social</p>
          <h1 className={`${headingFont.className} mt-2 text-4xl font-semibold text-[#f8f1df]`}>
            Poem Video
          </h1>
          <p className="mt-3 max-w-3xl text-sm text-[#f8f1df]/80">
            Voice-first workflow: write a poem, generate ElevenLabs voiceover, then generate scenic Veo clips and mix
            into one final vertical MP4.
          </p>
        </header>

        <div className="mt-6 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <section className="rounded-2xl border border-[#d4af37]/20 bg-[#121a2d] p-6">
            <h2 className={`${headingFont.className} text-2xl text-[#f8f1df]`}>Step 1 - Write poem</h2>
            <div className="mt-4 grid gap-3">
              {THEME_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setTheme(option.value)}
                  className={`rounded-lg border px-4 py-3 text-left transition ${
                    theme === option.value
                      ? 'border-[#d4af37] bg-[#d4af37]/15'
                      : 'border-[#d4af37]/25 bg-[#0f172a] hover:border-[#d4af37]/50'
                  }`}
                >
                  <p className="text-sm font-semibold">{option.label}</p>
                  <p className="mt-1 text-xs text-[#f8f1df]/70">{option.helper}</p>
                </button>
              ))}
            </div>

            <label className="mt-4 block text-sm text-[#f8f1df]/85">
              Specifically about (optional)
              <input
                value={userPrompt}
                onChange={(event) => setUserPrompt(event.target.value)}
                className="mt-2 w-full rounded-lg border border-[#d4af37]/30 bg-[#0f172a] px-3 py-2 text-sm text-[#f8f1df] focus:outline-none focus:ring-2 focus:ring-[#d4af37]/40"
                placeholder="Her Sunday pancake ritual, his old truck, summer baseball..."
              />
            </label>

            <button
              type="button"
              onClick={() => void handleGeneratePoem()}
              disabled={isGeneratingPoem}
              className="mt-4 rounded-lg bg-[#d4af37] px-5 py-2.5 text-sm font-semibold text-[#0b1120] hover:bg-[#e2c462] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isGeneratingPoem ? 'Generating poem...' : 'Generate poem'}
            </button>

            <label className="mt-4 block text-sm text-[#f8f1df]/85">
              Poem (editable)
              <textarea
                value={poem}
                onChange={(event) => setPoem(event.target.value)}
                rows={8}
                className="mt-2 w-full rounded-lg border border-[#d4af37]/30 bg-[#0f172a] px-3 py-2 text-sm leading-relaxed text-[#f8f1df] focus:outline-none focus:ring-2 focus:ring-[#d4af37]/40"
                placeholder="Your generated poem appears here..."
              />
            </label>

            <h2 className={`${headingFont.className} mt-8 text-2xl text-[#f8f1df]`}>Step 2 - Voiceover</h2>
            {isLoadingVoices ? <p className="mt-3 text-sm text-[#f8f1df]/70">Loading ElevenLabs voices...</p> : null}
            {voicesError ? <p className="mt-3 text-sm text-red-300">{voicesError}</p> : null}

            {voices.length > 0 ? (
              <div className="mt-4 space-y-2">
                {voices.map((voice) => (
                  <label
                    key={voice.voiceId}
                    className="flex items-center justify-between gap-3 rounded-lg border border-[#d4af37]/20 bg-[#0f172a] px-3 py-2 text-sm"
                  >
                    <span className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="voice-id"
                        checked={selectedVoiceId === voice.voiceId}
                        onChange={() => setSelectedVoiceId(voice.voiceId)}
                        className="h-4 w-4 border-[#d4af37]/50 bg-[#0f172a] text-[#d4af37] focus:ring-[#d4af37]/50"
                      />
                      <span>{voice.name}</span>
                    </span>
                    {voice.preview_url ? (
                      <audio controls preload="none" src={voice.preview_url} className="h-8 max-w-[180px]" />
                    ) : null}
                  </label>
                ))}
              </div>
            ) : null}

            <button
              type="button"
              onClick={() => void handleGenerateVoice()}
              disabled={isGeneratingVoice || !poem.trim() || !selectedVoiceId}
              className="mt-4 rounded-lg border border-[#d4af37]/40 px-5 py-2.5 text-sm font-semibold text-[#f8f1df] hover:bg-[#1a2642] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isGeneratingVoice ? 'Generating voiceover...' : 'Generate voiceover'}
            </button>

            {voiceUrl && voiceDuration ? (
              <div className="mt-4 rounded-lg border border-[#d4af37]/25 bg-[#0f172a] p-4">
                <audio src={voiceUrl} controls className="w-full" />
                <p className="mt-2 text-sm text-[#f8f1df]/80">
                  Duration: <span className="text-[#f8f1df]">{formatDuration(voiceDuration)}</span>
                </p>
                <p className="text-sm text-[#f8f1df]/80">
                  Will generate <span className="text-[#f8f1df]">{clipCountPreview}</span> Veo clips (~
                  <span className="text-[#f8f1df]">{clipCountPreview * 8}s</span>)
                </p>
              </div>
            ) : null}

            <h2 className={`${headingFont.className} mt-8 text-2xl text-[#f8f1df]`}>Step 3 - Video scenes</h2>
            <label className="mt-4 block text-sm text-[#f8f1df]/85">
              Scenic prompt (all clips)
              <textarea
                value={singlePrompt}
                onChange={(event) => setSinglePrompt(event.target.value)}
                rows={3}
                className="mt-2 w-full rounded-lg border border-[#d4af37]/30 bg-[#0f172a] px-3 py-2 text-sm text-[#f8f1df] focus:outline-none focus:ring-2 focus:ring-[#d4af37]/40"
                placeholder="Describe the scenic style for the whole poem video..."
              />
            </label>

            <label className="mt-4 flex items-start gap-3 rounded-lg border border-[#d4af37]/25 bg-[#0f172a] p-3 text-sm text-[#f8f1df]/85">
              <input
                type="checkbox"
                checked={useDifferentScenes}
                onChange={(event) => {
                  const checked = event.target.checked
                  setUseDifferentScenes(checked)
                  if (checked) {
                    setClipPrompts(Array.from({ length: Math.max(1, clipCountPreview) }, () => singlePrompt))
                  }
                }}
                className="mt-0.5 h-4 w-4 rounded border-[#d4af37]/50 bg-[#0b1120] text-[#d4af37] focus:ring-[#d4af37]/60"
              />
              <span>Use different scenes per clip</span>
            </label>

            {useDifferentScenes && clipCountPreview > 0 ? (
              <div className="mt-3 space-y-2">
                {Array.from({ length: clipCountPreview }, (_, index) => (
                  <label key={`clip-prompt-${index}`} className="block text-xs text-[#f8f1df]/75">
                    Clip {index + 1} prompt
                    <textarea
                      value={clipPrompts[index] || ''}
                      onChange={(event) =>
                        setClipPrompts((current) => {
                          const next = [...current]
                          next[index] = event.target.value
                          return next
                        })
                      }
                      rows={2}
                      className="mt-1 w-full rounded-lg border border-[#d4af37]/25 bg-[#101a30] px-3 py-2 text-sm text-[#f8f1df] focus:outline-none focus:ring-2 focus:ring-[#d4af37]/40"
                    />
                  </label>
                ))}
              </div>
            ) : null}

            <label className="mt-4 flex items-start gap-3 rounded-lg border border-[#d4af37]/25 bg-[#0f172a] p-3 text-sm text-[#f8f1df]/85">
              <input
                type="checkbox"
                checked={keepAmbient}
                onChange={(event) => setKeepAmbient(event.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-[#d4af37]/50 bg-[#0b1120] text-[#d4af37] focus:ring-[#d4af37]/60"
              />
              <span>Keep Veo ambient audio (ducked to 15%)</span>
            </label>

            <button
              type="button"
              onClick={() => void handleGenerateVideo()}
              disabled={isGeneratingVideo || !voiceKey || !voiceDuration}
              className="mt-5 rounded-lg bg-[#d4af37] px-5 py-2.5 text-sm font-semibold text-[#0b1120] hover:bg-[#e2c462] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isGeneratingVideo ? 'Generating video...' : 'Generate video'}
            </button>

            {errorMessage ? <p className="mt-3 text-sm text-red-300">{errorMessage}</p> : null}
          </section>

          <section className="rounded-2xl border border-[#d4af37]/20 bg-[#121a2d] p-6">
            <h2 className={`${headingFont.className} text-2xl text-[#f8f1df]`}>Generation Status</h2>

            {status === 'idle' ? (
              <p className="mt-4 text-sm text-[#f8f1df]/70">
                Generate poem and voiceover, then launch scenic clips. Status updates appear here automatically.
              </p>
            ) : null}

            {status === 'generating' || status === 'mixing' ? (
              <div className="mt-4 rounded-xl border border-[#d4af37]/25 bg-[#0f172a] p-4">
                <div className="flex items-center gap-3">
                  <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-[#d4af37]/25 border-t-[#d4af37]" />
                  <p className="text-sm text-[#f8f1df]">
                    {status === 'mixing'
                      ? 'Mixing voice + video...'
                      : `Generating clip ${Math.min(progressDone + 1, progressTotal)}/${progressTotal}...`}
                  </p>
                </div>
                {parentJobId ? (
                  <p className="mt-3 break-all text-xs text-[#f8f1df]/60">
                    Parent Job ID: <span className="font-mono">{parentJobId}</span>
                  </p>
                ) : null}
              </div>
            ) : null}

            {status === 'done' && videoUrl ? (
              <div className="mt-4 space-y-3">
                <video src={videoUrl} controls className="w-full rounded-lg border border-[#d4af37]/25 bg-black" />
                {videoKey ? <p className="break-all text-xs text-[#f8f1df]/60">Key: {videoKey}</p> : null}
              </div>
            ) : null}

            {status === 'error' ? (
              <p className="mt-4 text-sm text-red-300">
                Generation failed. Fix inputs and run again.
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

            <div className="mt-4 rounded-xl border border-[#d4af37]/25 bg-[#0f172a] p-4">
              <h3 className={`${headingFont.className} text-xl text-[#f8f1df]`}>
                Shared Video Library
              </h3>
              <p className="mt-1 text-xs text-[#f8f1df]/70">
                Scenic and Poem outputs sync here automatically, including individual generated clips.
              </p>
              {videoLibrary.length === 0 ? (
                <p className="mt-3 text-xs text-[#f8f1df]/65">No saved videos yet.</p>
              ) : (
                <div className="mt-3 space-y-2">
                  {videoLibrary.map((item) => (
                    <div
                      key={item.id}
                      className="rounded-lg border border-[#d4af37]/20 bg-[#101a30] p-3"
                    >
                      <p className="text-xs text-[#f8f1df]/75">
                        Saved {new Date(item.savedAtIso).toLocaleString()} • {Math.max(1, item.durationSeconds)}s
                      </p>
                      <p className="mt-1 break-all text-[11px] text-[#f8f1df]/60">{item.key}</p>
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
