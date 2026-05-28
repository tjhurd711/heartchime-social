'use client'

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Cormorant_Garamond, DM_Sans } from 'next/font/google'

const cormorant = Cormorant_Garamond({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
})

const dmSans = DM_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '700'],
})

type MediaType = 'video' | 'photo'
type PlatformKey = 'posted_tiktok' | 'posted_instagram' | 'posted_facebook'
type FilterKey = 'all' | 'not-posted' | 'posted' | 'tiktok' | 'instagram' | 'facebook'
type EditableField = 'posted_url' | 'notes'

interface BaitItem {
  id: string
  handle: string
  tiktok_url: string | null
  s3_key: string
  media_type: MediaType
  used: boolean
  created_at: string
  posted_tiktok: boolean | null
  posted_instagram: boolean | null
  posted_facebook: boolean | null
  posted_at: string | null
  posted_url: string | null
  notes: string | null
  presignedUrl: string
}

interface BaitPatchResponse {
  item: BaitItem
}

interface SendToDeviceResult {
  imported_count?: number
  note_created?: boolean
}

interface BaitCard {
  cardId: string
  itemIds: string[]
  items: BaitItem[]
  grouped: boolean
}

const FILTERS: Array<{ key: FilterKey; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'not-posted', label: 'Not posted anywhere' },
  { key: 'posted', label: 'Posted somewhere' },
  { key: 'tiktok', label: 'TikTok' },
  { key: 'instagram', label: 'Instagram' },
  { key: 'facebook', label: 'Facebook' },
]

