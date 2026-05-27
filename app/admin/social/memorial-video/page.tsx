'use client'
/* eslint-disable @next/next/no-img-element */

import { useMemo, useState } from 'react'
import { Cormorant_Garamond, DM_Sans } from 'next/font/google'

const headingFont = Cormorant_Garamond({
  subsets: ['latin'],
  weight: ['600', '700'],
})

const bodyFont = DM_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '700'],
})

interface UploadedPhoto {
  id: string
  key: string
  fileName: string
  previewUrl: string
  sourceUrl: string
  previewIsObjectUrl?: boolean
}

interface UploadedMusic {
  key: string
  fileName: string
}

interface SlideshowResult {
  url: string
  key: string
  jobId: string
  duration: number
}

interface UploadUrlResponse {
  uploadUrl: string
  key: string
  publicUrl: string
}

interface S3ReferenceBrowseItem {
  key: string
  presignedUrl: string
}

interface GenerateReferencePhotoResponse {
  key: string
  url: string
}

interface SendToDeviceResult {
  imported_count?: number
  note_created?: boolean
}

type PhotoInputMode = 'upload' | 'reference'
type PhotoRepeatCount = 1 | 2 | 3

interface ChainedSlideConfig {
  id: string
  scene: string
  activity: string
  blurLevel: number
  ageDeltaYears: number
  photoFilterStyle: (typeof PHOTO_FILTER_OPTIONS)[number]['value']
}

const CUSTOM_OPTION_VALUE = '__custom__'
const REFERENCE_PAGE_SIZE = 24
const PHOTO_FILTER_OPTIONS = [
  { value: 'none', label: 'None (natural)' },
  { value: 'black_and_white', label: 'Black & White' },
  { value: 'old_timey', label: 'Old-Timey Vintage' },
  { value: 'faded_film', label: 'Faded Film' },
] as const
const SCENE_OPTIONS = [
  'Sitting on a porch swing',
  'Reading on the couch together',
  'Dancing in the living room',
  'Decorating a Christmas tree',
  'Eating fast food in the car',
  'Standing around in the kitchen',
  'Watching TV on the couch',
  'Pushing a cart through the grocery store',
  'Sitting in a parked car',
  'Waiting in a restaurant booth',
  'Hanging out on the back patio',
  'Walking through a parking lot',
  'Sitting at the kitchen table',
  'Killing time in a living room',
  'Standing in the driveway',
]

function getDefaultScene(order: number): string {
  return SCENE_OPTIONS[(order - 2) % SCENE_OPTIONS.length]
}

function ensurePositiveNumber(value: string, fallback: number): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback
  }
  return parsed
}

