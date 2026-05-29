'use client'

import Link from 'next/link'
import { Suspense, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Cormorant_Garamond, DM_Sans } from 'next/font/google'

const cormorant = Cormorant_Garamond({ subsets: ['latin'], weight: ['500', '600', '700'] })
const dmSans = DM_Sans({ subsets: ['latin'], weight: ['400', '500', '700'] })

type Mode = 'honor' | 'miss'
type Perspective = 'first_person' | 'third_person'
type PhotoStyle = 'both_framed_first' | 'both_polaroid_first' | 'framed_only' | 'polaroid_only'

const PHOTO_STYLE_OPTIONS: { value: PhotoStyle; label: string }[] = [
  { value: 'both_framed_first', label: 'Both — framed first' },
  { value: 'both_polaroid_first', label: 'Both — polaroid first' },
  { value: 'framed_only', label: 'Framed only' },
  { value: 'polaroid_only', label: 'Polaroid only' },
]

// S3 reference picker — same pattern/endpoint as the rest of the platform.
const SUBJECT_REFERENCE_DEFAULT_PREFIX = 'uploads/'
const REFERENCE_PAGE_SIZE = 24

interface S3ReferenceBrowseItem {
  key: string
  presignedUrl: string
}

const RELATIONS = [
  'dad',
  'mom',
  'brother',
  'sister',
  'best friend',
  'grandpa',
  'grandma',
  'husband',
  'wife',
  'son',
  'daughter',
]

const SLIDE_COUNTS = [3, 4, 5, 6, 7]

// Curated object pools for object_only slides — selecting these (plus any "Other"
// entries) restricts the objects the AI may use so the object slides stay
// differentiated. The pool swaps with the Honor/Miss frame: "honor" leans toward
// kept/ritual objects, "miss" leans toward shared places and scenes of absence.
const HONOR_OBJECT_CHOICES = [
  'a glass Coca-Cola bottle on a kitchen counter',
  'a cast-iron skillet on a stovetop',
  'a worn Stetson cowboy hat on a hook',
  'a red Folgers coffee can on the counter',
  'a pair of leather work gloves on a workbench',
  'a wooden rocking chair on a porch',
  'a fishing rod and tackle box by the door',
  'a stack of vinyl records beside a record player',
  'a pocket watch on a dresser',
  'reading glasses resting on an open book',
  'a worn leather Bible on a nightstand',
  'a flannel shirt draped over a chair',
  'a harmonica on a windowsill',
  'a deck of well-worn playing cards on a table',
  'a porcelain tea cup and saucer',
  'a toolbox with a hammer on a garage shelf',
  'a knitting basket with yarn and needles',
  'a watering can in a garden',
]

// "Miss" frame: shared places, outings, and quiet scenes of their absence. These
// render as object_only (no people in frame), so they read as "the thing we did"
// or "the place we went" with them no longer there.
const MISS_OBJECT_CHOICES = [
  'a TV showing a Dallas Cowboys game in a quiet living room',
  'two empty folding chairs on a Galveston beach at golden hour',
  'an empty fishing chair at the end of a wooden pier',
  'an empty rocking chair on the front porch',
  'two coffee mugs on a kitchen table, one untouched',
  'a worn recliner with the TV remote left on the armrest',
  'a quiet workshop with tools left mid-project',
  'a diner booth with two place settings, one empty',
  'a truck parked in the driveway, keys on the seat',
  'a porch swing swaying in the wind with no one on it',
  'a campfire burning low beside two empty camp chairs',
  'a stadium seat with a team cap resting on it',
  'a record player mid-spin in an empty room',
  'a garden bench under a tree with autumn leaves falling',
  'a church pew with a folded program left behind',
  'a lake dock at sunrise with a tackle box and two poles',
  'a kitchen table set for Sunday dinner, one chair empty',
  'a country road at dusk seen through a windshield',
]

interface LovedOne {
  id: string
  name: string
  relationship: string | null
  master_photo_url: string | null
}