export default function BaitLibraryAdminPage() {
  const [items, setItems] = useState<BaitItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeFilter, setActiveFilter] = useState<FilterKey>('all')
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [slideshowIndexes, setSlideshowIndexes] = useState<Record<string, number>>({})
  const [isSendingByCard, setIsSendingByCard] = useState<Record<string, boolean>>({})
  const [sendResultByCard, setSendResultByCard] = useState<Record<string, SendToDeviceResult>>({})
  const pendingTimersRef = useRef<Record<string, number>>({})
  const itemsRef = useRef<BaitItem[]>([])

  useEffect(() => {
    itemsRef.current = items
  }, [items])

  useEffect(() => {
    void loadItems()
  }, [])

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(null), 2500)
    return () => window.clearTimeout(timer)
  }, [toast])

  useEffect(() => {
    return () => {
      Object.values(pendingTimersRef.current).forEach(window.clearTimeout)
    }
  }, [])

  const cards = useMemo(() => {
    const slideshowItems = items.filter(
      (item) => item.handle === 'anthony_12041' && item.media_type === 'photo'
    )

    const nonSlideshow = items.filter(
      (item) => !(item.handle === 'anthony_12041' && item.media_type === 'photo')
    )

    const nextCards: BaitCard[] = nonSlideshow.map((item) => ({
      cardId: item.id,
      itemIds: [item.id],
      items: [item],
      grouped: false,
    }))

    if (slideshowItems.length > 0) {
      nextCards.unshift({
        cardId: 'anthony_12041-photo-slideshow',
        itemIds: slideshowItems.map((item) => item.id),
        items: slideshowItems,
        grouped: true,
      })
    }

    return nextCards
  }, [items])

  const filteredCards = useMemo(
    () =>
      cards.filter((card) => {
        const hasTikTok = card.items.some((item) => Boolean(item.posted_tiktok))
        const hasInstagram = card.items.some((item) => Boolean(item.posted_instagram))
        const hasFacebook = card.items.some((item) => Boolean(item.posted_facebook))
        const postedSomewhere = hasTikTok || hasInstagram || hasFacebook

        switch (activeFilter) {
          case 'not-posted':
            return !postedSomewhere
          case 'posted':
            return postedSomewhere
          case 'tiktok':
            return hasTikTok
          case 'instagram':
            return hasInstagram
          case 'facebook':
            return hasFacebook
          default:
            return true
        }
      }),
    [activeFilter, cards]
  )

  const postedSomewhereCount = useMemo(
    () =>
      items.filter(
        (item) => Boolean(item.posted_tiktok) || Boolean(item.posted_instagram) || Boolean(item.posted_facebook)
      ).length,
    [items]
  )

  const totalCount = items.length

  const loadItems = async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch('/api/bait/library')
      const data = await response.json()
      if (!response.ok) {
        throw new Error(data?.details || data?.error || 'Failed to load bait library.')
      }
      setItems((data.items || []) as BaitItem[])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load bait library.')
    } finally {
      setLoading(false)
    }
  }

  const mergeUpdatedRows = (updatedRows: BaitItem[]) => {
    const rowMap = new Map(updatedRows.map((row) => [row.id, row]))
    setItems((previous) => previous.map((row) => rowMap.get(row.id) || row))
  }

  const applyOptimisticPatch = (ids: string[], patch: Partial<BaitItem>) => {
    setItems((previous) =>
      previous.map((row) => {
        if (!ids.includes(row.id)) return row
        return { ...row, ...patch }
      })
    )
  }

  const sendPatch = async (id: string, payload: Record<string, unknown>) => {
    const response = await fetch(`/api/bait/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    const data = await response.json()
    if (!response.ok) {
      throw new Error(data?.details || data?.error || 'Failed to update bait item.')
    }

    return data as BaitPatchResponse
  }

  const handleToggle = async (card: BaitCard, key: PlatformKey) => {
    const current = card.items.some((item) => Boolean(item[key]))
    const nextValue = !current
    const snapshot = itemsRef.current

    applyOptimisticPatch(card.itemIds, { [key]: nextValue } as Partial<BaitItem>)

    try {
      const responses = await Promise.all(
        card.itemIds.map((id) =>
          sendPatch(id, {
            [key]: nextValue,
          })
        )
      )

      mergeUpdatedRows(responses.map((result) => result.item))
      setToast({ type: 'success', message: 'Platform status updated.' })
    } catch (err) {
      setItems(snapshot)
      setToast({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to update platform status.',
      })
    }
  }

  const getCardFieldValue = (card: BaitCard, field: EditableField): string => {
    const draftKey = `${card.cardId}:${field}`
    if (drafts[draftKey] !== undefined) return drafts[draftKey]
    return card.items.find((item) => item[field])?.[field] || ''
  }

  const onFieldChange = (card: BaitCard, field: EditableField, value: string) => {
    const draftKey = `${card.cardId}:${field}`
    setDrafts((previous) => ({
      ...previous,
      [draftKey]: value,
    }))
  }

  const onFieldBlur = (card: BaitCard, field: EditableField) => {
    const draftKey = `${card.cardId}:${field}`
    const value = drafts[draftKey] ?? getCardFieldValue(card, field)
    const normalized = value.trim() === '' ? null : value.trim()
    const timerKey = `${draftKey}:timer`
    const snapshot = itemsRef.current

    if (pendingTimersRef.current[timerKey]) {
      window.clearTimeout(pendingTimersRef.current[timerKey])
    }

    applyOptimisticPatch(card.itemIds, { [field]: normalized } as Partial<BaitItem>)

    pendingTimersRef.current[timerKey] = window.setTimeout(async () => {
      try {
        const responses = await Promise.all(
          card.itemIds.map((id) =>
            sendPatch(id, {
              [field]: normalized,
            })
          )
        )
        mergeUpdatedRows(responses.map((result) => result.item))
        setToast({ type: 'success', message: `${field === 'posted_url' ? 'Posted URL' : 'Notes'} saved.` })
      } catch (err) {
        setItems(snapshot)
        setToast({
          type: 'error',
          message: err instanceof Error ? err.message : 'Failed to save card updates.',
        })
      }
    }, 350)
  }

  const goToNextSlide = (cardId: string, total: number) => {
    setSlideshowIndexes((previous) => ({
      ...previous,
      [cardId]: ((previous[cardId] || 0) + 1) % total,
    }))
  }

  const goToPreviousSlide = (cardId: string, total: number) => {
    setSlideshowIndexes((previous) => {
      const current = previous[cardId] || 0
      return {
        ...previous,
        [cardId]: (current - 1 + total) % total,
      }
    })
  }

  const formatPostedAt = (iso: string | null): string => {
    if (!iso) return ''
    return new Date(iso).toLocaleString()
  }

  const getSortedSlidesForCard = (card: BaitCard): BaitItem[] => {
    if (!card.grouped) return card.items
    return [...card.items].sort((a, b) =>
      a.s3_key.localeCompare(b.s3_key, undefined, { numeric: true, sensitivity: 'base' })
    )
  }

  const handleSendToIphone = async (card: BaitCard) => {
    if (isSendingByCard[card.cardId]) return

    const sortedSlides = getSortedSlidesForCard(card)
    if (sortedSlides.length === 0 || sortedSlides.some((item) => !item.presignedUrl)) {
      setToast({ type: 'error', message: 'Missing media URL. Refresh and try again.' })
      return
    }

    setIsSendingByCard((previous) => ({ ...previous, [card.cardId]: true }))
    try {
      const response = await fetch('/api/admin/social/send-to-device', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          post_id: `bait-${card.cardId}`,
          trend_name: 'Bait Library',
          album_name: 'HC-Business',
          slides: sortedSlides.map((item, index) => ({
            order: index + 1,
            image_url: item.presignedUrl,
            overlay_text: item.notes || '',
          })),
        }),
      })

      const data = await response.json()
      if (!response.ok) {
        throw new Error(data?.details || data?.error || 'Failed to send to iPhone.')
      }

      const responses = await Promise.all(
        card.itemIds.map((id) =>
          sendPatch(id, {
            posted_tiktok: true,
          })
        )
      )
      mergeUpdatedRows(responses.map((result) => result.item))

      setSendResultByCard((previous) => ({
        ...previous,
        [card.cardId]: {
          imported_count: data.imported_count,
          note_created: data.note_created,
        },
      }))
      setToast({
        type: 'success',
        message: 'Sent to iPhone and marked as posted.',
      })
    } catch (err) {
      setToast({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to send to iPhone.',
      })
    } finally {
      setIsSendingByCard((previous) => ({ ...previous, [card.cardId]: false }))
    }
  }

  return (
    <div className={`min-h-screen bg-[#0b1220] text-[#f3ead9] p-5 md:p-8 ${dmSans.className}`}>
      <div className="max-w-7xl mx-auto space-y-6">
        <header className="space-y-3">
          <Link href="/admin/social" className="inline-flex text-sm text-[#d6b274] hover:text-[#ecc98a] transition-colors">
            ← Back to Social
          </Link>
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <h1 className={`text-4xl text-[#f3ead9] ${cormorant.className}`}>Bait Library</h1>
              <p className="text-[#ceb995] mt-1">
                Manage reusable bait assets and track where each item has been posted.
              </p>
            </div>
            <p className="text-sm md:text-base rounded-xl border border-[#493a1f] bg-[#151f32] px-4 py-2 text-[#e7c98d]">
              {postedSomewhereCount} of {totalCount} posted somewhere
            </p>
          </div>
        </header>

        <section className="rounded-2xl border border-[#2c3b59] bg-[#121b2d] p-4">
          <div className="flex flex-wrap gap-2">
            {FILTERS.map((filter) => (
              <button
                key={filter.key}
                onClick={() => setActiveFilter(filter.key)}
                className={`px-3.5 py-1.5 rounded-full text-sm border transition-colors ${
                  activeFilter === filter.key
                    ? 'bg-[#b58d45] text-[#101828] border-[#d8b372]'
                    : 'border-[#415477] text-[#d7c29b] hover:border-[#d8b372]'
                }`}
              >
                {filter.label}
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
            Loading bait library...
          </div>
        ) : filteredCards.length === 0 ? (
          <div className="rounded-2xl border border-[#2c3b59] bg-[#121b2d] p-10 text-center text-[#ceb995]">
            No items match this filter.
          </div>
        ) : (
          <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {filteredCards.map((card) => {
              const isPostedTikTok = card.items.some((item) => Boolean(item.posted_tiktok))
              const isPostedInstagram = card.items.some((item) => Boolean(item.posted_instagram))
              const isPostedFacebook = card.items.some((item) => Boolean(item.posted_facebook))
              const postedUrlValue = getCardFieldValue(card, 'posted_url')
              const notesValue = getCardFieldValue(card, 'notes')
              const primaryItem = card.items[0]
              const sourceUrl = card.items.find((item) => item.tiktok_url)?.tiktok_url || null
              const currentSlide = slideshowIndexes[card.cardId] || 0
              const postedAt = card.items.find((item) => item.posted_at)?.posted_at || null
              const sendResult = sendResultByCard[card.cardId]
              const isSendingToDevice = Boolean(isSendingByCard[card.cardId])

              return (
                <article key={card.cardId} className="rounded-2xl border border-[#2c3b59] bg-[#121b2d] overflow-hidden">
                  <div className="relative bg-[#0d1524]">
                    {card.grouped ? (
                      <div className="aspect-[9/16] relative">
                        <img
                          src={card.items[currentSlide]?.presignedUrl}
                          alt={`${primaryItem.handle} slideshow ${currentSlide + 1}`}
                          className="w-full h-full object-cover"
                        />
                        <div className="absolute inset-x-0 bottom-0 px-3 py-2 bg-gradient-to-t from-black/70 to-black/0 text-xs text-[#f3ead9]">
                          Slide {currentSlide + 1} of {card.items.length}
                        </div>
                        <button
                          onClick={() => goToPreviousSlide(card.cardId, card.items.length)}
                          className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/45 text-white px-2 py-1 hover:bg-black/65"
                          type="button"
                        >
                          ‹
                        </button>
                        <button
                          onClick={() => goToNextSlide(card.cardId, card.items.length)}
                          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/45 text-white px-2 py-1 hover:bg-black/65"
                          type="button"
                        >
                          ›
                        </button>
                      </div>
                    ) : primaryItem.media_type === 'video' ? (
                      <video
                        className="aspect-[9/16] w-full bg-black"
                        src={primaryItem.presignedUrl}
                        controls
                        preload="metadata"
                        playsInline
                      />
                    ) : (
                      <img
                        src={primaryItem.presignedUrl}
                        alt={primaryItem.s3_key}
                        className="aspect-[9/16] w-full object-cover"
                      />
                    )}
                  </div>

                  <div className="p-4 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm text-[#f3e7cc]">@{primaryItem.handle}</span>
                      {sourceUrl ? (
                        <a
                          href={sourceUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs text-[#e7c98d] underline underline-offset-4 hover:text-[#f4d79d]"
                        >
                          source
                        </a>
                      ) : (
                        <span className="text-xs text-[#907f60]">source unavailable</span>
                      )}
                    </div>
                    {postedAt ? (
                      <p className="text-xs text-[#9dd4b5]">Posted on {formatPostedAt(postedAt)}</p>
                    ) : (
                      <p className="text-xs text-[#907f60]">Not marked posted yet</p>
                    )}

                    <button
                      onClick={() => void handleSendToIphone(card)}
                      disabled={isSendingToDevice}
                      className="w-full rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                      type="button"
                    >
                      {isSendingToDevice ? 'Sending to iPhone...' : 'Send to iPhone'}
                    </button>
                    {sendResult ? (
                      <div className="rounded-lg border border-[#3f4f6c] bg-[#0f1728] px-3 py-2 text-xs text-[#d7c29b] space-y-1">
                        <p>
                          Imported: <span className="text-[#f3ead9]">{sendResult.imported_count ?? 'unknown'}</span>
                        </p>
                        <p>
                          Note created:{' '}
                          <span className="text-[#f3ead9]">
                            {sendResult.note_created === undefined
                              ? 'unknown'
                              : sendResult.note_created
                                ? 'yes'
                                : 'no'}
                          </span>
                        </p>
                      </div>
                    ) : null}

                    <div className="flex gap-2">
                      <button
                        onClick={() => void handleToggle(card, 'posted_tiktok')}
                        className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${
                          isPostedTikTok
                            ? 'bg-[#c8a35f] text-[#111827] border-[#e6c486]'
                            : 'border-[#415477] text-[#d7c29b] hover:border-[#d8b372]'
                        }`}
                        type="button"
                      >
                        TT
                      </button>
                      <button
                        onClick={() => void handleToggle(card, 'posted_instagram')}
                        className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${
                          isPostedInstagram
                            ? 'bg-[#c8a35f] text-[#111827] border-[#e6c486]'
                            : 'border-[#415477] text-[#d7c29b] hover:border-[#d8b372]'
                        }`}
                        type="button"
                      >
                        IG
                      </button>
                      <button
                        onClick={() => void handleToggle(card, 'posted_facebook')}
                        className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${
                          isPostedFacebook
                            ? 'bg-[#c8a35f] text-[#111827] border-[#e6c486]'
                            : 'border-[#415477] text-[#d7c29b] hover:border-[#d8b372]'
                        }`}
                        type="button"
                      >
                        FB
                      </button>
                    </div>

                    <div className="space-y-2">
                      <label className="block text-xs text-[#ccb78f]">
                        posted_url
                        <input
                          value={postedUrlValue}
                          onChange={(event) => onFieldChange(card, 'posted_url', event.target.value)}
                          onBlur={() => onFieldBlur(card, 'posted_url')}
                          placeholder="https://..."
                          className="mt-1 w-full rounded-lg border border-[#364767] bg-[#0f1728] px-3 py-2 text-sm text-[#f3ead9] focus:outline-none focus:ring-2 focus:ring-[#b58d45]"
                        />
                      </label>
                      <label className="block text-xs text-[#ccb78f]">
                        notes
                        <input
                          value={notesValue}
                          onChange={(event) => onFieldChange(card, 'notes', event.target.value)}
                          onBlur={() => onFieldBlur(card, 'notes')}
                          placeholder="optional notes"
                          className="mt-1 w-full rounded-lg border border-[#364767] bg-[#0f1728] px-3 py-2 text-sm text-[#f3ead9] focus:outline-none focus:ring-2 focus:ring-[#b58d45]"
                        />
                      </label>
                    </div>
                  </div>
                </article>
              )
            })}
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
