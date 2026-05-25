'use client'

import Link from 'next/link'
import { useMemo, useRef, useState } from 'react'
import { ProfileImageUploader } from './_components/ProfileImageUploader'
import { VoiceSelector } from './_components/VoiceSelector'
import { VoicemailPreview } from './_components/VoicemailPreview'
import { VoiceOption, VoicemailPreviewData, VoicemailTheme } from './_components/types'

const DEFAULT_VOICES: VoiceOption[] = [
  { id: '21m00Tcm4TlvDq8ikWAM', label: 'Rachel (default)' },
  { id: 'AZnzlk1XvdvUeBnXmlld', label: 'Domi' },
  { id: 'EXAVITQu4vr4xnSDxMaL', label: 'Bella' },
  { id: 'TxGEqnHWrfWFTfGW9XjX', label: 'Josh' },
  { id: 'VR6AewLTigWG4xSOukaG', label: 'Arnold' },
]

const DEFAULT_FORM: VoicemailPreviewData = {
  profileImageUrl: null,
  contactName: 'Mom',
  emoji: '',
  metadataLine: 'home - Oct 15, 2025 at 7:16 PM',
  topLabel: '',
  transcriptText: 'Transcript (low confidence)',
  theme: 'ios_voicemail',
  script:
    'Hey honey. Just checking in to say I love you and I am proud of you. If you get this, call me back when you have a minute.',
}

const THEME_OPTIONS: Array<{ id: VoicemailTheme; label: string }> = [
  { id: 'ios_voicemail', label: 'iOS Voicemail' },
  { id: 'classic_dark', label: 'Classic Dark (legacy)' },
  { id: 'soft_blur', label: 'Soft Blur (legacy)' },
  { id: 'minimal_black', label: 'Minimal Black (legacy)' },
]

interface GenerateAudioResponse {
  audioUrl?: string
  audioKey?: string
  durationSeconds?: number | null
  voiceId?: string
  jobId?: string
  error?: string
  details?: string
  code?: string
}

interface GenerateVideoResponse {
  videoUrl?: string
  videoKey?: string
  durationSeconds?: number
  jobId?: string
  error?: string
  details?: string
}

type ScriptTone = 'Warm' | 'Funny' | 'Bittersweet' | 'Comforting' | 'Casual'
type ScriptLength = 'short_10_15' | 'medium_20_30'

interface GenerateScriptResponse {
  script?: string
  error?: string
  details?: string
}

const SCRIPT_TONE_OPTIONS: ScriptTone[] = ['Warm', 'Funny', 'Bittersweet', 'Comforting', 'Casual']

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result)
      } else {
        reject(new Error('Failed to read image file as data URL.'))
      }
    }
    reader.onerror = () => reject(new Error('Failed to read selected file.'))
    reader.readAsDataURL(file)
  })
}

function resolveAudioDuration(audioSourceUrl: string): Promise<number> {
  return new Promise((resolve) => {
    const audio = new Audio(audioSourceUrl)
    const cleanup = () => {
      audio.removeAttribute('src')
      audio.load()
    }

    audio.addEventListener('loadedmetadata', () => {
      const duration = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 0
      cleanup()
      resolve(duration)
    })
    audio.addEventListener('error', () => {
      cleanup()
      resolve(0)
    })
  })
}

