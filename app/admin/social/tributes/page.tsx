'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Cormorant_Garamond, DM_Sans } from 'next/font/google'

const cormorant = Cormorant_Garamond({ subsets: ['latin'], weight: ['500', '600', '700'] })
const dmSans = DM_Sans({ subsets: ['latin'], weight: ['400', '500', '700'] })

type Status = 'new' | 'reviewing' | 'in_progress' | 'posted' | 'declined'

interface TributePhoto {
  key: string
  presignedUrl: string
}

interface Tribute {
  id: string
  loved_one_name: string
  relationship: string
  date_of_birth: string | null
  date_of_passing: string | null
  photo_s3_keys: string[]
  submitter_email: string
  submitter_name: string | null
  loved_things: string | null
  ways_honored: string | null
  things_missed: string | null
  specific_memory: string | null
  song: string | null
  other_details: string | null
  status: Status
  posted_url: string | null
  reviewer_notes: string | null
  created_at: string
  photos: TributePhoto[]
}

const STATUS_TABS: Array<{ key: 'all' | Status; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'new', label: 'New' },
  { key: 'reviewing', label: 'Reviewing' },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'posted', label: 'Posted' },
  { key: 'declined', label: 'Declined' },
]

const STATUS_OPTIONS: Array<{ value: Status; label: string }> = [
  { value: 'new', label: 'New' },
  { value: 'reviewing', label: 'Reviewing' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'posted', label: 'Posted' },
  { value: 'declined', label: 'Declined' },
]

function formatDate(value: string | null): string {
  if (!value) return '—'
  return value
}

const DEEPER_FIELDS: Array<{ key: keyof Tribute; label: string }> = [
  { key: 'loved_things', label: '3 things they loved' },
  { key: 'ways_honored', label: '3 ways they honor them' },
  { key: 'things_missed', label: '3 things they miss' },
  { key: 'specific_memory', label: 'A specific memory' },
  { key: 'song', label: 'A song' },
  { key: 'other_details', label: 'Anything else' },
]

