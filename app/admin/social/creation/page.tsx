'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Cormorant_Garamond, DM_Sans } from 'next/font/google'

type MemorialSceneType = 'headstone_classic' | 'headstone_rounded' | 'headstone_flat' | 'urn' | 'bouquet'
type MemorialLocation = 'cemetery' | 'backyard' | 'roadside' | 'park' | 'home_garden' | 'shelf'
type MemorialCameraAngle = 'left' | 'center left' | 'center right' | 'right'
type MemorialCameraDistance = 'close' | 'medium' | 'far' | 'very far'

interface TrendRow {
  id: string
  name: string
  explanation: string
  sound_name: string | null
  sound_url: string | null
  caption_lines: string[] | null
  default_slide_count: number
  memorial_default: boolean
}

interface S3ReferenceBrowseItem {
  key: string
  presignedUrl: string
}

const cormorant = Cormorant_Garamond({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
})

const dmSans = DM_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
})

const LIVE_REFERENCE_DEFAULT_PREFIX = 'uploads/'
const CUSTOM_OPTION_VALUE = '__custom__'

const SCENE_OPTIONS = [
  'Walking on the beach at sunset',
  'Baking together in a cozy kitchen',
  'Sitting on a porch swing',
  'Fishing at a calm lake',
  'Reading on the couch together',
  'Walking through an autumn park',
  'Dancing in the living room',
  'Gardening in the backyard',
  'Picnic in a sunny meadow',
  'Looking through old photo albums',
  'Riding bikes down a quiet street',
  'Sitting by a campfire at night',
  'Watching sunrise on a hilltop',
  'Decorating a Christmas tree',
  'Coffee at the kitchen table',
]

const TREND_CAPTION_FALLBACKS: Record<string, string[]> = {
  'Sailor Song': [
    'I sleep so I can see you',
    "'cause I hate to wait so long",
    'I sleep so that I can see you',
    'and I hate to wait so long',
  ],
}

function getDefaultScene(order: number): string {
  return SCENE_OPTIONS[(order - 2) % SCENE_OPTIONS.length]
}