export default function MemorialVideoPage() {
  const [jobId, setJobId] = useState('')
  const [photoInputMode, setPhotoInputMode] = useState<PhotoInputMode>('upload')
  const [photos, setPhotos] = useState<UploadedPhoto[]>([])
  const [music, setMusic] = useState<UploadedMusic | null>(null)
  const [secondsPerPhoto, setSecondsPerPhoto] = useState(2)
  const [photoRepeatCount, setPhotoRepeatCount] = useState<PhotoRepeatCount>(1)
  const [isUploadingPhotos, setIsUploadingPhotos] = useState(false)
  const [isGeneratingReferencePhotos, setIsGeneratingReferencePhotos] = useState(false)
  const [isUploadingMusic, setIsUploadingMusic] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [isSendingToDevice, setIsSendingToDevice] = useState(false)
  const [sendToDeviceResult, setSendToDeviceResult] = useState<SendToDeviceResult | null>(null)
  const [deviceNoteText, setDeviceNoteText] = useState('')
  const [slide1Detail, setSlide1Detail] = useState('')
  const [slide1BlurLevel, setSlide1BlurLevel] = useState(1)
  const [slide1AgeDeltaYears, setSlide1AgeDeltaYears] = useState(0)
  const [slide1PhotoFilterStyle, setSlide1PhotoFilterStyle] = useState<(typeof PHOTO_FILTER_OPTIONS)[number]['value']>('none')
  const [chainedSlides, setChainedSlides] = useState<ChainedSlideConfig[]>([
    {
      id: crypto.randomUUID(),
      scene: getDefaultScene(2),
      activity: 'smiling for a photo',
      blurLevel: 1,
      ageDeltaYears: 0,
      photoFilterStyle: 'none',
    },
  ])
  const [slideProgress, setSlideProgress] = useState<Record<string, string>>({})
  const [showReferencePicker, setShowReferencePicker] = useState(false)
  const [referencePrefixInput, setReferencePrefixInput] = useState('uploads/')
  const [referenceActivePrefix, setReferenceActivePrefix] = useState('uploads/')
  const [referenceItems, setReferenceItems] = useState<S3ReferenceBrowseItem[]>([])
  const [referencePage, setReferencePage] = useState(1)
  const [referencePageInput, setReferencePageInput] = useState('1')
  const [referenceHasNextPage, setReferenceHasNextPage] = useState(false)
  const [referenceLoading, setReferenceLoading] = useState(false)
  const [referencePickerError, setReferencePickerError] = useState<string | null>(null)
  const [selectedReferenceKey, setSelectedReferenceKey] = useState('')
  const [selectedReferencePreviewUrl, setSelectedReferencePreviewUrl] = useState<string | null>(null)
  const [sceneCustomMode, setSceneCustomMode] = useState<Record<string, boolean>>({})
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<SlideshowResult | null>(null)

  const orderedKeys = useMemo(() => photos.map((photo) => photo.key), [photos])

  function getOrCreateJobId(): string {
    if (jobId) return jobId
    const next = crypto.randomUUID()
    setJobId(next)
    return next
  }

  async function requestUploadUrl(payload: {
    jobId: string
    fileName: string
    contentType: string
    kind: 'photo' | 'music'
  }): Promise<UploadUrlResponse> {
    const response = await fetch('/api/memorial-video/upload-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const data = await response.json()
    if (!response.ok) {
      throw new Error(data?.error || data?.details || 'Failed to create upload URL')
    }
    return data as UploadUrlResponse
  }

  async function uploadFileToS3(uploadUrl: string, file: File): Promise<void> {
    const response = await fetch(uploadUrl, {
      method: 'PUT',
      body: file,
      headers: {
        'Content-Type': file.type || 'application/octet-stream',
      },
    })
    if (!response.ok) {
      throw new Error('Failed uploading file to S3')
    }
  }

  async function browseReferencePrefix(prefix: string, page = 1) {
    setReferenceLoading(true)
    setReferencePickerError(null)
    try {
      const params = new URLSearchParams({ prefix })
      params.set('page', String(Math.max(1, page)))
      params.set('pageSize', String(REFERENCE_PAGE_SIZE))
      const response = await fetch(`/api/admin/social/reference-browse?${params.toString()}`)
      const data = await response.json()
      if (!response.ok) {
        throw new Error(data?.error || data?.details || 'Failed to browse S3 reference photos')
      }

      const nextItems: S3ReferenceBrowseItem[] = Array.isArray(data.items) ? data.items : []
      const resolvedPage = typeof data.page === 'number' && Number.isFinite(data.page) && data.page > 0
        ? Math.floor(data.page)
        : Math.max(1, page)
      setReferenceActivePrefix(prefix)
      setReferencePrefixInput(prefix)
      setReferenceItems(nextItems)
      setReferencePage(resolvedPage)
      setReferencePageInput(String(resolvedPage))
      setReferenceHasNextPage(Boolean(data.hasNextPage))
    } catch (browseError) {
      setReferencePickerError(
        browseError instanceof Error ? browseError.message : 'Failed to browse S3 reference photos'
      )
    } finally {
      setReferenceLoading(false)
    }
  }

  function updateChainedSlide(
    id: string,
    field: 'scene' | 'activity' | 'blurLevel' | 'ageDeltaYears' | 'photoFilterStyle',
    value: string | number | (typeof PHOTO_FILTER_OPTIONS)[number]['value']
  ) {
    setChainedSlides((prev) => prev.map((slide) => (slide.id === id ? { ...slide, [field]: value } : slide)))
  }

  function addChainedSlide() {
    setChainedSlides((prev) => {
      if (prev.length >= 9) return prev
      const order = prev.length + 2
      return [
        ...prev,
        {
          id: crypto.randomUUID(),
          scene: getDefaultScene(order),
          activity: 'smiling for a photo',
          blurLevel: 1,
          ageDeltaYears: 0,
          photoFilterStyle: 'none',
        },
      ]
    })
  }

  function removeLastChainedSlide() {
    let removedId: string | null = null
    setChainedSlides((prev) => {
      if (prev.length <= 1) return prev
      removedId = prev[prev.length - 1]?.id || null
      const next = prev.slice(0, -1)
      return next
    })
    setSlideProgress((prev) => {
      const next = { ...prev }
      if (removedId) {
        delete next[removedId]
      }
      return next
    })
    setSceneCustomMode((prev) => {
      if (!removedId) return prev
      const next = { ...prev }
      delete next[removedId]
      return next
    })
  }

  async function handlePhotosSelected(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return

    setError(null)
    setResult(null)
    setSendToDeviceResult(null)

    const incoming = Array.from(fileList).filter((file) => file.type.startsWith('image/'))
    if (incoming.length === 0) {
      setError('Select at least one image file.')
      return
    }

    if (photos.length + incoming.length > 10) {
      setError('You can upload up to 10 photos total.')
      return
    }

    const activeJobId = getOrCreateJobId()
    setIsUploadingPhotos(true)

    try {
      const nextPhotos: UploadedPhoto[] = []
      for (const file of incoming) {
        const { uploadUrl, key, publicUrl } = await requestUploadUrl({
          jobId: activeJobId,
          fileName: file.name,
          contentType: file.type || 'image/jpeg',
          kind: 'photo',
        })
        await uploadFileToS3(uploadUrl, file)
        nextPhotos.push({
          id: crypto.randomUUID(),
          key,
          fileName: file.name,
          previewUrl: URL.createObjectURL(file),
          sourceUrl: publicUrl,
          previewIsObjectUrl: true,
        })
      }
      setPhotos((prev) => [...prev, ...nextPhotos])
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'Failed to upload photo files.')
    } finally {
      setIsUploadingPhotos(false)
    }
  }

  async function handleGenerateFromReference() {
    setError(null)
    setResult(null)
    setSendToDeviceResult(null)

    const activeJobId = getOrCreateJobId()
    const slide1DetailTrimmed = slide1Detail.trim()
    const chained = chainedSlides.map((slide) => ({
      ...slide,
      scene: slide.scene.trim(),
      activity: slide.activity.trim(),
      blurLevel: Math.min(10, Math.max(1, Math.floor(slide.blurLevel || 1))),
      ageDeltaYears: Number.isFinite(slide.ageDeltaYears) ? Math.max(-60, Math.min(60, Math.floor(slide.ageDeltaYears))) : 0,
      photoFilterStyle: slide.photoFilterStyle || 'none',
    }))

    if (!selectedReferenceKey) {
      setError('Pick one S3 reference photo first.')
      return
    }
    if (chained.some((slide) => !slide.scene)) {
      setError('Each chained slide needs an activity/scene.')
      return
    }
    const totalToGenerate = 1 + chained.length
    if (photos.length + totalToGenerate > 10) {
      setError(`You can only have 10 photos total. Remove ${photos.length + totalToGenerate - 10} first.`)
      return
    }

    setIsGeneratingReferencePhotos(true)
    setSlideProgress({})

    const generatedPhotos: UploadedPhoto[] = []
    const failedSlides: string[] = []

    let previousImageUrl: string | null = null
    const slide1ProgressId = 'slide-1'

    setSlideProgress((prev) => ({ ...prev, [slide1ProgressId]: 'Generating...' }))
    try {
      const response = await fetch('/api/memorial-video/generate-reference-photo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          referenceKey: selectedReferenceKey,
          mode: 'style',
          detail: slide1DetailTrimmed,
          blurLevel: slide1BlurLevel,
          ageDeltaYears: slide1AgeDeltaYears,
          photoFilterStyle: slide1PhotoFilterStyle,
          jobId: activeJobId,
        }),
      })
      const data = await response.json()
      if (!response.ok) {
        throw new Error(data?.error || data?.details || 'Failed generating Slide 1')
      }
      const generated = data as GenerateReferencePhotoResponse
      previousImageUrl = generated.url
      generatedPhotos.push({
        id: crypto.randomUUID(),
        key: generated.key,
        fileName: 'Generated Slide 1',
        previewUrl: generated.url,
        sourceUrl: generated.url,
        previewIsObjectUrl: false,
      })
      setSlideProgress((prev) => ({ ...prev, [slide1ProgressId]: 'Done' }))
    } catch (slide1Error) {
      failedSlides.push(`Slide 1: ${slide1Error instanceof Error ? slide1Error.message : 'Unknown error'}`)
      setSlideProgress((prev) => ({ ...prev, [slide1ProgressId]: 'Failed' }))
    }

    for (let index = 0; index < chained.length; index += 1) {
      const slide = chained[index]
      const slideNumber = index + 2
      setSlideProgress((prev) => ({ ...prev, [slide.id]: 'Generating...' }))
      if (!previousImageUrl) {
        failedSlides.push(`Slide ${slideNumber}: missing previous slide image`)
        setSlideProgress((prev) => ({ ...prev, [slide.id]: 'Failed' }))
        continue
      }

      try {
        const response = await fetch('/api/memorial-video/generate-reference-photo', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            referenceImageUrl: previousImageUrl,
            mode: 'identity',
            prompt: slide.scene,
            activity: slide.activity,
            blurLevel: slide.blurLevel,
            ageDeltaYears: slide.ageDeltaYears,
            photoFilterStyle: slide.photoFilterStyle,
            jobId: activeJobId,
          }),
        })
        const data = await response.json()
        if (!response.ok) {
          throw new Error(data?.error || data?.details || `Failed generating Slide ${slideNumber}`)
        }
        const generated = data as GenerateReferencePhotoResponse
        previousImageUrl = generated.url
        generatedPhotos.push({
          id: crypto.randomUUID(),
          key: generated.key,
          fileName: `Generated Slide ${slideNumber}`,
          previewUrl: generated.url,
          sourceUrl: generated.url,
          previewIsObjectUrl: false,
        })
        setSlideProgress((prev) => ({ ...prev, [slide.id]: 'Done' }))
      } catch (slideError) {
        failedSlides.push(`Slide ${slideNumber}: ${slideError instanceof Error ? slideError.message : 'Unknown error'}`)
        setSlideProgress((prev) => ({ ...prev, [slide.id]: 'Failed' }))
      }
    }

    if (generatedPhotos.length > 0) {
      setPhotos((prev) => [...prev, ...generatedPhotos])
    }
    if (failedSlides.length > 0) {
      setError(`Some slides failed. ${failedSlides.join(' | ')}`)
    }
    setIsGeneratingReferencePhotos(false)
  }

  async function handleMusicSelected(fileList: FileList | null) {
    const file = fileList?.[0]
    if (!file) return

    if (!file.type.startsWith('audio/')) {
      setError('Music upload must be an audio file.')
      return
    }

    setError(null)
    setResult(null)
    setSendToDeviceResult(null)
    const activeJobId = getOrCreateJobId()
    setIsUploadingMusic(true)

    try {
      const { uploadUrl, key } = await requestUploadUrl({
        jobId: activeJobId,
        fileName: file.name,
        contentType: file.type,
        kind: 'music',
      })
      await uploadFileToS3(uploadUrl, file)
      setMusic({ key, fileName: file.name })
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'Failed to upload music file.')
    } finally {
      setIsUploadingMusic(false)
    }
  }

  function movePhoto(index: number, direction: -1 | 1) {
    const nextIndex = index + direction
    if (nextIndex < 0 || nextIndex >= photos.length) return

    setPhotos((prev) => {
      const copy = [...prev]
      const [moved] = copy.splice(index, 1)
      copy.splice(nextIndex, 0, moved)
      return copy
    })
    setResult(null)
    setSendToDeviceResult(null)
  }

  function removePhoto(index: number) {
    setPhotos((prev) => {
      const copy = [...prev]
      const [removed] = copy.splice(index, 1)
      if (removed?.previewIsObjectUrl) URL.revokeObjectURL(removed.previewUrl)
      return copy
    })
    setResult(null)
    setSendToDeviceResult(null)
  }

  async function handleGenerate() {
    setError(null)
    setResult(null)

    if (orderedKeys.length === 0) {
      setError('Upload at least one photo before generating.')
      return
    }

    const seconds = ensurePositiveNumber(String(secondsPerPhoto), 2)
    setSecondsPerPhoto(seconds)
    setIsGenerating(true)

    try {
      const response = await fetch('/api/memorial-video/generate-slideshow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          photoKeys: orderedKeys,
          secondsPerPhoto: seconds,
          photoRepeatCount,
          musicKey: music?.key,
        }),
      })
      const data = await response.json()
      if (!response.ok) {
        throw new Error(data?.error || data?.details || 'Failed to generate slideshow.')
      }
      setResult({
        url: data.url,
        key: data.key,
        jobId: data.jobId,
        duration: Number(data.duration ?? 0),
      })
    } catch (generationError) {
      setError(generationError instanceof Error ? generationError.message : 'Failed to generate slideshow.')
    } finally {
      setIsGenerating(false)
    }
  }

  async function handleSendToDevice() {
    if (!result?.url) {
      setError('Generate the memorial video first, then send to iPhone.')
      return
    }

    setError(null)
    setIsSendingToDevice(true)
    setSendToDeviceResult(null)

    try {
      const payloadSlides = [
        {
          order: 1,
          image_url: result.url,
          overlay_text: deviceNoteText.trim(),
        },
      ]

      const response = await fetch('/api/admin/social/send-to-device', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          post_id: result.jobId,
          trend_name: 'Memorial Video',
          album_name: 'HC-Business',
          slides: payloadSlides,
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
            Memorial Video Slideshow
          </h1>
          <p className="mt-3 max-w-3xl text-sm text-[#f8f1df]/80">
            Upload up to 10 photos, optionally add one music track, set seconds per photo, and generate a memorial MP4 slideshow.
          </p>
          <p className="mt-2 text-xs text-[#f8f1df]/60">
            Job ID: <span className="font-mono">{jobId || 'Will generate on first upload'}</span>
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <section className="rounded-2xl border border-[#d4af37]/20 bg-[#121a2d] p-6">
            <h2 className={`${headingFont.className} text-2xl text-[#f8f1df]`}>1) Photos</h2>
            <p className="mt-2 text-sm text-[#f8f1df]/75">Add up to 10 photos via upload or reference generation.</p>

            <div className="mt-4 inline-flex rounded-lg border border-[#d4af37]/35 bg-[#0f172a] p-1">
              <button
                type="button"
                onClick={() => setPhotoInputMode('upload')}
                className={`rounded-md px-3 py-1.5 text-sm ${
                  photoInputMode === 'upload'
                    ? 'bg-[#d4af37] text-[#0b1120]'
                    : 'text-[#f8f1df]/80 hover:bg-[#1a2440]'
                }`}
              >
                Upload photos
              </button>
              <button
                type="button"
                onClick={() => setPhotoInputMode('reference')}
                className={`rounded-md px-3 py-1.5 text-sm ${
                  photoInputMode === 'reference'
                    ? 'bg-[#d4af37] text-[#0b1120]'
                    : 'text-[#f8f1df]/80 hover:bg-[#1a2440]'
                }`}
              >
                Generate from reference
              </button>
            </div>

            {photoInputMode === 'upload' ? (
              <div className="mt-4">
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-[#d4af37]/40 bg-[#1a2440] px-4 py-2 text-sm font-medium text-[#f8f1df] hover:bg-[#223058]">
                  <span>{isUploadingPhotos ? 'Uploading photos...' : 'Choose Photos'}</span>
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    disabled={isUploadingPhotos || isGenerating || isGeneratingReferencePhotos || photos.length >= 10}
                    onChange={(event) => void handlePhotosSelected(event.target.files)}
                  />
                </label>
              </div>
            ) : (
              <div className="mt-4 space-y-4">
                <div className="rounded-xl border border-[#d4af37]/20 bg-[#0f172a] p-4">
                  <h3 className={`${headingFont.className} text-xl text-[#f8f1df]`}>2) Slide 1 (Reference Style)</h3>
                  <p className="mt-1 text-xs text-[#f8f1df]/65">
                    Astronaut-style reference mode: same photo feel/composition, different people.
                  </p>
                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        setShowReferencePicker(true)
                        void browseReferencePrefix(referenceActivePrefix || 'uploads/', 1)
                      }}
                      className="rounded-lg border border-[#d4af37]/45 bg-[#1a2440] px-4 py-2 text-sm font-medium text-[#f8f1df] hover:bg-[#223058]"
                    >
                      Pick reference from S3
                    </button>
                    {selectedReferenceKey ? (
                      <span className="text-xs text-green-300 break-all">Selected: {selectedReferenceKey}</span>
                    ) : (
                      <span className="text-xs text-[#f8f1df]/60">No reference selected yet.</span>
                    )}
                  </div>
                  {selectedReferencePreviewUrl ? (
                    <img
                      src={selectedReferencePreviewUrl}
                      alt="Selected reference"
                      className="mt-3 h-24 w-24 rounded-md border border-[#d4af37]/25 object-cover"
                    />
                  ) : null}

                  <div className="mt-4 grid grid-cols-1 gap-3">
                    <label className="text-xs text-[#f8f1df]/80">
                      Add a specific detail
                      <input
                        type="text"
                        value={slide1Detail}
                        onChange={(event) => setSlide1Detail(event.target.value)}
                        placeholder="e.g. warm morning sunlight, mug on table"
                        className="mt-1 w-full rounded-lg border border-[#d4af37]/30 bg-[#0b1120] px-3 py-2 text-sm text-[#f8f1df] focus:outline-none focus:ring-2 focus:ring-[#d4af37]/40"
                      />
                    </label>
                    <label className="text-xs text-[#f8f1df]/80">
                      Photo tint / filter (generated slides)
                      <select
                        value={slide1PhotoFilterStyle}
                        onChange={(event) => setSlide1PhotoFilterStyle(event.target.value as (typeof PHOTO_FILTER_OPTIONS)[number]['value'])}
                        className="mt-1 w-full rounded-lg border border-[#d4af37]/30 bg-[#0b1120] px-3 py-2 text-sm text-[#f8f1df] focus:outline-none focus:ring-2 focus:ring-[#d4af37]/40"
                      >
                        {PHOTO_FILTER_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="text-xs text-[#f8f1df]/80">
                      Blur level (Slide 1): {slide1BlurLevel}/10
                      <input
                        type="range"
                        min={1}
                        max={10}
                        step={1}
                        value={slide1BlurLevel}
                        onChange={(event) => setSlide1BlurLevel(Number(event.target.value))}
                        className="mt-2 w-full accent-[#d4af37]"
                      />
                    </label>
                    <label className="text-xs text-[#f8f1df]/80">
                      Age change (Slide 1): {slide1AgeDeltaYears > 0 ? '+' : ''}{slide1AgeDeltaYears} years
                      <input
                        type="number"
                        min={-60}
                        max={60}
                        step={1}
                        value={slide1AgeDeltaYears}
                        onChange={(event) => setSlide1AgeDeltaYears(Number.parseInt(event.target.value || '0', 10) || 0)}
                        className="mt-1 w-full rounded-lg border border-[#d4af37]/30 bg-[#0b1120] px-3 py-2 text-sm text-[#f8f1df] focus:outline-none focus:ring-2 focus:ring-[#d4af37]/40"
                      />
                      <span className="mt-1 block text-[11px] text-[#f8f1df]/60">Use positive for older, negative for younger.</span>
                    </label>
                    {slideProgress['slide-1'] ? (
                      <p className="text-xs text-[#d4af37]">Slide 1: {slideProgress['slide-1']}</p>
                    ) : null}
                  </div>
                </div>

                <div className="space-y-3 rounded-xl border border-[#d4af37]/20 bg-[#0f172a] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className={`${headingFont.className} text-xl text-[#f8f1df]`}>3) Slides 2..N (Chained)</h3>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={addChainedSlide}
                        disabled={chainedSlides.length >= 9}
                        className="rounded-md border border-[#d4af37]/40 px-3 py-1.5 text-xs text-[#f8f1df] disabled:opacity-40"
                      >
                        + Add slide
                      </button>
                      <button
                        type="button"
                        onClick={removeLastChainedSlide}
                        disabled={chainedSlides.length <= 1}
                        className="rounded-md border border-[#d4af37]/40 px-3 py-1.5 text-xs text-[#f8f1df] disabled:opacity-40"
                      >
                        - Remove last slide
                      </button>
                    </div>
                  </div>
                  <p className="text-xs text-[#f8f1df]/60">
                    Each slide uses the immediately previous generated slide as its reference (identity chain, no age progression).
                  </p>

                  {chainedSlides.map((slide, index) => {
                    const currentScene = slide.scene
                    const isCustom = sceneCustomMode[slide.id] || !SCENE_OPTIONS.includes(currentScene)
                    const selectValue = isCustom ? CUSTOM_OPTION_VALUE : currentScene

                    return (
                    <div key={slide.id} className="rounded-lg border border-[#d4af37]/20 bg-[#121a2d] p-3">
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <p className="text-xs text-[#f8f1df]/70">Slide {index + 2}</p>
                        <div className="flex items-center gap-3">
                          {slideProgress[slide.id] ? (
                            <span className="text-xs text-[#d4af37]">{slideProgress[slide.id]}</span>
                          ) : null}
                        </div>
                      </div>
                      <p className="mb-2 text-[11px] text-[#f8f1df]/50">
                        Uses reference_previous from Slide {index + 1}.
                      </p>
                      <label className="text-sm text-[#f8f1df]/80 block mb-1">Activity / scene</label>
                      <select
                        value={selectValue}
                        onChange={(event) => {
                          if (event.target.value === CUSTOM_OPTION_VALUE) {
                            setSceneCustomMode((prev) => ({ ...prev, [slide.id]: true }))
                            return
                          }
                          setSceneCustomMode((prev) => ({ ...prev, [slide.id]: false }))
                          updateChainedSlide(slide.id, 'scene', event.target.value)
                        }}
                        className="w-full rounded-lg border border-[#d4af37]/30 bg-[#0b1120] px-3 py-2 text-sm text-[#f8f1df] focus:outline-none focus:ring-2 focus:ring-[#d4af37]/40"
                      >
                        {SCENE_OPTIONS.map((option) => (
                          <option key={option} value={option}>{option}</option>
                        ))}
                        <option value={CUSTOM_OPTION_VALUE}>Other...</option>
                      </select>
                      {isCustom ? (
                        <input
                          type="text"
                          value={currentScene}
                          onChange={(event) => updateChainedSlide(slide.id, 'scene', event.target.value)}
                          placeholder="Enter custom scene..."
                          className="mt-2 w-full rounded-lg border border-[#d4af37]/30 bg-[#0b1120] px-3 py-2 text-sm text-[#f8f1df] focus:outline-none focus:ring-2 focus:ring-[#d4af37]/40"
                        />
                      ) : null}
                      <input
                        type="text"
                        value={slide.activity}
                        onChange={(event) => updateChainedSlide(slide.id, 'activity', event.target.value)}
                        placeholder="Action"
                        className="mt-2 w-full rounded-lg border border-[#d4af37]/25 bg-[#0b1120] px-3 py-2 text-sm text-[#f8f1df] focus:outline-none focus:ring-2 focus:ring-[#d4af37]/35"
                      />
                      <label className="mt-2 block text-xs text-[#f8f1df]/80">
                        Blur level (Slide {index + 2}): {slide.blurLevel}/10
                        <input
                          type="range"
                          min={1}
                          max={10}
                          step={1}
                          value={slide.blurLevel}
                          onChange={(event) => updateChainedSlide(slide.id, 'blurLevel', Number(event.target.value))}
                          className="mt-2 w-full accent-[#d4af37]"
                        />
                      </label>
                      <label className="mt-2 block text-xs text-[#f8f1df]/80">
                        Age change (Slide {index + 2}): {slide.ageDeltaYears > 0 ? '+' : ''}{slide.ageDeltaYears} years
                        <input
                          type="number"
                          min={-60}
                          max={60}
                          step={1}
                          value={slide.ageDeltaYears}
                          onChange={(event) => updateChainedSlide(slide.id, 'ageDeltaYears', Number.parseInt(event.target.value || '0', 10) || 0)}
                          className="mt-1 w-full rounded-lg border border-[#d4af37]/30 bg-[#0b1120] px-3 py-2 text-sm text-[#f8f1df] focus:outline-none focus:ring-2 focus:ring-[#d4af37]/40"
                        />
                        <span className="mt-1 block text-[11px] text-[#f8f1df]/60">Use positive for older, negative for younger.</span>
                      </label>
                      <label className="mt-2 block text-xs text-[#f8f1df]/80">
                        Photo tint / filter (Slide {index + 2})
                        <select
                          value={slide.photoFilterStyle}
                          onChange={(event) => updateChainedSlide(slide.id, 'photoFilterStyle', event.target.value as (typeof PHOTO_FILTER_OPTIONS)[number]['value'])}
                          className="mt-1 w-full rounded-lg border border-[#d4af37]/30 bg-[#0b1120] px-3 py-2 text-sm text-[#f8f1df] focus:outline-none focus:ring-2 focus:ring-[#d4af37]/40"
                        >
                          {PHOTO_FILTER_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                    )})}

                  <button
                    type="button"
                    onClick={() => void handleGenerateFromReference()}
                    disabled={isGeneratingReferencePhotos || isGenerating || photos.length >= 10}
                    className="w-full rounded-lg bg-[#d4af37] px-4 py-3 text-sm font-semibold text-[#0b1120] hover:bg-[#e2c462] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isGeneratingReferencePhotos ? 'Generating photos...' : 'Generate photos'}
                  </button>
                </div>
              </div>
            )}

            <div className="mt-5 space-y-3">
              {photos.length === 0 ? (
                <p className="rounded-lg border border-dashed border-[#d4af37]/25 p-4 text-sm text-[#f8f1df]/65">
                  No photos uploaded yet.
                </p>
              ) : (
                photos.map((photo, index) => (
                  <div
                    key={photo.id}
                    className="flex items-center gap-3 rounded-xl border border-[#d4af37]/25 bg-[#0f172a] p-3"
                  >
                    <img
                      src={photo.previewUrl}
                      alt={`Uploaded photo ${index + 1}`}
                      className="h-16 w-16 rounded-md object-cover"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-[#f8f1df]">
                        {index + 1}. {photo.fileName}
                      </p>
                      <p className="truncate text-xs text-[#f8f1df]/60">{photo.key}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => movePhoto(index, -1)}
                        disabled={index === 0}
                        className="rounded-md border border-[#d4af37]/40 px-2 py-1 text-xs disabled:opacity-40"
                      >
                        Up
                      </button>
                      <button
                        type="button"
                        onClick={() => movePhoto(index, 1)}
                        disabled={index === photos.length - 1}
                        className="rounded-md border border-[#d4af37]/40 px-2 py-1 text-xs disabled:opacity-40"
                      >
                        Down
                      </button>
                      <button
                        type="button"
                        onClick={() => removePhoto(index)}
                        className="rounded-md border border-red-400/50 px-2 py-1 text-xs text-red-300"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>

          <section className="space-y-6">
            <div className="rounded-2xl border border-[#d4af37]/20 bg-[#121a2d] p-6">
              <h2 className={`${headingFont.className} text-2xl text-[#f8f1df]`}>2) Timing + Music</h2>

              <label className="mt-4 block text-sm text-[#f8f1df]/85">
                Seconds per photo
                <input
                  type="number"
                  min={1}
                  step={0.5}
                  value={secondsPerPhoto}
                  onChange={(event) => setSecondsPerPhoto(ensurePositiveNumber(event.target.value, 2))}
                  className="mt-2 w-full rounded-lg border border-[#d4af37]/30 bg-[#0f172a] px-3 py-2 text-sm text-[#f8f1df] focus:outline-none focus:ring-2 focus:ring-[#d4af37]/40"
                />
              </label>

              <div className="mt-5">
                <label className="block text-sm text-[#f8f1df]/85">
                  Repeat each photo
                  <select
                    value={photoRepeatCount}
                    onChange={(event) => {
                      const next = Number(event.target.value)
                      setPhotoRepeatCount(next === 2 ? 2 : next === 3 ? 3 : 1)
                    }}
                    className="mt-2 w-full rounded-lg border border-[#d4af37]/30 bg-[#0f172a] px-3 py-2 text-sm text-[#f8f1df] focus:outline-none focus:ring-2 focus:ring-[#d4af37]/40"
                  >
                    <option value={1}>Show each photo once (default)</option>
                    <option value={2}>Show each photo twice</option>
                    <option value={3}>Show each photo three times</option>
                  </select>
                </label>
              </div>

              <div className="mt-5">
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-[#d4af37]/40 bg-[#1a2440] px-4 py-2 text-sm font-medium text-[#f8f1df] hover:bg-[#223058]">
                  <span>{isUploadingMusic ? 'Uploading music...' : 'Upload Optional Music'}</span>
                  <input
                    type="file"
                    accept="audio/*"
                    className="hidden"
                    disabled={isUploadingMusic || isGenerating || isGeneratingReferencePhotos}
                    onChange={(event) => void handleMusicSelected(event.target.files)}
                  />
                </label>
                {music ? (
                  <div className="mt-3 rounded-lg border border-[#d4af37]/25 bg-[#0f172a] p-3">
                    <p className="text-sm text-[#f8f1df]">{music.fileName}</p>
                    <p className="truncate text-xs text-[#f8f1df]/60">{music.key}</p>
                    <button
                      type="button"
                      onClick={() => setMusic(null)}
                      className="mt-2 text-xs text-red-300 hover:text-red-200"
                    >
                      Remove music
                    </button>
                  </div>
                ) : (
                  <p className="mt-3 text-xs text-[#f8f1df]/60">No music track uploaded.</p>
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-[#d4af37]/20 bg-[#121a2d] p-6">
              <h2 className={`${headingFont.className} text-2xl text-[#f8f1df]`}>3) Generate</h2>
              <button
                type="button"
                onClick={() => void handleGenerate()}
                disabled={isGenerating || isUploadingPhotos || isGeneratingReferencePhotos || photos.length === 0}
                className="mt-4 w-full rounded-lg bg-[#d4af37] px-4 py-3 text-sm font-semibold text-[#0b1120] hover:bg-[#e2c462] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isGenerating ? 'Generating slideshow (10-30s)...' : 'Generate Memorial Video'}
              </button>
              {error ? <p className="mt-3 text-sm text-red-300">{error}</p> : null}
            </div>
          </section>
        </div>

        {result ? (
          <section className="mt-8 rounded-2xl border border-[#d4af37]/30 bg-[#121a2d] p-6">
            <h2 className={`${headingFont.className} text-3xl text-[#f8f1df]`}>Generated Video</h2>
            <p className="mt-2 text-sm text-[#f8f1df]/75">
              Job <span className="font-mono">{result.jobId}</span> • Duration {result.duration}s
            </p>
            <video
              className="mt-4 w-full rounded-xl border border-[#d4af37]/25 bg-black"
              controls
              src={result.url}
            />
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <a
                href={result.url}
                download
                target="_blank"
                rel="noreferrer"
                className="rounded-lg bg-[#d4af37] px-4 py-2 text-sm font-semibold text-[#0b1120] hover:bg-[#e2c462]"
              >
                Download MP4
              </a>
              <a
                href={result.url}
                target="_blank"
                rel="noreferrer"
                className="rounded-lg border border-[#d4af37]/40 px-4 py-2 text-sm text-[#f8f1df]"
              >
                Open URL
              </a>
            </div>
            <p className="mt-3 break-all text-xs text-[#f8f1df]/60">{result.url}</p>
          </section>
        ) : null}

        {result ? (
          <section className="mt-6 rounded-2xl border border-[#d4af37]/30 bg-[#121a2d] p-6">
            <h2 className={`${headingFont.className} text-2xl text-[#f8f1df]`}>Send to iPhone</h2>
            <p className="mt-2 text-sm text-[#f8f1df]/75">
              Sends the finished memorial MP4 and optional note text using the existing device-delivery flow.
            </p>
            <label className="mt-4 block text-sm text-[#f8f1df]/85">
              Note text (optional, applied to each slide)
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
              disabled={isSendingToDevice || isGenerating || isGeneratingReferencePhotos || isUploadingPhotos}
              className="mt-4 w-full rounded-lg bg-emerald-600 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSendingToDevice ? 'Sending to iPhone...' : 'Send to iPhone'}
            </button>
            {sendToDeviceResult ? (
              <div className="mt-3 rounded-lg border border-[#d4af37]/20 bg-[#0f172a] p-3 text-xs text-[#f8f1df]/80 space-y-1">
                <p>Imported: <span className="text-white">{sendToDeviceResult.imported_count ?? 'unknown'}</span></p>
                <p>
                  Note created:{' '}
                  <span className="text-white">
                    {sendToDeviceResult.note_created === undefined
                      ? 'unknown'
                      : sendToDeviceResult.note_created ? 'yes' : 'no'}
                  </span>
                </p>
              </div>
            ) : null}
          </section>
        ) : null}

        {showReferencePicker ? (
          <div className="fixed inset-0 z-50 overflow-y-auto bg-black/70 p-4 backdrop-blur-sm md:p-6">
            <div className="mx-auto max-w-6xl rounded-2xl border border-[#d4af37]/35 bg-[#121a2d] p-4 md:p-6">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h3 className={`${headingFont.className} text-2xl text-[#f8f1df]`}>Pick S3 reference photo</h3>
                  <p className="mt-1 text-xs text-[#f8f1df]/60">
                    Source bucket: order-by-age-uploads (key stored only).
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowReferencePicker(false)}
                  className="rounded-md border border-[#d4af37]/35 px-3 py-1.5 text-sm text-[#f8f1df]"
                >
                  Close
                </button>
              </div>

              <div className="mt-4 flex flex-col gap-3 md:flex-row">
                <input
                  value={referencePrefixInput}
                  onChange={(event) => setReferencePrefixInput(event.target.value)}
                  placeholder="uploads/"
                  className="flex-1 rounded-lg border border-[#d4af37]/30 bg-[#0f172a] px-3 py-2 text-sm text-[#f8f1df] focus:outline-none focus:ring-2 focus:ring-[#d4af37]/40"
                />
                <button
                  type="button"
                  onClick={() => void browseReferencePrefix(referencePrefixInput.trim() || 'uploads/', 1)}
                  disabled={referenceLoading}
                  className="rounded-lg border border-[#d4af37]/45 px-4 py-2 text-sm text-[#f8f1df] disabled:opacity-60"
                >
                  {referenceLoading ? 'Loading...' : 'Browse'}
                </button>
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-[#f8f1df]/55">
                <span>Current prefix: {referenceActivePrefix}</span>
                <span>Page {referencePage}</span>
                <span>{REFERENCE_PAGE_SIZE} per page</span>
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => void browseReferencePrefix(referenceActivePrefix, referencePage - 1)}
                  disabled={referenceLoading || referencePage <= 1}
                  className="rounded-lg border border-[#d4af37]/35 px-3 py-1.5 text-sm text-[#f8f1df] disabled:opacity-60"
                >
                  Prev
                </button>
                <button
                  type="button"
                  onClick={() => void browseReferencePrefix(referenceActivePrefix, referencePage + 1)}
                  disabled={referenceLoading || !referenceHasNextPage}
                  className="rounded-lg border border-[#d4af37]/35 px-3 py-1.5 text-sm text-[#f8f1df] disabled:opacity-60"
                >
                  Next
                </button>
                <input
                  value={referencePageInput}
                  onChange={(event) => setReferencePageInput(event.target.value.replace(/[^\d]/g, ''))}
                  placeholder="Page #"
                  className="w-24 rounded-lg border border-[#d4af37]/30 bg-[#0f172a] px-2 py-1.5 text-sm text-[#f8f1df]"
                />
                <button
                  type="button"
                  onClick={() => {
                    const parsedPage = Number.parseInt(referencePageInput || '1', 10)
                    const safePage = Number.isNaN(parsedPage) ? 1 : Math.max(1, parsedPage)
                    void browseReferencePrefix(referenceActivePrefix, safePage)
                  }}
                  disabled={referenceLoading}
                  className="rounded-lg border border-[#d4af37]/45 px-3 py-1.5 text-sm text-[#f8f1df] disabled:opacity-60"
                >
                  Go
                </button>
              </div>
              {referencePickerError ? (
                <p className="mt-3 text-sm text-red-300">{referencePickerError}</p>
              ) : null}

              {referenceLoading ? (
                <p className="py-10 text-center text-sm text-[#f8f1df]/70">Loading S3 images...</p>
              ) : referenceItems.length === 0 ? (
                <p className="py-10 text-center text-sm text-[#f8f1df]/70">No images found for this prefix.</p>
              ) : (
                <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                  {referenceItems.map((item) => {
                    const isSelected = item.key === selectedReferenceKey
                    return (
                      <button
                        type="button"
                        key={item.key}
                        onClick={() => {
                          setSelectedReferenceKey(item.key)
                          setSelectedReferencePreviewUrl(item.presignedUrl)
                          setShowReferencePicker(false)
                        }}
                        className={`relative overflow-hidden rounded-lg border text-left transition-all ${
                          isSelected
                            ? 'border-[#d4af37] ring-1 ring-[#d4af37]'
                            : 'border-[#d4af37]/20 hover:border-[#d4af37]/60'
                        }`}
                        title={item.key}
                      >
                        <img
                          src={item.presignedUrl}
                          alt={item.key}
                          loading="lazy"
                          className="aspect-square w-full object-cover"
                        />
                        <div className="absolute inset-x-0 bottom-0 bg-black/70 px-2 py-1">
                          <p className="truncate text-[11px] text-[#f8f1df]">{item.key.split('/').pop()}</p>
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}

            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}