export default function TributesAdminPage() {
  const [items, setItems] = useState<Tribute[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'all' | Status>('all')
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  const [notesDrafts, setNotesDrafts] = useState<Record<string, string>>({})
  const [postedUrlDrafts, setPostedUrlDrafts] = useState<Record<string, string>>({})
  const notesTimers = useRef<Record<string, number>>({})
  const itemsRef = useRef<Tribute[]>([])

  useEffect(() => {
    itemsRef.current = items
  }, [items])

  useEffect(() => {
    if (!toast) return
    const t = window.setTimeout(() => setToast(null), 2500)
    return () => window.clearTimeout(t)
  }, [toast])

  useEffect(() => {
    const timers = notesTimers.current
    return () => {
      Object.values(timers).forEach(window.clearTimeout)
    }
  }, [])

  const loadItems = useCallback(async (tab: 'all' | Status) => {
    setLoading(true)
    setError(null)
    try {
      const url = tab === 'all' ? '/api/tribute/admin' : `/api/tribute/admin?status=${tab}`
      const res = await fetch(url)
      const data = await res.json()
      if (!res.ok) throw new Error(data?.details || data?.error || 'Failed to load tributes.')
      setItems((data.items || []) as Tribute[])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load tributes.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadItems(activeTab)
  }, [activeTab, loadItems])

  const sendUpdate = async (id: string, payload: Record<string, unknown>) => {
    const res = await fetch('/api/tribute/admin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...payload }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data?.details || data?.error || 'Update failed.')
    return data.item as Tribute
  }

  const mergeRow = (updated: Tribute) => {
    setItems((prev) => prev.map((row) => (row.id === updated.id ? { ...row, ...updated } : row)))
  }

  const handleStatusChange = async (tribute: Tribute, status: Status) => {
    const snapshot = itemsRef.current
    setItems((prev) => prev.map((r) => (r.id === tribute.id ? { ...r, status } : r)))
    try {
      const updated = await sendUpdate(tribute.id, { status })
      mergeRow(updated)
      setToast({ type: 'success', message: 'Status updated.' })
      // If filtering by a specific status, drop rows that no longer match.
      if (activeTab !== 'all' && status !== activeTab) {
        setItems((prev) => prev.filter((r) => r.id !== tribute.id))
      }
    } catch (err) {
      setItems(snapshot)
      setToast({ type: 'error', message: err instanceof Error ? err.message : 'Update failed.' })
    }
  }

  const notesValue = (tribute: Tribute): string =>
    notesDrafts[tribute.id] !== undefined ? notesDrafts[tribute.id] : tribute.reviewer_notes || ''

  const handleNotesBlur = (tribute: Tribute) => {
    const value = notesDrafts[tribute.id]
    if (value === undefined) return
    if ((tribute.reviewer_notes || '') === value) return
    const timerKey = `${tribute.id}:notes`
    if (notesTimers.current[timerKey]) window.clearTimeout(notesTimers.current[timerKey])
    notesTimers.current[timerKey] = window.setTimeout(async () => {
      try {
        const updated = await sendUpdate(tribute.id, { reviewer_notes: value })
        mergeRow(updated)
        setToast({ type: 'success', message: 'Notes saved.' })
      } catch (err) {
        setToast({ type: 'error', message: err instanceof Error ? err.message : 'Save failed.' })
      }
    }, 300)
  }

  const postedUrlValue = (tribute: Tribute): string =>
    postedUrlDrafts[tribute.id] !== undefined
      ? postedUrlDrafts[tribute.id]
      : tribute.posted_url || ''

  const handleMarkPosted = async (tribute: Tribute) => {
    const url = postedUrlValue(tribute).trim()
    const snapshot = itemsRef.current
    setItems((prev) =>
      prev.map((r) => (r.id === tribute.id ? { ...r, status: 'posted', posted_url: url || null } : r))
    )
    try {
      const updated = await sendUpdate(tribute.id, { status: 'posted', posted_url: url })
      mergeRow(updated)
      setToast({ type: 'success', message: 'Marked as posted.' })
      if (activeTab !== 'all' && activeTab !== 'posted') {
        setItems((prev) => prev.filter((r) => r.id !== tribute.id))
      }
    } catch (err) {
      setItems(snapshot)
      setToast({ type: 'error', message: err instanceof Error ? err.message : 'Save failed.' })
    }
  }

  const honorMissHref = (tribute: Tribute): string => {
    const params = new URLSearchParams()
    params.set('subject', tribute.loved_one_name)
    const primary = tribute.photos[0]
    if (primary?.presignedUrl) params.set('referenceUrl', primary.presignedUrl)
    if (primary?.key) params.set('referenceKey', primary.key)
    return `/admin/social/honor-miss?${params.toString()}`
  }

  const counts = useMemo(() => {
    if (activeTab !== 'all') return null
    return items.length
  }, [activeTab, items])

  return (
    <div className={`min-h-screen bg-[#0b1220] text-[#f3ead9] p-5 md:p-8 ${dmSans.className}`}>
      <div className="max-w-5xl mx-auto space-y-6">
        <header className="space-y-3">
          <Link
            href="/admin/social"
            className="inline-flex text-sm text-[#d6b274] hover:text-[#ecc98a] transition-colors"
          >
            ← Back to Social
          </Link>
          <div>
            <h1 className={`text-4xl text-[#f3ead9] ${cormorant.className}`}>Tributes</h1>
            <p className="text-[#ceb995] mt-1">
              Submissions from the public tribute form. Newest first.
              {counts !== null ? ` ${counts} total.` : ''}
            </p>
          </div>
        </header>

        <section className="rounded-2xl border border-[#2c3b59] bg-[#121b2d] p-4">
          <div className="flex flex-wrap gap-2">
            {STATUS_TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`px-3.5 py-1.5 rounded-full text-sm border transition-colors ${
                  activeTab === tab.key
                    ? 'bg-[#b58d45] text-[#101828] border-[#d8b372]'
                    : 'border-[#415477] text-[#d7c29b] hover:border-[#d8b372]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </section>

        {error && (
          <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-red-300">
            {error}
          </div>
        )}

        {loading ? (
          <div className="rounded-2xl border border-[#2c3b59] bg-[#121b2d] p-10 text-center text-[#ceb995]">
            Loading tributes…
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-2xl border border-[#2c3b59] bg-[#121b2d] p-10 text-center text-[#ceb995]">
            No tributes in this view yet.
          </div>
        ) : (
          <section className="space-y-5">
            {items.map((tribute) => (
              <article
                key={tribute.id}
                className="rounded-2xl border border-[#2c3b59] bg-[#121b2d] p-5 md:p-6 space-y-5"
              >
                <div className="flex flex-col gap-1 md:flex-row md:items-start md:justify-between">
                  <div>
                    <h2 className={`text-2xl text-[#f1d386] ${cormorant.className}`}>
                      {tribute.loved_one_name}
                    </h2>
                    <p className="text-sm text-[#ceb995]">
                      {tribute.relationship} · {formatDate(tribute.date_of_birth)} —{' '}
                      {formatDate(tribute.date_of_passing)}
                    </p>
                  </div>
                  <p className="text-xs text-[#7f8db0]">
                    {new Date(tribute.created_at).toLocaleString()}
                  </p>
                </div>

                {tribute.photos.length > 0 && (
                  <div className="flex flex-wrap gap-3">
                    {tribute.photos.map((photo) =>
                      photo.presignedUrl ? (
                        <a
                          key={photo.key}
                          href={photo.presignedUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="block w-24 h-24 rounded-lg overflow-hidden border border-[#364767] hover:border-[#b58d45]"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={photo.presignedUrl}
                            alt={tribute.loved_one_name}
                            className="w-full h-full object-cover"
                          />
                        </a>
                      ) : (
                        <div
                          key={photo.key}
                          className="w-24 h-24 rounded-lg border border-[#364767] bg-[#0f1728] flex items-center justify-center text-[10px] text-[#7f8db0] px-1 text-center"
                        >
                          unavailable
                        </div>
                      )
                    )}
                  </div>
                )}

                <div className="rounded-xl border border-[#33456a] bg-[#0f1728] p-4 text-sm space-y-1">
                  <p className="text-[#f3ead9]">{tribute.submitter_email}</p>
                  {tribute.submitter_name && (
                    <p className="text-[#ceb995]">{tribute.submitter_name}</p>
                  )}
                </div>

                {DEEPER_FIELDS.some((f) => tribute[f.key]) && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {DEEPER_FIELDS.map((field) => {
                      const value = tribute[field.key] as string | null
                      if (!value) return null
                      return (
                        <div
                          key={field.key as string}
                          className="rounded-xl border border-[#2c3b59] bg-[#0f1728] p-3"
                        >
                          <p className="text-[11px] uppercase tracking-wide text-[#7f8db0]">
                            {field.label}
                          </p>
                          <p className="text-sm text-[#f3ead9] whitespace-pre-wrap mt-1">{value}</p>
                        </div>
                      )
                    })}
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
                  <label className="block text-xs text-[#ccb78f]">
                    Status
                    <select
                      value={tribute.status}
                      onChange={(e) => void handleStatusChange(tribute, e.target.value as Status)}
                      className="mt-1.5 w-full rounded-lg border border-[#364767] bg-[#0f1728] px-3 py-2 text-sm text-[#f3ead9] focus:outline-none focus:ring-2 focus:ring-[#b58d45]"
                    >
                      {STATUS_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <Link
                    href={honorMissHref(tribute)}
                    className="self-end inline-flex items-center justify-center rounded-lg border border-[#b58d45]/70 bg-[#1c2740] px-4 py-2 text-sm text-[#f1d386] hover:bg-[#243150] transition-colors"
                  >
                    Generate Honor/Miss from this
                  </Link>
                </div>

                <label className="block text-xs text-[#ccb78f]">
                  Reviewer notes
                  <textarea
                    value={notesValue(tribute)}
                    onChange={(e) =>
                      setNotesDrafts((prev) => ({ ...prev, [tribute.id]: e.target.value }))
                    }
                    onBlur={() => handleNotesBlur(tribute)}
                    rows={2}
                    placeholder="Internal notes…"
                    className="mt-1.5 w-full rounded-lg border border-[#364767] bg-[#0f1728] px-3 py-2 text-sm text-[#f3ead9] focus:outline-none focus:ring-2 focus:ring-[#b58d45]"
                  />
                </label>

                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    value={postedUrlValue(tribute)}
                    onChange={(e) =>
                      setPostedUrlDrafts((prev) => ({ ...prev, [tribute.id]: e.target.value }))
                    }
                    placeholder="Posted URL (https://…)"
                    className="flex-1 rounded-lg border border-[#364767] bg-[#0f1728] px-3 py-2 text-sm text-[#f3ead9] focus:outline-none focus:ring-2 focus:ring-[#b58d45]"
                  />
                  <button
                    type="button"
                    onClick={() => void handleMarkPosted(tribute)}
                    className="rounded-lg bg-[#b58d45] px-4 py-2 text-sm font-semibold text-[#101828] hover:bg-[#c59c4f] transition-colors"
                  >
                    Mark posted
                  </button>
                </div>
              </article>
            ))}
          </section>
        )}
      </div>

      {toast && (
        <div
          className={`fixed top-5 right-5 z-50 px-4 py-3 rounded-lg shadow-xl ${
            toast.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
          }`}
        >
          {toast.message}
        </div>
      )}
    </div>
  )
}