export default function CreationPage() {
  const router = useRouter()

  const [trends, setTrends] = useState<TrendRow[]>([])
  const [loadingTrends, setLoadingTrends] = useState(true)
  const [selectedTrendId, setSelectedTrendId] = useState<string>('')

  const [slideCount, setSlideCount] = useState(4)
  const [includeMemorialSlide, setIncludeMemorialSlide] = useState(false)
  const [soundName, setSoundName] = useState('')
  const [soundUrl, setSoundUrl] = useState('')

  const [referencePickKey, setReferencePickKey] = useState('')
  const [selectedReferencePreviewUrl, setSelectedReferencePreviewUrl] = useState<string | null>(null)
  const [showReferencePicker, setShowReferencePicker] = useState(false)
  const [referencePrefixInput, setReferencePrefixInput] = useState(LIVE_REFERENCE_DEFAULT_PREFIX)
  const [referenceActivePrefix, setReferenceActivePrefix] = useState(LIVE_REFERENCE_DEFAULT_PREFIX)
  const [referenceItems, setReferenceItems] = useState<S3ReferenceBrowseItem[]>([])
  const [referenceNextToken, setReferenceNextToken] = useState<string | null>(null)
  const [referenceLoading, setReferenceLoading] = useState(false)
  const [referenceLoadingMore, setReferenceLoadingMore] = useState(false)
  const [referencePickerError, setReferencePickerError] = useState<string | null>(null)

  const [addSpecificDetail, setAddSpecificDetail] = useState(false)
  const [detailText, setDetailText] = useState('')

  const [sceneValues, setSceneValues] = useState<Record<number, string>>({
    2: getDefaultScene(2),
    3: getDefaultScene(3),
    4: getDefaultScene(4),
  })
  const [sceneCustomMode, setSceneCustomMode] = useState<Record<number, boolean>>({})

  const [livePhotoSlideOrders, setLivePhotoSlideOrders] = useState<number[]>([])
  const [noteLinesByOrder, setNoteLinesByOrder] = useState<Record<number, string>>({})

  const [memorialSceneType, setMemorialSceneType] = useState<MemorialSceneType>('headstone_classic')
  const [memorialLocation, setMemorialLocation] = useState<MemorialLocation>('cemetery')
  const [memorialCameraAngle, setMemorialCameraAngle] = useState<MemorialCameraAngle>('left')
  const [memorialCameraDistance, setMemorialCameraDistance] = useState<MemorialCameraDistance>('far')
  const [memorialInscription, setMemorialInscription] = useState('Love you forever')
  const [memorialHeadstoneFlowerDesign, setMemorialHeadstoneFlowerDesign] = useState('small rose or lily relief')
  const [memorialUrnColor, setMemorialUrnColor] = useState('deep navy blue ceramic with subtle gold accents')
  const [memorialKeepsake, setMemorialKeepsake] = useState('')

  const [submitting, setSubmitting] = useState(false)
  const [savingCaptions, setSavingCaptions] = useState(false)
  const [saveCaptionsMessage, setSaveCaptionsMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const selectedTrend = useMemo(
    () => trends.find((trend) => trend.id === selectedTrendId) || null,
    [trends, selectedTrendId]
  )

  const activeSlideOrders = useMemo(() => {
    const orders = [1, 2]
    if (slideCount >= 3) orders.push(3)
    if (slideCount >= 4) orders.push(4)
    if (includeMemorialSlide) orders.push(5)
    return orders
  }, [slideCount, includeMemorialSlide])

  const nonMemorialSlideOrders = useMemo(
    () => activeSlideOrders.filter((order) => order !== 5),
    [activeSlideOrders]
  )
  const captionFieldOrders = useMemo(
    () => Array.from({ length: slideCount }, (_item, index) => index + 1),
    [slideCount]
  )

  useEffect(() => {
    const loadTrends = async () => {
      setLoadingTrends(true)
      try {
        const response = await fetch('/api/admin/social/trends')
        const data = await response.json()
        if (!response.ok) {
          throw new Error(data?.error || 'Failed to load trends')
        }

        const rows = Array.isArray(data) ? (data as TrendRow[]) : []
        setTrends(rows)
        if (rows.length > 0) {
          setSelectedTrendId(rows[0].id)
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load trends')
      } finally {
        setLoadingTrends(false)
      }
    }

    void loadTrends()
  }, [])

  useEffect(() => {
    if (!selectedTrend) return

    const nextSlideCount = Math.max(2, Math.min(4, selectedTrend.default_slide_count || 4))
    setSlideCount(nextSlideCount)
    setIncludeMemorialSlide(Boolean(selectedTrend.memorial_default))
    setSoundName(selectedTrend.sound_name || '')
    setSoundUrl(selectedTrend.sound_url || '')
    setSaveCaptionsMessage(null)

    const savedCaptionLines = Array.isArray(selectedTrend.caption_lines)
      ? selectedTrend.caption_lines
      : []
    const fallbackCaptionLines = TREND_CAPTION_FALLBACKS[selectedTrend.name] || []
    const captionSource = savedCaptionLines.length > 0 ? savedCaptionLines : fallbackCaptionLines

    const nextNotes: Record<number, string> = {}
    for (let order = 1; order <= nextSlideCount; order += 1) {
      nextNotes[order] = captionSource[order - 1] || ''
    }
    setNoteLinesByOrder(nextNotes)
  }, [selectedTrend])

  useEffect(() => {
    setLivePhotoSlideOrders((prev) => prev.filter((order) => nonMemorialSlideOrders.includes(order)))
  }, [nonMemorialSlideOrders])

  useEffect(() => {
    if (
      (memorialSceneType === 'headstone_classic' ||
        memorialSceneType === 'headstone_rounded' ||
        memorialSceneType === 'headstone_flat') &&
      memorialLocation !== 'cemetery'
    ) {
      setMemorialLocation('cemetery')
    }
  }, [memorialSceneType, memorialLocation])

  const browseReferencePrefix = async (prefix: string, token?: string, append = false) => {
    if (!append) {
      setReferenceLoading(true)
    } else {
      setReferenceLoadingMore(true)
    }
    setReferencePickerError(null)
    try {
      const params = new URLSearchParams({ prefix })
      if (token) params.set('token', token)

      const response = await fetch(`/api/admin/social/reference-browse?${params.toString()}`)
      const data = await response.json()
      if (!response.ok) {
        throw new Error(data?.error || data?.details || 'Failed to browse S3 reference photos')
      }

      const nextItems: S3ReferenceBrowseItem[] = Array.isArray(data.items) ? data.items : []
      setReferenceActivePrefix(prefix)
      setReferencePrefixInput(prefix)
      setReferenceItems((prev) => (append ? [...prev, ...nextItems] : nextItems))
      setReferenceNextToken(typeof data.nextToken === 'string' ? data.nextToken : null)
    } catch (err) {
      setReferencePickerError(err instanceof Error ? err.message : 'Failed to browse S3 reference photos')
    } finally {
      setReferenceLoading(false)
      setReferenceLoadingMore(false)
    }
  }

  const handleSelectReference = (item: S3ReferenceBrowseItem) => {
    setReferencePickKey(item.key)
    setSelectedReferencePreviewUrl(item.presignedUrl)
    setShowReferencePicker(false)
  }

  const handleToggleLivePhoto = (order: number, checked: boolean) => {
    setLivePhotoSlideOrders((prev) => {
      if (checked) {
        return [...new Set([...prev, order])].sort((a, b) => a - b)
      }
      return prev.filter((value) => value !== order)
    })
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError(null)

    if (!selectedTrendId) {
      setError('Please pick a trend.')
      return
    }
    if (!referencePickKey.trim()) {
      setError('Please choose a reference photo from S3.')
      return
    }
    if (!sceneValues[2]?.trim()) {
      setError('Slide 2 needs a scene.')
      return
    }

    setSubmitting(true)
    try {
      const noteLines = captionFieldOrders.map((order) => noteLinesByOrder[order] || '')

      const response = await fetch('/api/admin/social/generate-creation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          trend_id: selectedTrendId,
          slide_count: slideCount,
          include_memorial: includeMemorialSlide,
          reference_pick_key: referencePickKey,
          add_detail: addSpecificDetail,
          detail_text: addSpecificDetail ? detailText : '',
          scene_2: sceneValues[2] || '',
          scene_3: sceneValues[3] || '',
          scene_4: sceneValues[4] || '',
          note_lines: noteLines,
          live_photo_slide_orders: livePhotoSlideOrders,
          sound_name: soundName || null,
          sound_url: soundUrl || null,
          memorial_settings: {
            memorial_scene_type: memorialSceneType,
            memorial_location: memorialLocation,
            memorial_camera_angle: memorialCameraAngle,
            memorial_camera_distance: memorialCameraDistance,
            memorial_inscription: memorialInscription,
            memorial_headstone_flower_design: memorialHeadstoneFlowerDesign,
            memorial_urn_color: memorialUrnColor,
            memorial_keepsake: memorialKeepsake,
          },
        }),
      })

      const data = await response.json()
      if (!response.ok) {
        throw new Error(data?.error || 'Failed to generate post')
      }
      if (!data?.post_id) {
        throw new Error('Generation response missing post_id')
      }

      router.push(`/admin/social/evergreen/${data.post_id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate post')
    } finally {
      setSubmitting(false)
    }
  }

  const handleSaveCaptionsToTrend = async () => {
    if (!selectedTrendId) {
      setError('Please pick a trend before saving captions.')
      return
    }

    setSavingCaptions(true)
    setSaveCaptionsMessage(null)
    setError(null)
    try {
      const captionLines = captionFieldOrders.map((order) => noteLinesByOrder[order] || '')
      const response = await fetch('/api/admin/social/trends', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: selectedTrendId,
          caption_lines: captionLines,
        }),
      })
      const data = await response.json()
      if (!response.ok) {
        throw new Error(data?.error || 'Failed to save captions')
      }

      setTrends((prev) => prev.map((trend) => (
        trend.id === selectedTrendId
          ? { ...trend, caption_lines: captionLines }
          : trend
      )))
      setSaveCaptionsMessage('Saved captions to this trend.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save captions')
    } finally {
      setSavingCaptions(false)
    }
  }

  return (
    <div className={`${dmSans.className} p-6 lg:p-8 space-y-6 text-[#f7f1df]`}>
      <div>
        <Link
          href="/admin/social"
          className="text-[#d7c9a6] hover:text-[#f7f1df] text-sm flex items-center gap-1 mb-2"
        >
          ← Back to Social Dashboard
        </Link>
        <h1 className={`${cormorant.className} text-4xl font-semibold text-[#f7f1df]`}>Creation</h1>
        <p className="text-[#d7c9a6] mt-2 max-w-3xl">
          One shared generation engine for all trends. Pick a trend preset, adjust details, and generate with the existing template pipeline.
        </p>
      </div>

      {loadingTrends ? (
        <div className="text-[#d7c9a6]">Loading trends...</div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-6">
          <section className="rounded-2xl border border-[#7a6738]/60 bg-[#111a2f] p-5 space-y-4">
            <h2 className={`${cormorant.className} text-2xl text-[#f1d386]`}>1) Trend Picker</h2>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {trends.map((trend) => {
                const selected = trend.id === selectedTrendId
                return (
                  <button
                    key={trend.id}
                    type="button"
                    onClick={() => setSelectedTrendId(trend.id)}
                    className={`text-left rounded-xl border p-4 transition-all ${
                      selected
                        ? 'border-[#f1d386] bg-[#1c2743] ring-1 ring-[#f1d386]/60'
                        : 'border-[#3d4a68] bg-[#15213a] hover:border-[#8d7b4f]'
                    }`}
                  >
                    <p className={`${cormorant.className} text-2xl text-[#f7f1df]`}>{trend.name}</p>
                    <p className="text-sm text-[#d7c9a6] mt-1">{trend.explanation}</p>
                    <p className="text-xs text-[#b9aa87] mt-2">Sound: {trend.sound_name || '—'}</p>
                  </button>
                )
              })}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="text-sm text-[#d7c9a6]">Slide count (2-4)</label>
                <input
                  type="number"
                  min={2}
                  max={4}
                  value={slideCount}
                  onChange={(e) => setSlideCount(Math.max(2, Math.min(4, Number(e.target.value) || 2)))}
                  className="mt-1 w-full rounded-lg border border-[#3d4a68] bg-[#0f1729] px-3 py-2 text-[#f7f1df]"
                />
              </div>
              <div>
                <label className="text-sm text-[#d7c9a6]">Sound name</label>
                <input
                  type="text"
                  value={soundName}
                  onChange={(e) => setSoundName(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-[#3d4a68] bg-[#0f1729] px-3 py-2 text-[#f7f1df]"
                />
              </div>
              <div>
                <label className="text-sm text-[#d7c9a6]">Sound URL (optional)</label>
                <input
                  type="text"
                  value={soundUrl}
                  onChange={(e) => setSoundUrl(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-[#3d4a68] bg-[#0f1729] px-3 py-2 text-[#f7f1df]"
                />
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-[#7a6738]/60 bg-[#111a2f] p-5 space-y-4">
            <h2 className={`${cormorant.className} text-2xl text-[#f1d386]`}>2) Slide 1 (Reference Style)</h2>
            <p className="text-sm text-[#d7c9a6]">
              Uses `reference_live_pick` style mode: different people, same awkward-real snapshot style.
            </p>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  setShowReferencePicker(true)
                  void browseReferencePrefix(referenceActivePrefix || LIVE_REFERENCE_DEFAULT_PREFIX)
                }}
                className="rounded-lg border border-[#f1d386]/70 bg-[#2e3b5e] px-4 py-2 text-[#f1d386] hover:bg-[#364974]"
              >
                Pick reference photo from S3
              </button>
              {referencePickKey ? (
                <span className="text-xs text-[#f7f1df] break-all">Selected key: {referencePickKey}</span>
              ) : (
                <span className="text-xs text-[#b9aa87]">No S3 reference selected yet.</span>
              )}
            </div>

            {selectedReferencePreviewUrl && (
              <img
                src={selectedReferencePreviewUrl}
                alt="Selected S3 style reference"
                className="w-32 h-32 object-cover rounded-lg border border-[#3d4a68]"
              />
            )}

            <label className="flex items-center gap-2 text-sm text-[#f7f1df]">
              <input
                type="checkbox"
                checked={addSpecificDetail}
                onChange={(e) => setAddSpecificDetail(e.target.checked)}
                className="h-4 w-4 accent-[#f1d386]"
              />
              Add a specific detail
            </label>

            {addSpecificDetail && (
              <input
                type="text"
                value={detailText}
                onChange={(e) => setDetailText(e.target.value)}
                placeholder="e.g. make the older man wear a Chicago Cubs hat"
                className="w-full rounded-lg border border-[#3d4a68] bg-[#0f1729] px-3 py-2 text-[#f7f1df]"
              />
            )}

            <label className="flex items-center gap-2 text-sm text-[#f7f1df]">
              <input
                type="checkbox"
                checked={livePhotoSlideOrders.includes(1)}
                onChange={(e) => handleToggleLivePhoto(1, e.target.checked)}
                className="h-4 w-4 accent-[#f1d386]"
              />
              Live Photo for Slide 1
            </label>
          </section>

          <section className="rounded-2xl border border-[#7a6738]/60 bg-[#111a2f] p-5 space-y-4">
            <h2 className={`${cormorant.className} text-2xl text-[#f1d386]`}>3) Slides 2..N (Identity Anchor)</h2>
            <p className="text-sm text-[#d7c9a6]">
              Uses `reference_anchor` identity mode: keep same people from Slide 1 while changing scene.
            </p>

            {[2, 3, 4].filter((order) => order <= slideCount).map((order) => {
              const currentScene = sceneValues[order] || ''
              const isCustom = sceneCustomMode[order] || !SCENE_OPTIONS.includes(currentScene)
              const selectValue = isCustom ? CUSTOM_OPTION_VALUE : currentScene

              return (
                <div key={order} className="rounded-xl border border-[#3d4a68] bg-[#15213a] p-4 space-y-3">
                  <h3 className={`${cormorant.className} text-xl text-[#f7f1df]`}>Slide {order}</h3>
                  <label className="text-sm text-[#d7c9a6] block">Scene</label>
                  <select
                    value={selectValue}
                    onChange={(e) => {
                      if (e.target.value === CUSTOM_OPTION_VALUE) {
                        setSceneCustomMode((prev) => ({ ...prev, [order]: true }))
                        setSceneValues((prev) => ({ ...prev, [order]: prev[order] || '' }))
                        return
                      }
                      setSceneCustomMode((prev) => ({ ...prev, [order]: false }))
                      setSceneValues((prev) => ({ ...prev, [order]: e.target.value }))
                    }}
                    className="w-full rounded-lg border border-[#3d4a68] bg-[#0f1729] px-3 py-2 text-[#f7f1df]"
                  >
                    {SCENE_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                    <option value={CUSTOM_OPTION_VALUE}>Other...</option>
                  </select>

                  {isCustom && (
                    <input
                      type="text"
                      value={currentScene}
                      onChange={(e) => setSceneValues((prev) => ({ ...prev, [order]: e.target.value }))}
                      placeholder="Enter custom scene..."
                      className="w-full rounded-lg border border-[#3d4a68] bg-[#0f1729] px-3 py-2 text-[#f7f1df]"
                    />
                  )}

                  <label className="flex items-center gap-2 text-sm text-[#f7f1df]">
                    <input
                      type="checkbox"
                      checked={livePhotoSlideOrders.includes(order)}
                      onChange={(e) => handleToggleLivePhoto(order, e.target.checked)}
                      className="h-4 w-4 accent-[#f1d386]"
                    />
                    Live Photo for Slide {order}
                  </label>
                </div>
              )
            })}
          </section>

          <section className="rounded-2xl border border-[#7a6738]/60 bg-[#111a2f] p-5 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className={`${cormorant.className} text-2xl text-[#f1d386]`}>4) Memorial Slide (Optional)</h2>
              <label className="flex items-center gap-2 text-sm text-[#f7f1df]">
                <input
                  type="checkbox"
                  checked={includeMemorialSlide}
                  onChange={(e) => setIncludeMemorialSlide(e.target.checked)}
                  className="h-4 w-4 accent-[#f1d386]"
                />
                Include memorial slide
              </label>
            </div>

            {includeMemorialSlide && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="text-sm text-[#d7c9a6]">Memorial image type</label>
                  <select
                    value={memorialSceneType}
                    onChange={(e) => setMemorialSceneType(e.target.value as MemorialSceneType)}
                    className="mt-1 w-full rounded-lg border border-[#3d4a68] bg-[#0f1729] px-3 py-2 text-[#f7f1df]"
                  >
                    <option value="headstone_classic">headstone_classic</option>
                    <option value="headstone_rounded">headstone_rounded</option>
                    <option value="headstone_flat">headstone_flat</option>
                    <option value="urn">urn</option>
                    <option value="bouquet">bouquet</option>
                  </select>
                </div>

                {(memorialSceneType === 'urn' || memorialSceneType === 'bouquet') && (
                  <div>
                    <label className="text-sm text-[#d7c9a6]">Memorial location</label>
                    <select
                      value={memorialLocation}
                      onChange={(e) => setMemorialLocation(e.target.value as MemorialLocation)}
                      className="mt-1 w-full rounded-lg border border-[#3d4a68] bg-[#0f1729] px-3 py-2 text-[#f7f1df]"
                    >
                      <option value="cemetery">cemetery</option>
                      <option value="backyard">backyard</option>
                      <option value="roadside">roadside</option>
                      <option value="park">park</option>
                      <option value="home_garden">home_garden</option>
                      <option value="shelf">shelf</option>
                    </select>
                  </div>
                )}

                <div>
                  <label className="text-sm text-[#d7c9a6]">Camera angle</label>
                  <select
                    value={memorialCameraAngle}
                    onChange={(e) => setMemorialCameraAngle(e.target.value as MemorialCameraAngle)}
                    className="mt-1 w-full rounded-lg border border-[#3d4a68] bg-[#0f1729] px-3 py-2 text-[#f7f1df]"
                  >
                    <option value="left">left</option>
                    <option value="center left">center left</option>
                    <option value="center right">center right</option>
                    <option value="right">right</option>
                  </select>
                </div>

                <div>
                  <label className="text-sm text-[#d7c9a6]">Camera distance</label>
                  <select
                    value={memorialCameraDistance}
                    onChange={(e) => setMemorialCameraDistance(e.target.value as MemorialCameraDistance)}
                    className="mt-1 w-full rounded-lg border border-[#3d4a68] bg-[#0f1729] px-3 py-2 text-[#f7f1df]"
                  >
                    <option value="close">close</option>
                    <option value="medium">medium</option>
                    <option value="far">far</option>
                    <option value="very far">very far</option>
                  </select>
                </div>

                {(memorialSceneType === 'headstone_classic' ||
                  memorialSceneType === 'headstone_rounded' ||
                  memorialSceneType === 'headstone_flat') && (
                  <>
                    <div className="md:col-span-2">
                      <label className="text-sm text-[#d7c9a6]">Inscription</label>
                      <input
                        type="text"
                        value={memorialInscription}
                        onChange={(e) => setMemorialInscription(e.target.value)}
                        className="mt-1 w-full rounded-lg border border-[#3d4a68] bg-[#0f1729] px-3 py-2 text-[#f7f1df]"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="text-sm text-[#d7c9a6]">Carved flower design</label>
                      <input
                        type="text"
                        value={memorialHeadstoneFlowerDesign}
                        onChange={(e) => setMemorialHeadstoneFlowerDesign(e.target.value)}
                        className="mt-1 w-full rounded-lg border border-[#3d4a68] bg-[#0f1729] px-3 py-2 text-[#f7f1df]"
                      />
                    </div>
                  </>
                )}

                {memorialSceneType === 'urn' && (
                  <div className="md:col-span-2">
                    <label className="text-sm text-[#d7c9a6]">Urn color/material</label>
                    <input
                      type="text"
                      value={memorialUrnColor}
                      onChange={(e) => setMemorialUrnColor(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-[#3d4a68] bg-[#0f1729] px-3 py-2 text-[#f7f1df]"
                    />
                  </div>
                )}

                {(memorialSceneType === 'headstone_classic' ||
                  memorialSceneType === 'headstone_rounded' ||
                  memorialSceneType === 'headstone_flat' ||
                  memorialSceneType === 'bouquet') && (
                  <div className="md:col-span-2">
                    <label className="text-sm text-[#d7c9a6]">Personal keepsake (optional)</label>
                    <input
                      type="text"
                      value={memorialKeepsake}
                      onChange={(e) => setMemorialKeepsake(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-[#3d4a68] bg-[#0f1729] px-3 py-2 text-[#f7f1df]"
                    />
                  </div>
                )}
              </div>
            )}

            <p className="text-xs text-[#b9aa87]">Live Photo is disabled for memorial slide (same as existing flow).</p>
          </section>

          <section className="rounded-2xl border border-[#7a6738]/60 bg-[#111a2f] p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className={`${cormorant.className} text-2xl text-[#f1d386]`}>5) Note / Caption Lines</h2>
              <button
                type="button"
                onClick={() => void handleSaveCaptionsToTrend()}
                disabled={savingCaptions || !selectedTrendId}
                className="px-3 py-1.5 rounded-lg border border-[#f1d386]/70 text-[#f1d386] hover:bg-[#f1d386]/10 disabled:opacity-60"
              >
                {savingCaptions ? 'Saving...' : 'Save captions to this trend'}
              </button>
            </div>
            {captionFieldOrders.map((order) => (
              <div key={order}>
                <label className="block text-sm text-[#d7c9a6] mb-1">
                  Slide {order}
                </label>
                <input
                  type="text"
                  value={noteLinesByOrder[order] || ''}
                  onChange={(e) => setNoteLinesByOrder((prev) => ({ ...prev, [order]: e.target.value }))}
                  className="w-full rounded-lg border border-[#3d4a68] bg-[#0f1729] px-3 py-2 text-[#f7f1df]"
                />
              </div>
            ))}
            {saveCaptionsMessage && (
              <p className="text-sm text-green-300">{saveCaptionsMessage}</p>
            )}
          </section>

          {error && <p className="text-red-300 text-sm">{error}</p>}

          <button
            type="submit"
            disabled={submitting}
            className={`w-full rounded-xl py-3 font-semibold transition ${
              submitting
                ? 'bg-[#394560] text-[#a8b2cc] cursor-not-allowed'
                : 'bg-gradient-to-r from-[#d4af37] to-[#f1d386] text-[#1b2237] hover:from-[#e2be4b] hover:to-[#f7df9f]'
            }`}
          >
            {submitting ? 'Generating...' : '6) Generate'}
          </button>
        </form>
      )}

      {showReferencePicker && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm p-4 md:p-6 overflow-y-auto">
          <div className="max-w-6xl mx-auto bg-[#111a2f] border border-[#3d4a68] rounded-2xl p-4 md:p-6 space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h3 className={`${cormorant.className} text-2xl text-[#f1d386]`}>Pick S3 Style Reference</h3>
                <p className="text-xs text-[#b9aa87] mt-1">
                  Source bucket: order-by-age-uploads. Stored value is key-only.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowReferencePicker(false)}
                className="px-3 py-1.5 rounded-lg bg-[#2e3b5e] text-[#f7f1df] hover:bg-[#364974]"
              >
                Close
              </button>
            </div>

            <div className="flex flex-col md:flex-row gap-3">
              <input
                value={referencePrefixInput}
                onChange={(e) => setReferencePrefixInput(e.target.value)}
                placeholder="uploads/"
                className="flex-1 px-3 py-2 bg-[#0f1729] border border-[#3d4a68] rounded-lg text-[#f7f1df]"
              />
              <button
                type="button"
                onClick={() => void browseReferencePrefix(referencePrefixInput.trim() || LIVE_REFERENCE_DEFAULT_PREFIX)}
                disabled={referenceLoading}
                className="px-4 py-2 rounded-lg border border-[#f1d386]/70 text-[#f1d386] hover:bg-[#f1d386]/10 disabled:opacity-60"
              >
                {referenceLoading ? 'Loading...' : 'Browse'}
              </button>
            </div>

            <p className="text-xs text-[#b9aa87]">Current prefix: {referenceActivePrefix}</p>

            {referencePickerError && <p className="text-sm text-red-300">{referencePickerError}</p>}

            {referenceLoading ? (
              <div className="text-sm text-[#d7c9a6] py-8 text-center">Loading S3 images...</div>
            ) : referenceItems.length === 0 ? (
              <div className="text-sm text-[#d7c9a6] py-8 text-center">No images found at this prefix.</div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                {referenceItems.map((item) => {
                  const isSelected = item.key === referencePickKey
                  return (
                    <button
                      type="button"
                      key={item.key}
                      onClick={() => handleSelectReference(item)}
                      className={`relative rounded-lg overflow-hidden border text-left transition-all ${
                        isSelected
                          ? 'border-[#f1d386] ring-1 ring-[#f1d386]'
                          : 'border-[#3d4a68] hover:border-[#f1d386]/60'
                      }`}
                      title={item.key}
                    >
                      <img
                        src={item.presignedUrl}
                        alt={item.key}
                        loading="lazy"
                        className="w-full aspect-square object-cover bg-[#0f1729]"
                      />
                      <div className="absolute inset-x-0 bottom-0 bg-black/70 px-2 py-1">
                        <p className="text-[11px] text-[#f7f1df] truncate">{item.key.split('/').pop()}</p>
                      </div>
                    </button>
                  )
                })}
              </div>
            )}

            {referenceNextToken && (
              <div className="flex justify-center">
                <button
                  type="button"
                  onClick={() => void browseReferencePrefix(referenceActivePrefix, referenceNextToken, true)}
                  disabled={referenceLoadingMore}
                  className="px-4 py-2 rounded-lg border border-[#3d4a68] text-[#f7f1df] hover:bg-[#2e3b5e] disabled:opacity-60"
                >
                  {referenceLoadingMore ? 'Loading more...' : 'Load more'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