interface JobSlide {
  order: number
  role: 'intro' | 'memory' | 'closer'
  caption: string
  visual_type: string
  prompt: string
  uses_reference: boolean
  s3_key: string | null
  image_url: string | null
}

interface HonorMissJob {
  id: string
  mode: Mode
  relation: string
  slide_count: number
  persona_name: string | null
  intro_caption: string | null
  closer_caption: string | null
  slides: JobSlide[]
}

function roleLabel(role: JobSlide['role']): string {
  if (role === 'intro') return 'Intro'
  if (role === 'closer') return 'Closer'
  return 'Memory'
}

// Defensive response parsing: long-running routes can hit a Vercel 504/timeout
// that returns plain text (HTML), which makes res.json() throw a confusing
// "Unexpected token" error. Fall back to a clean, status-aware message.
async function parseJsonResponse(res: Response): Promise<{ ok: boolean; data: Record<string, unknown> | null; errorText: string | null }> {
  const raw = await res.text()
  try {
    const data = raw ? JSON.parse(raw) : {}
    return { ok: res.ok, data, errorText: null }
  } catch {
    const errorText =
      res.status === 504 || res.status === 408
        ? 'The request timed out. The slideshow may still be generating — check recent jobs in a moment, or try fewer slides.'
        : `Server returned an unexpected response (HTTP ${res.status}). Please try again.`
    return { ok: false, data: null, errorText }
  }
}