export default function VoicemailTesterPage() {
  const isDevMode = process.env.NODE_ENV !== 'production'
  const previewRef = useRef<HTMLDivElement | null>(null)
  const [formData, setFormData] = useState<VoicemailPreviewData>(DEFAULT_FORM)
  const [previewData, setPreviewData] = useState<VoicemailPreviewData>(DEFAULT_FORM)
  const [voiceId, setVoiceId] = useState(DEFAULT_VOICES[0].id)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [audioKey, setAudioKey] = useState<string | null>(null)
  const [durationSeconds, setDurationSeconds] = useState<number | null>(null)
  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  const [videoKey, setVideoKey] = useState<string | null>(null)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isGeneratingAudio, setIsGeneratingAudio] = useState(false)
  const [isRenderingVideo, setIsRenderingVideo] = useState(false)
  const [isGeneratingScript, setIsGeneratingScript] = useState(false)
  const [showReferenceOverlay, setShowReferenceOverlay] = useState(false)
  const [referenceOverlayOpacity, setReferenceOverlayOpacity] = useState(0.4)
  const [referenceOverlayScale, setReferenceOverlayScale] = useState(1)
  const [referenceOverlayOffsetX, setReferenceOverlayOffsetX] = useState(0)
  const [referenceOverlayOffsetY, setReferenceOverlayOffsetY] = useState(0)
  const [scriptRelationship, setScriptRelationship] = useState('Mom')
  const [scriptTone, setScriptTone] = useState<ScriptTone>('Warm')
  const [scriptOccasion, setScriptOccasion] = useState('just thinking of you')
  const [scriptMemoryDetails, setScriptMemoryDetails] = useState('')
  const [scriptLength, setScriptLength] = useState<ScriptLength>('short_10_15')

  const selectedVoiceLabel = useMemo(
    () => DEFAULT_VOICES.find((voice) => voice.id === voiceId)?.label || voiceId,
    [voiceId]
  )

  const handleProfileFileSelected = async (file: File | null) => {
    if (!file) {
      setFormData((prev) => ({ ...prev, profileImageUrl: null }))
      return
    }

    try {
      const dataUrl = await fileToDataUrl(file)
      setFormData((prev) => ({ ...prev, profileImageUrl: dataUrl }))
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Image upload failed.')
    }
  }

  const handlePreview = () => {
    setPreviewData(formData)
    setStatusMessage('Preview updated.')
    setErrorMessage(null)
    previewRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const handleGenerateAudio = async () => {
    setStatusMessage(null)
    setErrorMessage(null)
    setVideoUrl(null)
    setVideoKey(null)

    if (!formData.script.trim()) {
      setErrorMessage('Please add a voicemail script first.')
      return
    }

    setIsGeneratingAudio(true)
    try {
      const response = await fetch('/api/voicemail/generate-audio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          script: formData.script,
          voiceId,
        }),
      })

      const data = (await response.json()) as GenerateAudioResponse
      if (!response.ok) {
        const readable = data.details || data.error || 'Audio generation failed.'
        setErrorMessage(readable)
        if (data.code === 'ELEVENLABS_NOT_CONFIGURED') {
          setStatusMessage('Preview is still available without generated audio.')
        }
        return
      }

      if (!data.audioUrl || !data.audioKey) {
        setErrorMessage('Audio response did not include audioUrl/audioKey.')
        return
      }

      const metadataDuration = await resolveAudioDuration(data.audioUrl)

      setAudioUrl(data.audioUrl)
      setAudioKey(data.audioKey)
      setDurationSeconds(
        typeof data.durationSeconds === 'number' && Number.isFinite(data.durationSeconds)
          ? data.durationSeconds
          : metadataDuration > 0
            ? metadataDuration
            : null
      )
      setPreviewData(formData)
      setStatusMessage(`Audio generated with ${selectedVoiceLabel}.`)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unexpected audio generation failure.')
    } finally {
      setIsGeneratingAudio(false)
    }
  }

  const handleGenerateVideo = async () => {
    setStatusMessage(null)
    setErrorMessage(null)
    setVideoUrl(null)
    setVideoKey(null)

    if (!audioUrl || !audioKey || !durationSeconds) {
      setErrorMessage('Generate audio first. Video rendering requires audio URL/key and duration.')
      return
    }

    setIsRenderingVideo(true)
    try {
      const response = await fetch('/api/voicemail/generate-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contactName: previewData.contactName,
          emoji: previewData.emoji,
          metadataLine: previewData.metadataLine,
          script: previewData.script,
          topLabel: previewData.topLabel,
          transcriptText: previewData.transcriptText,
          theme: previewData.theme,
          profileImageDataUrl: previewData.profileImageUrl,
          voiceId,
          audioUrl,
          audioKey,
          durationSeconds,
        }),
      })

      const data = (await response.json()) as GenerateVideoResponse
      if (!response.ok) {
        throw new Error(data.details || data.error || 'Video render failed.')
      }

      if (!data.videoUrl) {
        throw new Error('Video render completed but no video URL was returned.')
      }

      setVideoUrl(data.videoUrl)
      setVideoKey(data.videoKey || null)
      setStatusMessage('Video rendered successfully.')
      previewRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unexpected video rendering failure.')
    } finally {
      setIsRenderingVideo(false)
    }
  }

  const handleGenerateScript = async () => {
    setStatusMessage(null)
    setErrorMessage(null)
    setIsGeneratingScript(true)
    try {
      const response = await fetch('/api/voicemail/generate-script', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          relationship: scriptRelationship,
          tone: scriptTone,
          occasion: scriptOccasion,
          memoryDetails: scriptMemoryDetails,
          length: scriptLength,
        }),
      })

      const data = (await response.json()) as GenerateScriptResponse
      if (!response.ok) {
        throw new Error(data.details || data.error || 'Script generation failed.')
      }
      if (!data.script) {
        throw new Error('Script generation returned no script.')
      }

      setFormData((prev) => ({ ...prev, script: data.script || prev.script }))
      setStatusMessage('Script generated. Edit it if needed, then generate audio.')
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unexpected script generation failure.')
    } finally {
      setIsGeneratingScript(false)
    }
  }

  return (
    <div className="space-y-6 p-6 lg:p-8">
      <div>
        <Link href="/admin/social" className="mb-2 inline-flex text-sm text-gray-400 hover:text-gray-200">
          ← Back to Social Dashboard
        </Link>
        <h1 className="text-3xl font-bold text-white">Voicemail Video Tester</h1>
        <p className="mt-1 max-w-3xl text-sm text-gray-400">
          Experimental tool for voicemail-style vertical previews and ElevenLabs audio generation.
        </p>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.2fr,1fr]">
        <section className="space-y-4 rounded-2xl border border-gray-800 bg-[#151a26] p-5">
          <h2 className="text-lg font-semibold text-white">Voicemail inputs</h2>

          <ProfileImageUploader imageUrl={formData.profileImageUrl} onFileSelected={handleProfileFileSelected} />

          <div className="grid gap-3 md:grid-cols-2">
            <label className="space-y-2">
              <span className="block text-sm text-gray-300">Contact name</span>
              <input
                value={formData.contactName}
                onChange={(event) => setFormData((prev) => ({ ...prev, contactName: event.target.value }))}
                className="w-full rounded-lg border border-gray-700 bg-[#0f1729] px-3 py-2 text-sm text-gray-100"
              />
            </label>
            <label className="space-y-2">
              <span className="block text-sm text-gray-300">Optional emoji</span>
              <input
                value={formData.emoji}
                onChange={(event) => setFormData((prev) => ({ ...prev, emoji: event.target.value }))}
                className="w-full rounded-lg border border-gray-700 bg-[#0f1729] px-3 py-2 text-sm text-gray-100"
              />
            </label>
          </div>

          <label className="space-y-2">
            <span className="block text-sm text-gray-300">Metadata line</span>
            <input
              value={formData.metadataLine}
              onChange={(event) => setFormData((prev) => ({ ...prev, metadataLine: event.target.value }))}
              className="w-full rounded-lg border border-gray-700 bg-[#0f1729] px-3 py-2 text-sm text-gray-100"
            />
          </label>

          <div className="grid gap-3 md:grid-cols-2">
            <label className="space-y-2">
              <span className="block text-sm text-gray-300">Top label</span>
              <input
                value={formData.topLabel}
                onChange={(event) => setFormData((prev) => ({ ...prev, topLabel: event.target.value }))}
                className="w-full rounded-lg border border-gray-700 bg-[#0f1729] px-3 py-2 text-sm text-gray-100"
              />
            </label>
            <label className="space-y-2">
              <span className="block text-sm text-gray-300">Theme</span>
              <select
                value={formData.theme}
                onChange={(event) =>
                  setFormData((prev) => ({ ...prev, theme: event.target.value as VoicemailTheme }))
                }
                className="w-full rounded-lg border border-gray-700 bg-[#0f1729] px-3 py-2 text-sm text-gray-100"
              >
                {THEME_OPTIONS.map((theme) => (
                  <option key={theme.id} value={theme.id}>
                    {theme.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="space-y-2">
            <span className="block text-sm text-gray-300">Transcript text</span>
            <input
              value={formData.transcriptText}
              onChange={(event) => setFormData((prev) => ({ ...prev, transcriptText: event.target.value }))}
              className="w-full rounded-lg border border-gray-700 bg-[#0f1729] px-3 py-2 text-sm text-gray-100"
            />
          </label>

          <section className="space-y-3 rounded-xl border border-gray-800 bg-[#0f1420] p-4">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-cyan-200">Generate Script</h3>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="space-y-1.5">
                <span className="block text-xs text-gray-300">Relationship</span>
                <input
                  value={scriptRelationship}
                  onChange={(event) => setScriptRelationship(event.target.value)}
                  className="w-full rounded-lg border border-gray-700 bg-[#0f1729] px-3 py-2 text-sm text-gray-100"
                />
              </label>
              <label className="space-y-1.5">
                <span className="block text-xs text-gray-300">Tone</span>
                <select
                  value={scriptTone}
                  onChange={(event) => setScriptTone(event.target.value as ScriptTone)}
                  className="w-full rounded-lg border border-gray-700 bg-[#0f1729] px-3 py-2 text-sm text-gray-100"
                >
                  {SCRIPT_TONE_OPTIONS.map((tone) => (
                    <option key={tone} value={tone}>
                      {tone}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1.5 md:col-span-2">
                <span className="block text-xs text-gray-300">Occasion / reason</span>
                <input
                  value={scriptOccasion}
                  onChange={(event) => setScriptOccasion(event.target.value)}
                  className="w-full rounded-lg border border-gray-700 bg-[#0f1729] px-3 py-2 text-sm text-gray-100"
                />
              </label>
              <label className="space-y-1.5 md:col-span-2">
                <span className="block text-xs text-gray-300">Memory details</span>
                <textarea
                  value={scriptMemoryDetails}
                  onChange={(event) => setScriptMemoryDetails(event.target.value)}
                  placeholder="Mention a small memory, phrase, habit, or thing they loved..."
                  rows={3}
                  className="w-full rounded-lg border border-gray-700 bg-[#0f1729] px-3 py-2 text-sm text-gray-100"
                />
              </label>
              <label className="space-y-1.5">
                <span className="block text-xs text-gray-300">Length</span>
                <select
                  value={scriptLength}
                  onChange={(event) => setScriptLength(event.target.value as ScriptLength)}
                  className="w-full rounded-lg border border-gray-700 bg-[#0f1729] px-3 py-2 text-sm text-gray-100"
                >
                  <option value="short_10_15">Short, 10-15 seconds</option>
                  <option value="medium_20_30">Medium, 20-30 seconds</option>
                </select>
              </label>
            </div>
            <button
              type="button"
              onClick={handleGenerateScript}
              disabled={isGeneratingScript}
              className="rounded-lg border border-cyan-300/60 bg-cyan-300/10 px-4 py-2 text-sm font-semibold text-cyan-100 transition hover:bg-cyan-300/20 disabled:opacity-60"
            >
              {isGeneratingScript ? 'Generating Script...' : 'Generate Script'}
            </button>
          </section>

          <label className="space-y-2">
            <span className="block text-sm text-gray-300">Voicemail script</span>
            <textarea
              value={formData.script}
              onChange={(event) => setFormData((prev) => ({ ...prev, script: event.target.value }))}
              rows={6}
              className="w-full rounded-lg border border-gray-700 bg-[#0f1729] px-3 py-2 text-sm text-gray-100"
            />
          </label>

          <VoiceSelector voiceId={voiceId} voices={DEFAULT_VOICES} onChange={setVoiceId} />

          <div className="flex flex-wrap gap-3 pt-2">
            <button
              type="button"
              onClick={handleGenerateAudio}
              disabled={isGeneratingAudio}
              className="rounded-lg bg-cyan-400 px-4 py-2 text-sm font-semibold text-[#03141c] transition hover:bg-cyan-300 disabled:opacity-60"
            >
              {isGeneratingAudio ? 'Generating Audio...' : 'Generate Audio'}
            </button>
            <button
              type="button"
              onClick={handlePreview}
              className="rounded-lg border border-gray-600 px-4 py-2 text-sm text-gray-100 transition hover:bg-gray-800"
            >
              Preview Voicemail UI
            </button>
            <button
              type="button"
              onClick={handleGenerateVideo}
              disabled={!audioUrl || !audioKey || !durationSeconds || isRenderingVideo}
              title={!audioUrl || !audioKey ? 'Generate audio first.' : undefined}
              className="rounded-lg border border-gray-700 px-4 py-2 text-sm text-gray-100 transition hover:bg-gray-800 disabled:text-gray-500 disabled:hover:bg-transparent"
            >
              {isRenderingVideo ? 'Rendering video...' : 'Generate Video'}
            </button>
          </div>

          {statusMessage && <p className="text-sm text-emerald-300">{statusMessage}</p>}
          {errorMessage && <p className="text-sm text-amber-300">{errorMessage}</p>}
          {videoUrl && (
            <p className="text-sm text-cyan-300">
              Video ready:{' '}
              <a href={videoUrl} target="_blank" rel="noreferrer" className="underline">
                Open / download MP4
              </a>
              {videoKey ? <span className="ml-2 text-xs text-gray-400">({videoKey})</span> : null}
            </p>
          )}
        </section>

        <section ref={previewRef} className="space-y-3 rounded-2xl border border-gray-800 bg-[#121620] p-5">
          <h2 className="text-lg font-semibold text-white">Voicemail preview (9:16)</h2>
          <p className="text-xs text-gray-400">
            iOS-voicemail inspired layout. Audio progress and playback sync automatically.
          </p>
          {isDevMode ? (
            <div className="space-y-2 rounded-lg border border-gray-800 bg-[#0d111a] p-3">
              <label className="inline-flex items-center gap-2 text-xs text-gray-300">
                <input
                  type="checkbox"
                  checked={showReferenceOverlay}
                  onChange={(event) => setShowReferenceOverlay(event.target.checked)}
                  className="h-3.5 w-3.5 rounded border-gray-500 bg-[#0f1729]"
                />
                Show reference overlay
              </label>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <label className="text-xs text-gray-300">
                  Opacity: {referenceOverlayOpacity.toFixed(2)}
                  <input
                    type="range"
                    min={0.1}
                    max={0.8}
                    step={0.01}
                    value={referenceOverlayOpacity}
                    onChange={(event) => setReferenceOverlayOpacity(Number(event.target.value))}
                    className="mt-1 w-full accent-cyan-300"
                  />
                </label>
                <label className="text-xs text-gray-300">
                  Scale: {referenceOverlayScale.toFixed(2)}
                  <input
                    type="range"
                    min={0.9}
                    max={1.1}
                    step={0.01}
                    value={referenceOverlayScale}
                    onChange={(event) => setReferenceOverlayScale(Number(event.target.value))}
                    className="mt-1 w-full accent-cyan-300"
                  />
                </label>
                <label className="text-xs text-gray-300">
                  Offset X: {referenceOverlayOffsetX}px
                  <input
                    type="range"
                    min={-50}
                    max={50}
                    step={1}
                    value={referenceOverlayOffsetX}
                    onChange={(event) => setReferenceOverlayOffsetX(Number(event.target.value))}
                    className="mt-1 w-full accent-cyan-300"
                  />
                </label>
                <label className="text-xs text-gray-300">
                  Offset Y: {referenceOverlayOffsetY}px
                  <input
                    type="range"
                    min={-50}
                    max={50}
                    step={1}
                    value={referenceOverlayOffsetY}
                    onChange={(event) => setReferenceOverlayOffsetY(Number(event.target.value))}
                    className="mt-1 w-full accent-cyan-300"
                  />
                </label>
              </div>
            </div>
          ) : null}
          <VoicemailPreview
            data={previewData}
            audioUrl={audioUrl}
            durationSeconds={durationSeconds}
            showReferenceOverlay={isDevMode && showReferenceOverlay}
            referenceOverlayOpacity={referenceOverlayOpacity}
            referenceOverlayScale={referenceOverlayScale}
            referenceOverlayOffsetX={referenceOverlayOffsetX}
            referenceOverlayOffsetY={referenceOverlayOffsetY}
          />
        </section>
      </div>
    </div>
  )
}
