'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { Cormorant_Garamond, DM_Sans } from 'next/font/google'

const cormorant = Cormorant_Garamond({ subsets: ['latin'], weight: ['500', '600', '700'] })
const dmSans = DM_Sans({ subsets: ['latin'], weight: ['400', '500', '700'] })

type Mode = 'honor' | 'miss'

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

export default function HonorMissPage() {
  const [mode, setMode] = useState<Mode>('honor')
  const [relation, setRelation] = useState<string>('dad')
  const [lovedOnes, setLovedOnes] = useState<LovedOne[]>([])
  const [lovedOneId, setLovedOneId] = useState<string>('')
  const [slideCount, setSlideCount] = useState<number>(5)
  const [anchor1, setAnchor1] = useState('')
  const [anchor2, setAnchor2] = useState('')

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

  const sortedSlides = useMemo(
    () => (job?.slides ? [...job.slides].sort((a, b) => a.order - b.order) : []),
    [job]
  )

  const handleGenerate = async () => {
    setError(null)
    setSuccess(null)
    if (!lovedOneId) {
      setError('Pick a persona first.')
      return
    }
    setGenerating(true)
    setJob(null)
    try {
      const res = await fetch('/api/admin/social/honor-miss/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode,
          relation,
          lovedOneId,
          slideCount,
          anchors: [anchor1, anchor2].filter((a) => a.trim()),
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data?.details || data?.error || 'Generation failed')
      }
      setJob(data.job as HonorMissJob)
      setSuccess('Slideshow generated.')
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
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data?.details || data?.error || 'Regeneration failed')
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
      const data = await res.json()
      if (!res.ok) {
        const details = data?.details
        const text =
          typeof details === 'string' ? details : details ? JSON.stringify(details) : data?.error
        throw new Error(text || 'Failed to send to phone')
      }
      setSuccess(`Sent ${payloadSlides.length} slide(s) to ${albumName}.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send to phone')
    } finally {
      setSending(false)
    }
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
                  onClick={() => setMode(m)}
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
    </div>
  )
}
