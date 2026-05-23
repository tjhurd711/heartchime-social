'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Cormorant_Garamond, DM_Sans } from 'next/font/google'

const cormorant = Cormorant_Garamond({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
})

const dmSans = DM_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '700'],
})

type BrowseItem = {
  key: string
  presignedUrl: string
}

type BankItem = {
  id: string
  source_bucket: string
  source_key: string
  bank_url: string
  created_at: string
}

export default function ReferencePhotoBankPage() {
  const [prefixInput, setPrefixInput] = useState('uploads/')
  const [activePrefix, setActivePrefix] = useState('uploads/')
  const [items, setItems] = useState<BrowseItem[]>([])
  const [nextToken, setNextToken] = useState<string | null>(null)
  const [loadingBrowse, setLoadingBrowse] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set())
  const [bankItems, setBankItems] = useState<BankItem[]>([])
  const [loadingBank, setLoadingBank] = useState(false)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)

  useEffect(() => {
    void browseByPrefix('uploads/')
    void fetchBankItems()
  }, [])

  useEffect(() => {
    if (!toast) return
    const timeout = setTimeout(() => setToast(null), 3000)
    return () => clearTimeout(timeout)
  }, [toast])

  const selectedCount = selectedKeys.size

  const breadcrumbs = useMemo(() => {
    const clean = activePrefix.replace(/^\/+/, '').replace(/\/+$/, '')
    if (!clean) return []
    const segments = clean.split('/')
    return segments.map((segment, index) => ({
      label: segment,
      value: `${segments.slice(0, index + 1).join('/')}/`,
    }))
  }, [activePrefix])

  const browseByPrefix = async (prefix: string) => {
    setLoadingBrowse(true)
    setError(null)
    try {
      const params = new URLSearchParams({ prefix })
      const response = await fetch(`/api/admin/social/reference-browse?${params.toString()}`)
      const data = await response.json()
      if (!response.ok) {
        throw new Error(data?.error || data?.details || 'Failed to browse reference photos')
      }

      setActivePrefix(prefix)
      setPrefixInput(prefix)
      setItems(data.items || [])
      setNextToken(data.nextToken || null)
      setSelectedKeys(new Set())
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      setError(message)
      setToast({ message, type: 'error' })
    } finally {
      setLoadingBrowse(false)
    }
  }

  const loadMore = async () => {
    if (!nextToken || loadingMore) return
    setLoadingMore(true)
    try {
      const params = new URLSearchParams({
        prefix: activePrefix,
        token: nextToken,
      })
      const response = await fetch(`/api/admin/social/reference-browse?${params.toString()}`)
      const data = await response.json()
      if (!response.ok) {
        throw new Error(data?.error || data?.details || 'Failed to load more reference photos')
      }

      setItems(prev => [...prev, ...(data.items || [])])
      setNextToken(data.nextToken || null)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      setToast({ message, type: 'error' })
    } finally {
      setLoadingMore(false)
    }
  }

  const fetchBankItems = async () => {
    setLoadingBank(true)
    try {
      const response = await fetch('/api/admin/social/reference-bank')
      const data = await response.json()
      if (!response.ok) {
        throw new Error(data?.error || data?.details || 'Failed to load saved bank items')
      }
      setBankItems(data.items || [])
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      setToast({ message, type: 'error' })
    } finally {
      setLoadingBank(false)
    }
  }

  const toggleSelected = (key: string) => {
    setSelectedKeys(prev => {
      const next = new Set(prev)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
  }

  const handleSaveSelected = async () => {
    if (selectedCount === 0 || saving) return

    setSaving(true)
    try {
      const response = await fetch('/api/admin/social/reference-bank', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: Array.from(selectedKeys).map(key => ({ key })),
        }),
      })
      const data = await response.json()
      if (!response.ok) {
        throw new Error(data?.error || data?.details || 'Failed to save selected photos')
      }

      setToast({
        message: `Saved ${data.saved} and skipped ${data.skipped}`,
        type: 'success',
      })
      setSelectedKeys(new Set())
      await fetchBankItems()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      setToast({ message, type: 'error' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className={`min-h-screen bg-[#0e1626] text-[#f2e9da] p-5 md:p-8 ${dmSans.className}`}>
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <Link
              href="/admin/social"
              className="inline-flex text-sm text-[#d9be8c] hover:text-[#f2d29b] transition-colors"
            >
              ← Back to Social
            </Link>
            <h1 className={`text-4xl mt-2 text-[#f2e9da] ${cormorant.className}`}>
              Reference Photo Bank
            </h1>
            <p className="text-[#cab894] mt-1">
              Browse `order-by-age-uploads`, pick photos, and store copies in `heartbeat-photos-prod`.
            </p>
          </div>
          <button
            onClick={handleSaveSelected}
            disabled={selectedCount === 0 || saving}
            className="px-5 py-3 rounded-xl bg-[#b58d45] text-[#111827] font-semibold disabled:opacity-50 disabled:cursor-not-allowed hover:bg-[#c79b4d] transition-colors"
          >
            {saving ? 'Saving...' : `Save ${selectedCount} to bank`}
          </button>
        </div>

        <div className="rounded-2xl border border-[#3f4f6c] bg-[#131f35] p-4 md:p-5">
          <div className="flex flex-col gap-3 md:flex-row md:items-center">
            <input
              value={prefixInput}
              onChange={event => setPrefixInput(event.target.value)}
              placeholder="uploads/"
              className="flex-1 px-3 py-2 rounded-lg bg-[#0e1626] border border-[#33425b] text-[#f2e9da] focus:outline-none focus:ring-2 focus:ring-[#b58d45]"
            />
            <button
              onClick={() => void browseByPrefix(prefixInput.trim() || 'uploads/')}
              disabled={loadingBrowse}
              className="px-4 py-2 rounded-lg border border-[#b58d45] text-[#f3d7a3] hover:bg-[#b58d45]/10 transition-colors disabled:opacity-50"
            >
              {loadingBrowse ? 'Browsing...' : 'Browse Prefix'}
            </button>
          </div>

          {breadcrumbs.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-[#cab894]">
              {breadcrumbs.map((crumb, index) => (
                <span key={crumb.value} className="flex items-center gap-2">
                  <button
                    onClick={() => void browseByPrefix(crumb.value)}
                    className="hover:text-[#f3d7a3] underline underline-offset-4"
                  >
                    {crumb.label}
                  </button>
                  {index < breadcrumbs.length - 1 ? <span>/</span> : null}
                </span>
              ))}
            </div>
          )}
        </div>

        {error && (
          <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-red-300">
            {error}
          </div>
        )}

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className={`text-2xl text-[#f2e9da] ${cormorant.className}`}>Source Browser</h2>
            <span className="text-sm text-[#cab894]">{items.length} loaded</span>
          </div>

          {loadingBrowse ? (
            <div className="rounded-2xl border border-[#3f4f6c] bg-[#131f35] p-10 text-center text-[#cab894]">
              Loading source images...
            </div>
          ) : items.length === 0 ? (
            <div className="rounded-2xl border border-[#3f4f6c] bg-[#131f35] p-10 text-center text-[#cab894]">
              No images found for this prefix.
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
              {items.map(item => {
                const isSelected = selectedKeys.has(item.key)
                return (
                  <button
                    key={item.key}
                    onClick={() => toggleSelected(item.key)}
                    className={`relative group rounded-xl overflow-hidden border transition-all ${
                      isSelected
                        ? 'border-[#d8b372] ring-2 ring-[#d8b372]/60'
                        : 'border-[#3f4f6c] hover:border-[#d8b372]/70'
                    }`}
                    title={item.key}
                  >
                    <img
                      src={item.presignedUrl}
                      alt={item.key}
                      loading="lazy"
                      className="aspect-square w-full object-cover bg-[#0d1524]"
                    />
                    <div className="absolute inset-x-0 bottom-0 px-2 py-1.5 bg-gradient-to-t from-black/80 to-black/0 text-left">
                      <p className="text-[11px] text-[#f2e9da] truncate">{item.key.split('/').pop()}</p>
                    </div>
                    {isSelected && (
                      <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-[#d8b372] text-[#111827] text-sm font-bold flex items-center justify-center">
                        ✓
                      </div>
                    )}
                  </button>
                )
              })}
            </div>
          )}

          {nextToken && (
            <div className="flex justify-center pt-2">
              <button
                onClick={loadMore}
                disabled={loadingMore}
                className="px-5 py-2.5 rounded-lg border border-[#b58d45] text-[#f3d7a3] hover:bg-[#b58d45]/10 disabled:opacity-50"
              >
                {loadingMore ? 'Loading more...' : 'Load more'}
              </button>
            </div>
          )}
        </section>

        <section className="space-y-3 pt-3">
          <div className="flex items-center justify-between">
            <h2 className={`text-2xl text-[#f2e9da] ${cormorant.className}`}>Saved Bank Photos</h2>
            <span className="text-sm text-[#cab894]">{bankItems.length} total</span>
          </div>

          {loadingBank ? (
            <div className="rounded-2xl border border-[#3f4f6c] bg-[#131f35] p-10 text-center text-[#cab894]">
              Loading saved bank photos...
            </div>
          ) : bankItems.length === 0 ? (
            <div className="rounded-2xl border border-[#3f4f6c] bg-[#131f35] p-10 text-center text-[#cab894]">
              No saved bank photos yet.
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
              {bankItems.map(item => (
                <a
                  key={item.id}
                  href={item.bank_url}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-xl overflow-hidden border border-[#3f4f6c] hover:border-[#d8b372]/70 transition-colors"
                  title={item.source_key}
                >
                  <img
                    src={item.bank_url}
                    alt={item.source_key}
                    loading="lazy"
                    className="aspect-square w-full object-cover bg-[#0d1524]"
                  />
                  <div className="px-2 py-1.5 bg-[#111a2c]">
                    <p className="text-[11px] text-[#d8c4a0] truncate">{item.source_key.split('/').pop()}</p>
                  </div>
                </a>
              ))}
            </div>
          )}
        </section>
      </div>

      {toast && (
        <div
          className={`fixed top-6 right-6 z-50 px-4 py-3 rounded-lg shadow-xl ${
            toast.type === 'success'
              ? 'bg-emerald-600 text-white'
              : 'bg-red-600 text-white'
          }`}
        >
          {toast.message}
        </div>
      )}
    </div>
  )
}