function HonorMissPage() {
  const searchParams = useSearchParams()
  const [mode, setMode] = useState<Mode>('honor')
  const [relation, setRelation] = useState<string>('dad')
  const [lovedOnes, setLovedOnes] = useState<LovedOne[]>([])
  const [lovedOneId, setLovedOneId] = useState<string>('')
  const [slideCount, setSlideCount] = useState<number>(3)
  const [anchor1, setAnchor1] = useState('')
  const [anchor2, setAnchor2] = useState('')

  // Object pool for object_only slides (curated selections + custom "Other" text).
  const [selectedObjects, setSelectedObjects] = useState<string[]>([])
  const [objectOther, setObjectOther] = useState('')

  // Framed vs polaroid composition for the person photos.
  const [photoStyle, setPhotoStyle] = useState<PhotoStyle>('both_framed_first')

  // Subject (third-person tribute) state
  const [perspective, setPerspective] = useState<Perspective>('first_person')
  const [subjectName, setSubjectName] = useState('')

  // S3 reference picker (mirrors the platform-wide /api/admin/social/reference-browse picker)
  const [showReferencePicker, setShowReferencePicker] = useState(false)
  const [referencePrefixInput, setReferencePrefixInput] = useState(SUBJECT_REFERENCE_DEFAULT_PREFIX)
  const [referenceActivePrefix, setReferenceActivePrefix] = useState(SUBJECT_REFERENCE_DEFAULT_PREFIX)
  const [referenceItems, setReferenceItems] = useState<S3ReferenceBrowseItem[]>([])
  const [referenceLoading, setReferenceLoading] = useState(false)
  const [referencePage, setReferencePage] = useState(1)
  const [referencePageInput, setReferencePageInput] = useState('1')
  const [referenceHasNextPage, setReferenceHasNextPage] = useState(false)
  const [referencePickerError, setReferencePickerError] = useState<string | null>(null)
  const [referencePickKey, setReferencePickKey] = useState('')
  // Presigned preview URL for the chosen reference — also sent as subjectMasterPhotoUrl.
  const [subjectPhotoUrl, setSubjectPhotoUrl] = useState('')

  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [job, setJob] = useState<HonorMissJob | null>(null)
  const [regenerating, setRegenerating] = useState<Record<number, boolean>>({})
  const [sending, setSending] = useState(false)

  useEffect(() => {
    const loadLovedOnes = async () => {
      try {
        const res = await fetch('/api/admin/social/ai-ugc/loved-ones')
        const data = await res.json()
        const list: LovedOne[] = (data.loved_ones || []).filter((lo: LovedOne) => lo.master_photo_url)
        setLovedOnes(list)
        if (list.length > 0) setLovedOneId(list[0].id)
      } catch {
        setError('Failed to load personas')
      }
    }
    void loadLovedOnes()
  }, [])

  // Prefill from the Tributes admin page ("Generate Honor/Miss from this"):
  // ?subject=&referenceUrl=&referenceKey= wires up third-person tribute mode.
  useEffect(() => {
    const subject = searchParams.get('subject')
    const referenceUrl = searchParams.get('referenceUrl')
    const referenceKey = searchParams.get('referenceKey')
    if (!subject && !referenceUrl && !referenceKey) return
    setPerspective('third_person')
    if (subject) setSubjectName(subject)
    if (referenceUrl) setSubjectPhotoUrl(referenceUrl)
    if (referenceKey) setReferencePickKey(referenceKey)
  }, [searchParams])

  const sortedSlides = useMemo(
    () => (job?.slides ? [...job.slides].sort((a, b) => a.order - b.order) : []),
    [job]
  )

  const browseReferencePrefix = async (prefix: string, page = 1) => {
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
      const resolvedPage =
        typeof data.page === 'number' && Number.isFinite(data.page) && data.page > 0
          ? Math.floor(data.page)
          : Math.max(1, page)
      setReferenceActivePrefix(prefix)
      setReferencePrefixInput(prefix)
      setReferenceItems(nextItems)
      setReferencePage(resolvedPage)
      setReferencePageInput(String(resolvedPage))
      setReferenceHasNextPage(Boolean(data.hasNextPage))
    } catch (err) {
      setReferencePickerError(err instanceof Error ? err.message : 'Failed to browse S3 reference photos')
    } finally {
      setReferenceLoading(false)
    }
  }

  const handleSelectReference = (item: S3ReferenceBrowseItem) => {
    setReferencePickKey(item.key)
    setSubjectPhotoUrl(item.presignedUrl)
    setShowReferencePicker(false)
  }

  const handleGenerate = async () => {
    setError(null)
    setSuccess(null)
    if (!lovedOneId) {
      setError('Pick a persona first.')
      return
    }
    if (perspective === 'third_person' && !subjectPhotoUrl) {
      setError('Pick or upload a subject reference photo for third-person tribute mode.')
      return
    }
    setGenerating(true)
    setJob(null)
    try {
      const customObjects = objectOther
        .split(/[\n,]/)
        .map((o) => o.trim())
        .filter(Boolean)
      const objectChoices = Array.from(new Set([...selectedObjects, ...customObjects]))
      const res = await fetch('/api/admin/social/honor-miss/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode,
          relation,
          lovedOneId,
          slideCount,
          anchors: [anchor1, anchor2].filter((a) => a.trim()),
          perspective,
          subjectName: subjectName.trim(),
          subjectMasterPhotoUrl: perspective === 'third_person' ? subjectPhotoUrl : '',
          objectChoices,
          photoStyle,
        }),
      })
      const { ok, data, errorText } = await parseJsonResponse(res)
      if (errorText) {
        throw new Error(errorText)
      }
      if (!ok || !data) {
        throw new Error((data?.details as string) || (data?.error as string) || 'Generation failed')
      }
      setJob(data.job as HonorMissJob)
      const failedSlides = Array.isArray(data.failedSlides) ? (data.failedSlides as number[]) : []
      setSuccess(
        failedSlides.length > 0
          ? `Slideshow generated. ${failedSlides.length} slide(s) failed (${failedSlides.join(', ')}) — regenerate them individually below.`
          : 'Slideshow generated.'
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generation failed')
    } finally {
      setGenerating(false)
    }
  }

  const handleRegenerate = async (order: number) => {
    if (!job) return
    setError(null)
    setRegenerating((prev) => ({ ...prev, [order]: true }))
    try {
      const res = await fetch('/api/admin/social/honor-miss/regenerate-slide', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId: job.id, order }),
      })
      const { ok, data, errorText } = await parseJsonResponse(res)
      if (errorText) {
        throw new Error(errorText)
      }
      if (!ok || !data) {
        throw new Error((data?.details as string) || (data?.error as string) || 'Regeneration failed')
      }
      setJob(data.job as HonorMissJob)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Regeneration failed')
    } finally {
      setRegenerating((prev) => ({ ...prev, [order]: false }))
    }
  }

  const handleSendToPhone = async () => {
    if (!job) return
    setError(null)
    setSuccess(null)
    const payloadSlides = sortedSlides
      .filter((s) => s.image_url)
      .map((s) => ({
        order: s.order,
        image_url: s.image_url as string,
        note: s.caption,
        s3_key: s.s3_key || '',
      }))

    if (payloadSlides.length === 0) {
      setError('No generated slides with images to send.')
      return
    }

    const albumName = `honor_miss_${job.mode}_${job.relation.replace(/\s+/g, '_')}_${Date.now()}`

    setSending(true)
    try {
      const res = await fetch('/api/admin/social/send-to-phone', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ albumName, slides: payloadSlides }),
      })
      const { ok, data, errorText } = await parseJsonResponse(res)
      if (errorText) {
        throw new Error(errorText)
      }
      if (!ok || !data) {
        const details = data?.details
        const text =
          typeof details === 'string' ? details : details ? JSON.stringify(details) : (data?.error as string)
        throw new Error(text || 'Failed to send to phone')
      }
      setSuccess(`Sent ${payloadSlides.length} slide(s) to ${albumName}.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send to phone')
    } finally {
      setSending(false)
    }
  }

  // Object pool swaps with the frame: kept/ritual objects for "honor", shared
  // places and scenes of absence for "miss".
  const activeObjectChoices = mode === 'honor' ? HONOR_OBJECT_CHOICES : MISS_OBJECT_CHOICES

  // Switching frames clears any curated picks so stale selections from the other
  // pool aren't carried over (custom "Other" text is left as-is).
  const handleModeChange = (next: Mode) => {
    if (next === mode) return
    setMode(next)
    setSelectedObjects([])
  }

  const previewCaption =
    mode === 'honor'
      ? `${slideCount} ways I honor my ${relation}`
      : `${slideCount} things I miss about my ${relation}`

  return (
    <div className={`min-h-screen bg-[#0b1220] text-[#f3ead9] p-5 md:p-8 ${dmSans.className}`}>
      <div className="max-w-6xl mx-auto space-y-6">
        <header className="space-y-3">
          <Link href="/admin/social" className="inline-flex text-sm text-[#d6b274] hover:text-[#ecc98a] transition-colors">
            ← Back to Social
          </Link>
          <div>
            <h1 className={`text-4xl text-[#f3ead9] ${cormorant.className}`}>Honor &amp; Miss Slideshows</h1>
            <p className="text-[#ceb995] mt-1">
              Generate a fully LLM-driven slideshow — &ldquo;ways I honor&rdquo; or &ldquo;things I miss&rdquo; — then send
              the slides to your phone for manual upload.
            </p>
          </div>
        </header>

        {/* ─── Configuration ─────────────────────────────────────────── */}
        <section className="rounded-2xl border border-[#2c3b59] bg-[#121b2d] p-4 md:p-6 space-y-5">
          {/* Mode toggle */}
          <div>
            <p className="text-sm text-[#ceb995] mb-2">Frame</p>
            <div className="inline-flex rounded-xl border border-[#364767] bg-[#0f1728] p-1">
              {(['honor', 'miss'] as Mode[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => handleModeChange(m)}
                  className={`px-5 py-2 rounded-lg text-sm font-semibold transition-colors ${
                    mode === m ? 'bg-[#b58d45] text-[#111827]' : 'text-[#ceb995] hover:text-[#f3ead9]'
                  }`}
                >
                  {m === 'honor' ? 'Honor' : 'Miss'}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Relation */}
            <label className="block text-sm text-[#ceb995]">
              Relation
              <select
                value={relation}
                onChange={(e) => setRelation(e.target.value)}
                className="mt-1 w-full rounded-lg border border-[#364767] bg-[#0f1728] px-3 py-2 text-sm text-[#f3ead9] focus:outline-none focus:ring-2 focus:ring-[#b58d45]"
              >
                {RELATIONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </label>

            {/* Persona */}
            <label className="block text-sm text-[#ceb995]">
              Persona (master photo)
              <select
                value={lovedOneId}
                onChange={(e) => setLovedOneId(e.target.value)}
                className="mt-1 w-full rounded-lg border border-[#364767] bg-[#0f1728] px-3 py-2 text-sm text-[#f3ead9] focus:outline-none focus:ring-2 focus:ring-[#b58d45]"
              >
                {lovedOnes.length === 0 ? (
                  <option value="">No personas with a master photo</option>
                ) : (
                  lovedOnes.map((lo) => (
                    <option key={lo.id} value={lo.id}>
                      {lo.name}
                      {lo.relationship ? ` (${lo.relationship})` : ''}
                    </option>
                  ))
                )}
              </select>
            </label>

            {/* Slide count */}
            <label className="block text-sm text-[#ceb995]">
              Memory slides
              <select
                value={slideCount}
                onChange={(e) => setSlideCount(Number(e.target.value))}
                className="mt-1 w-full rounded-lg border border-[#364767] bg-[#0f1728] px-3 py-2 text-sm text-[#f3ead9] focus:outline-none focus:ring-2 focus:ring-[#b58d45]"
              >
                {SLIDE_COUNTS.map((n) => (
                  <option key={n} value={n}>
                    {n} (= {n + 2} images)
                  </option>
                ))}
              </select>
            </label>
          </div>

          {/* Photo memory style */}
          <div>
            <label className="block text-sm text-[#ceb995] md:max-w-xs">
              Photo memory style
              <select
                value={photoStyle}
                onChange={(e) => setPhotoStyle(e.target.value as PhotoStyle)}
                className="mt-1 w-full rounded-lg border border-[#364767] bg-[#0f1728] px-3 py-2 text-sm text-[#f3ead9] focus:outline-none focus:ring-2 focus:ring-[#b58d45]"
              >
                {PHOTO_STYLE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>
            <p className="text-xs text-[#7f8db0] mt-1">
              Controls the person photos. &ldquo;Both&rdquo; guarantees at least one framed photo and one polaroid; the
              chosen type takes the first guaranteed slot. This never affects Slide 1 (always the S3 reference).
            </p>
          </div>

          {/* Anchors */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="block text-sm text-[#ceb995]">
              Anchor detail 1 (optional)
              <input
                value={anchor1}
                onChange={(e) => setAnchor1(e.target.value)}
                placeholder='e.g. "loved Coca-Cola in glass bottles"'
                className="mt-1 w-full rounded-lg border border-[#364767] bg-[#0f1728] px-3 py-2 text-sm text-[#f3ead9] focus:outline-none focus:ring-2 focus:ring-[#b58d45]"
              />
            </label>
            <label className="block text-sm text-[#ceb995]">
              Anchor detail 2 (optional)
              <input
                value={anchor2}
                onChange={(e) => setAnchor2(e.target.value)}
                placeholder='e.g. "was a Vietnam vet"'
                className="mt-1 w-full rounded-lg border border-[#364767] bg-[#0f1728] px-3 py-2 text-sm text-[#f3ead9] focus:outline-none focus:ring-2 focus:ring-[#b58d45]"
              />
            </label>
          </div>

          {/* Object pool for object-only slides */}
          <div className="rounded-xl border border-[#33456a] bg-[#0f1728] p-4 space-y-3">
            <div>
              <p className="text-sm font-semibold text-[#f1d386]">
                {mode === 'honor'
                  ? 'Objects for object-only slides (optional)'
                  : 'Places & things you miss — for object-only slides (optional)'}
              </p>
              <p className="text-xs text-[#7f8db0] mt-1">
                {mode === 'honor'
                  ? 'Pick which objects the AI is allowed to use for the object-only slides. Choose a variety to keep results differentiated. Leave everything unchecked to let the AI decide freely.'
                  : 'Pick the shared places and scenes the AI is allowed to use for the object-only slides — rendered with no people, so they read as the things you miss. Choose a variety to keep results differentiated. Leave everything unchecked to let the AI decide freely.'}
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {activeObjectChoices.map((obj) => {
                const checked = selectedObjects.includes(obj)
                return (
                  <label
                    key={obj}
                    className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-xs cursor-pointer transition-colors ${
                      checked
                        ? 'border-[#b58d45] bg-[#1c2740] text-[#f3ead9]'
                        : 'border-[#364767] bg-[#0b1322] text-[#ceb995] hover:border-[#4a5c82]'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() =>
                        setSelectedObjects((prev) =>
                          prev.includes(obj) ? prev.filter((o) => o !== obj) : [...prev, obj]
                        )
                      }
                      className="mt-0.5 accent-[#b58d45]"
                    />
                    <span className="leading-snug">{obj}</span>
                  </label>
                )
              })}
            </div>

            <label className="block text-sm text-[#ceb995]">
              Other objects (optional, comma- or line-separated)
              <textarea
                value={objectOther}
                onChange={(e) => setObjectOther(e.target.value)}
                rows={2}
                placeholder='e.g. "a worn baseball glove on a shelf, a thermos of black coffee"'
                className="mt-1 w-full rounded-lg border border-[#364767] bg-[#0b1322] px-3 py-2 text-sm text-[#f3ead9] focus:outline-none focus:ring-2 focus:ring-[#b58d45]"
              />
            </label>

            {(selectedObjects.length > 0 || objectOther.trim()) && (
              <button
                type="button"
                onClick={() => {
                  setSelectedObjects([])
                  setObjectOther('')
                }}
                className="text-xs text-[#7f8db0] hover:text-red-300"
              >
                Clear object selections
              </button>
            )}
          </div>

          {/* Subject (who the post is about) */}
          <div className="rounded-xl border border-[#33456a] bg-[#0f1728] p-4 space-y-4">
            <div>
              <p className="text-sm font-semibold text-[#f1d386]">Subject (who the post is about)</p>
              <p className="text-xs text-[#7f8db0] mt-1">
                Choose whose face appears in the memory slides. First-person uses the persona everywhere.
                Third-person uses a separate reference photo of the person being honored/missed.
              </p>
            </div>

            {/* Perspective toggle */}
            <div>
              <p className="text-xs text-[#ceb995] mb-2">Perspective</p>
              <div className="inline-flex rounded-xl border border-[#364767] bg-[#0b1322] p-1">
                {([
                  { value: 'first_person', label: 'First-person (persona)' },
                  { value: 'third_person', label: 'Third-person tribute' },
                ] as { value: Perspective; label: string }[]).map((p) => (
                  <button
                    key={p.value}
                    type="button"
                    onClick={() => setPerspective(p.value)}
                    className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                      perspective === p.value ? 'bg-[#b58d45] text-[#111827]' : 'text-[#ceb995] hover:text-[#f3ead9]'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Subject name */}
            <label className="block text-sm text-[#ceb995]">
              Subject name (optional)
              <input
                value={subjectName}
                onChange={(e) => setSubjectName(e.target.value)}
                placeholder={'e.g. "Dad" or "Sarah\'s dad"'}
                className="mt-1 w-full rounded-lg border border-[#364767] bg-[#0b1322] px-3 py-2 text-sm text-[#f3ead9] focus:outline-none focus:ring-2 focus:ring-[#b58d45]"
              />
            </label>

            {/* Subject reference photo picker (same S3 picker used across the platform) */}
            {perspective === 'third_person' && (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setShowReferencePicker(true)
                      void browseReferencePrefix(referenceActivePrefix || SUBJECT_REFERENCE_DEFAULT_PREFIX, 1)
                    }}
                    className="rounded-lg border border-[#b58d45]/70 bg-[#1c2740] px-4 py-2 text-sm text-[#f1d386] hover:bg-[#243150]"
                  >
                    Pick reference photo from S3
                  </button>
                  {referencePickKey ? (
                    <span className="text-xs text-[#f3ead9] break-all">Selected key: {referencePickKey}</span>
                  ) : (
                    <span className="text-xs text-[#7f8db0]">No S3 reference selected yet.</span>
                  )}
                  {subjectPhotoUrl && (
                    <button
                      type="button"
                      onClick={() => {
                        setSubjectPhotoUrl('')
                        setReferencePickKey('')
                      }}
                      className="text-xs text-[#7f8db0] hover:text-red-300"
                    >
                      Clear
                    </button>
                  )}
                </div>

                {subjectPhotoUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={subjectPhotoUrl}
                    alt="Selected subject reference"
                    className="w-32 h-32 object-cover rounded-lg border border-[#364767]"
                  />
                )}
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-1">
            <button
              type="button"
              onClick={() => void handleGenerate()}
              disabled={generating || !lovedOneId}
              className="rounded-lg bg-[#b58d45] px-5 py-2.5 text-sm font-semibold text-[#111827] hover:bg-[#c59c4f] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {generating ? 'Generating…' : 'Generate slideshow'}
            </button>
            <span className="text-sm text-[#7f8db0]">
              Slide 1: <span className="text-[#d6b274]">&ldquo;{previewCaption}&rdquo;</span>
            </span>
          </div>

          {generating && (
            <p className="text-xs text-[#7f8db0]">
              Generating {slideCount + 2} images — this can take a couple of minutes. Keep this tab open.
            </p>
          )}
        </section>

        {error && (
          <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-red-300 text-sm">{error}</div>
        )}
        {success && (
          <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-emerald-200 text-sm">
            {success}
          </div>
        )}

        {/* ─── Library card preview ──────────────────────────────────── */}
        {job && (
          <section className="rounded-2xl border border-[#2c3b59] bg-[#121b2d] p-4 md:p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className={`${cormorant.className} text-2xl text-[#f1d386]`}>{job.intro_caption}</h2>
                <p className="text-sm text-[#ceb995]">
                  {job.persona_name} · {sortedSlides.length} slides
                </p>
              </div>
              <button
                type="button"
                onClick={() => void handleSendToPhone()}
                disabled={sending}
                className="rounded-lg bg-[#b58d45] px-4 py-2 text-sm font-semibold text-[#111827] hover:bg-[#c59c4f] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {sending ? 'Sending…' : 'Send to phone'}
              </button>
            </div>

            <div className="flex gap-4 overflow-x-auto pb-2">
              {sortedSlides.map((slide) => (
                <article
                  key={slide.order}
                  className="shrink-0 w-[220px] rounded-xl border border-[#32476b] bg-[#0f1728] overflow-hidden flex flex-col"
                >
                  <div className="relative aspect-[9/16] bg-[#0b1322] flex items-center justify-center">
                    {slide.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={slide.image_url} alt={`Slide ${slide.order}`} className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-xs text-red-300 px-3 text-center">Image failed — regenerate</span>
                    )}
                    <span className="absolute top-2 left-2 text-[10px] uppercase tracking-wide rounded-full bg-[#0b1220]/80 border border-[#415477] px-2 py-0.5 text-[#d7c29b]">
                      {slide.order} · {roleLabel(slide.role)}
                    </span>
                  </div>
                  <div className="p-3 flex flex-col gap-2 flex-1">
                    <p className="text-sm text-[#f3ead9] leading-snug">{slide.caption}</p>
                    <p className="text-[10px] text-[#7f8db0] uppercase tracking-wide">{slide.visual_type}</p>
                    <button
                      type="button"
                      onClick={() => void handleRegenerate(slide.order)}
                      disabled={!!regenerating[slide.order]}
                      className="mt-auto rounded-md border border-[#415477] px-2 py-1.5 text-xs text-[#d7c29b] hover:border-[#d8b372] disabled:opacity-50"
                    >
                      {regenerating[slide.order] ? 'Regenerating…' : 'Regenerate this slide'}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}
      </div>

      {/* ─── S3 reference picker modal (shared platform pattern) ─────────── */}
      {showReferencePicker && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm p-4 md:p-6 overflow-y-auto">
          <div className="max-w-6xl mx-auto bg-[#111a2f] border border-[#3d4a68] rounded-2xl p-4 md:p-6 space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h3 className={`${cormorant.className} text-2xl text-[#f1d386]`}>Pick S3 Reference</h3>
                <p className="text-xs text-[#b9aa87] mt-1">
                  Source bucket: order-by-age-uploads. Selected photo is used as the subject identity reference.
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
                onClick={() => void browseReferencePrefix(referencePrefixInput.trim() || SUBJECT_REFERENCE_DEFAULT_PREFIX, 1)}
                disabled={referenceLoading}
                className="px-4 py-2 rounded-lg border border-[#f1d386]/70 text-[#f1d386] hover:bg-[#f1d386]/10 disabled:opacity-60"
              >
                {referenceLoading ? 'Loading...' : 'Browse'}
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs text-[#b9aa87]">
              <span>Current prefix: {referenceActivePrefix}</span>
              <span>Page {referencePage}</span>
              <span>{REFERENCE_PAGE_SIZE} per page</span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void browseReferencePrefix(referenceActivePrefix, referencePage - 1)}
                disabled={referenceLoading || referencePage <= 1}
                className="px-3 py-1.5 rounded-lg border border-[#3d4a68] text-[#f7f1df] hover:bg-[#2e3b5e] disabled:opacity-60"
              >
                Prev
              </button>
              <button
                type="button"
                onClick={() => void browseReferencePrefix(referenceActivePrefix, referencePage + 1)}
                disabled={referenceLoading || !referenceHasNextPage}
                className="px-3 py-1.5 rounded-lg border border-[#3d4a68] text-[#f7f1df] hover:bg-[#2e3b5e] disabled:opacity-60"
              >
                Next
              </button>
              <input
                value={referencePageInput}
                onChange={(e) => setReferencePageInput(e.target.value.replace(/[^\d]/g, ''))}
                placeholder="Page #"
                className="w-24 px-2 py-1.5 bg-[#0f1729] border border-[#3d4a68] rounded-lg text-[#f7f1df]"
              />
              <button
                type="button"
                onClick={() => {
                  const parsedPage = Number.parseInt(referencePageInput || '1', 10)
                  const safePage = Number.isNaN(parsedPage) ? 1 : Math.max(1, parsedPage)
                  void browseReferencePrefix(referenceActivePrefix, safePage)
                }}
                disabled={referenceLoading}
                className="px-3 py-1.5 rounded-lg border border-[#f1d386]/70 text-[#f1d386] hover:bg-[#f1d386]/10 disabled:opacity-60"
              >
                Go
              </button>
            </div>

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
                        isSelected ? 'border-[#f1d386] ring-1 ring-[#f1d386]' : 'border-[#3d4a68] hover:border-[#f1d386]/60'
                      }`}
                      title={item.key}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
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
          </div>
        </div>
      )}
    </div>
  )
}

export default function HonorMissPageWrapper() {
  return (
    <Suspense fallback={null}>
      <HonorMissPage />
    </Suspense>
  )
}
