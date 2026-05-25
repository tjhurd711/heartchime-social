'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Cormorant_Garamond, DM_Sans } from 'next/font/google'

interface S3ReferenceBrowseItem {
  key: string
  presignedUrl: string
}

interface EnginePanelResult {
  ok: boolean
  imageUrl: string | null
  durationMs: number | null
  error: string | null
}

interface EditRunReport {
  inputImageUrl: string | null
  geminiInputImageUrl: string | null
  gptImage2InputImageUrl: string | null
  gptImage2Endpoint: string | null
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
const REFERENCE_PAGE_SIZE = 24

const EMPTY_PANEL_RESULT: EnginePanelResult = {
  ok: false,
  imageUrl: null,
  durationMs: null,
  error: null,
}

function formatDuration(durationMs: number | null): string {
  if (durationMs === null || !Number.isFinite(durationMs)) return '—'
  return `${(durationMs / 1000).toFixed(2)}s`
}

export default function EngineTestPage() {
  const [referencePickKey, setReferencePickKey] = useState('')
  const [selectedReferencePreviewUrl, setSelectedReferencePreviewUrl] = useState<string | null>(null)
  const [showReferencePicker, setShowReferencePicker] = useState(false)
  const [referencePrefixInput, setReferencePrefixInput] = useState(LIVE_REFERENCE_DEFAULT_PREFIX)
  const [referenceActivePrefix, setReferenceActivePrefix] = useState(LIVE_REFERENCE_DEFAULT_PREFIX)
  const [referenceItems, setReferenceItems] = useState<S3ReferenceBrowseItem[]>([])
  const [referencePage, setReferencePage] = useState(1)
  const [referencePageInput, setReferencePageInput] = useState('1')
  const [referenceHasNextPage, setReferenceHasNextPage] = useState(false)
  const [referenceLoading, setReferenceLoading] = useState(false)
  const [referencePickerError, setReferencePickerError] = useState<string | null>(null)

  const [prompt, setPrompt] = useState('')
  const [editPrompt, setEditPrompt] = useState('')
  const [loadingDefaultPrompt, setLoadingDefaultPrompt] = useState(true)
  const [generatingBase, setGeneratingBase] = useState(false)
  const [runningEdit, setRunningEdit] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [baseResult, setBaseResult] = useState<EnginePanelResult>(EMPTY_PANEL_RESULT)
  const [geminiResult, setGeminiResult] = useState<EnginePanelResult>(EMPTY_PANEL_RESULT)
  const [gptImage2Result, setGptImage2Result] = useState<EnginePanelResult>(EMPTY_PANEL_RESULT)
  const [editRunReport, setEditRunReport] = useState<EditRunReport>({
    inputImageUrl: null,
    geminiInputImageUrl: null,
    gptImage2InputImageUrl: null,
    gptImage2Endpoint: null,
  })

  useEffect(() => {
    const loadDefaultPrompt = async () => {
      setLoadingDefaultPrompt(true)
      try {
        const response = await fetch('/api/admin/social/engine-test')
        const data = await response.json()
        if (!response.ok) {
          throw new Error(data?.error || data?.details || 'Failed to load default prompt')
        }
        setPrompt(typeof data?.defaultPrompt === 'string' ? data.defaultPrompt : '')
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load default prompt')
      } finally {
        setLoadingDefaultPrompt(false)
      }
    }

    void loadDefaultPrompt()
  }, [])

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
      const resolvedPage = typeof data.page === 'number' && Number.isFinite(data.page) && data.page > 0
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
    setSelectedReferencePreviewUrl(item.presignedUrl)
    setShowReferencePicker(false)
  }

  const canGenerateBase = useMemo(() => {
    return !generatingBase && referencePickKey.trim().length > 0 && prompt.trim().length > 0
  }, [generatingBase, referencePickKey, prompt])

  const canRunEdit = useMemo(() => {
    return !runningEdit && Boolean(baseResult.imageUrl) && editPrompt.trim().length > 0
  }, [runningEdit, baseResult.imageUrl, editPrompt])

  const handleGenerateBase = async () => {
    setError(null)
    if (!referencePickKey.trim()) {
      setError('Please choose a reference photo from S3.')
      return
    }
    if (!prompt.trim()) {
      setError('Prompt cannot be empty.')
      return
    }

    setGeneratingBase(true)
    setBaseResult(EMPTY_PANEL_RESULT)
    setGeminiResult(EMPTY_PANEL_RESULT)
    setGptImage2Result(EMPTY_PANEL_RESULT)
    setEditRunReport({
      inputImageUrl: null,
      geminiInputImageUrl: null,
      gptImage2InputImageUrl: null,
      gptImage2Endpoint: null,
    })

    try {
      const response = await fetch('/api/admin/social/engine-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'generateBase',
          referenceKey: referencePickKey,
          prompt,
        }),
      })
      const data = await response.json()
      if (!response.ok) {
        throw new Error(data?.error || data?.details || 'Failed to generate base image')
      }

      setBaseResult({
        ok: Boolean(data?.base?.ok),
        imageUrl: typeof data?.base?.imageUrl === 'string' ? data.base.imageUrl : null,
        durationMs: typeof data?.base?.durationMs === 'number' ? data.base.durationMs : null,
        error: typeof data?.base?.error === 'string' ? data.base.error : null,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate base image')
    } finally {
      setGeneratingBase(false)
    }
  }

  const handleRunEditBoth = async () => {
    setError(null)
    if (!baseResult.imageUrl) {
      setError('Generate the Step 1 base image first.')
      return
    }
    if (!editPrompt.trim()) {
      setError('Edit instruction cannot be empty.')
      return
    }

    setRunningEdit(true)
    setGeminiResult(EMPTY_PANEL_RESULT)
    setGptImage2Result(EMPTY_PANEL_RESULT)
    setEditRunReport({
      inputImageUrl: null,
      geminiInputImageUrl: null,
      gptImage2InputImageUrl: null,
      gptImage2Endpoint: null,
    })

    try {
      const response = await fetch('/api/admin/social/engine-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'runEditComparison',
          baseImageUrl: baseResult.imageUrl,
          editPrompt,
        }),
      })
      const data = await response.json()
      if (!response.ok) {
        throw new Error(data?.error || data?.details || 'Failed to run edit comparison')
      }

      setGeminiResult({
        ok: Boolean(data?.gemini?.ok),
        imageUrl: typeof data?.gemini?.imageUrl === 'string' ? data.gemini.imageUrl : null,
        durationMs: typeof data?.gemini?.durationMs === 'number' ? data.gemini.durationMs : null,
        error: typeof data?.gemini?.error === 'string' ? data.gemini.error : null,
      })
      setGptImage2Result({
        ok: Boolean(data?.gptImage2?.ok),
        imageUrl: typeof data?.gptImage2?.imageUrl === 'string' ? data.gptImage2.imageUrl : null,
        durationMs: typeof data?.gptImage2?.durationMs === 'number' ? data.gptImage2.durationMs : null,
        error: typeof data?.gptImage2?.error === 'string' ? data.gptImage2.error : null,
      })
      setEditRunReport({
        inputImageUrl: typeof data?.inputImageUrl === 'string' ? data.inputImageUrl : null,
        geminiInputImageUrl: typeof data?.geminiInputImageUrl === 'string' ? data.geminiInputImageUrl : null,
        gptImage2InputImageUrl: typeof data?.gptImage2InputImageUrl === 'string' ? data.gptImage2InputImageUrl : null,
        gptImage2Endpoint: typeof data?.gptImage2Endpoint === 'string' ? data.gptImage2Endpoint : null,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to run edit comparison')
    } finally {
      setRunningEdit(false)
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
        <h1 className={`${cormorant.className} text-4xl font-semibold text-[#f7f1df]`}>Engine Test</h1>
        <p className="text-[#d7c9a6] mt-2 max-w-3xl">
          Step 1 generates a Gemini-only base image from an S3 style reference. Step 2 edits that base image with both engines.
        </p>
      </div>

      <section className="rounded-2xl border border-[#7a6738]/60 bg-[#111a2f] p-5 space-y-4">
        <h2 className={`${cormorant.className} text-2xl text-[#f1d386]`}>Step 1 - Base image (Gemini only)</h2>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => {
              setShowReferencePicker(true)
              void browseReferencePrefix(referenceActivePrefix || LIVE_REFERENCE_DEFAULT_PREFIX, 1)
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

        <div>
          <label className="text-sm text-[#d7c9a6] block mb-1">Base style prompt</label>
          <textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            rows={6}
            disabled={loadingDefaultPrompt}
            className="w-full rounded-lg border border-[#3d4a68] bg-[#0f1729] px-3 py-2 text-[#f7f1df] disabled:opacity-70"
          />
          {loadingDefaultPrompt && (
            <p className="text-xs text-[#b9aa87] mt-2">Loading creation slide-1 style prompt...</p>
          )}
        </div>

        <button
          type="button"
          onClick={() => void handleGenerateBase()}
          disabled={!canGenerateBase}
          className={`rounded-xl px-5 py-2.5 font-semibold transition ${
            canGenerateBase
              ? 'bg-gradient-to-r from-[#d4af37] to-[#f1d386] text-[#1b2237] hover:from-[#e2be4b] hover:to-[#f7df9f]'
              : 'bg-[#394560] text-[#a8b2cc] cursor-not-allowed'
          }`}
        >
          {generatingBase ? 'Generating base image...' : 'Generate Base (Gemini)'}
        </button>

        <div className="rounded-xl border border-[#3d4a68] bg-[#0f1729] p-3 space-y-2">
          <div className="flex items-center justify-between">
            <h3 className={`${cormorant.className} text-xl text-[#f1d386]`}>Base image</h3>
            <span className="text-xs text-[#b9aa87]">Time: {formatDuration(baseResult.durationMs)}</span>
          </div>
          {baseResult.error && <p className="text-sm text-red-300">{baseResult.error}</p>}
          {baseResult.imageUrl ? (
            <img
              src={baseResult.imageUrl}
              alt="Step 1 Gemini base image"
              className="w-full max-h-[55vh] object-contain rounded-lg border border-[#3d4a68] bg-black"
            />
          ) : (
            <div className="h-52 rounded-lg border border-dashed border-[#3d4a68] flex items-center justify-center text-sm text-[#b9aa87]">
              {generatingBase ? 'Generating Step 1 base image...' : 'No base image generated yet.'}
            </div>
          )}
        </div>
      </section>

      {error && <p className="text-red-300 text-sm">{error}</p>}

      <section className="rounded-2xl border border-[#7a6738]/60 bg-[#111a2f] p-5 space-y-4">
        <h2 className={`${cormorant.className} text-2xl text-[#f1d386]`}>Step 2 - Edit comparison (both engines)</h2>
        <div>
          <label className="text-sm text-[#d7c9a6] block mb-1">Edit instruction</label>
          <textarea
            value={editPrompt}
            onChange={(event) => setEditPrompt(event.target.value)}
            rows={4}
            placeholder="Recreate this image so it's just the woman, wearing something completely different, looking sadder, with an urn on the shelf behind her."
            className="w-full rounded-lg border border-[#3d4a68] bg-[#0f1729] px-3 py-2 text-[#f7f1df]"
          />
        </div>
        <button
          type="button"
          onClick={() => void handleRunEditBoth()}
          disabled={!canRunEdit}
          className={`rounded-xl px-5 py-2.5 font-semibold transition ${
            canRunEdit
              ? 'bg-gradient-to-r from-[#d4af37] to-[#f1d386] text-[#1b2237] hover:from-[#e2be4b] hover:to-[#f7df9f]'
              : 'bg-[#394560] text-[#a8b2cc] cursor-not-allowed'
          }`}
        >
          {runningEdit ? 'Running edits...' : 'Run Edit on Both'}
        </button>
        <div className="text-xs text-[#b9aa87] break-all space-y-1">
          <p>Input image for Step 2: {editRunReport.inputImageUrl || 'Pending'}</p>
          <p>Gemini input image: {editRunReport.geminiInputImageUrl || 'Pending'}</p>
          <p>gpt-image-2 input image: {editRunReport.gptImage2InputImageUrl || 'Pending'}</p>
          <p>gpt-image-2 endpoint: {editRunReport.gptImage2Endpoint || 'Pending'}</p>
        </div>
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-[#3d4a68] bg-[#111a2f] p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className={`${cormorant.className} text-2xl text-[#f1d386]`}>Gemini edit</h3>
            <span className="text-xs text-[#b9aa87]">Time: {formatDuration(geminiResult.durationMs)}</span>
          </div>

          {geminiResult.error && (
            <p className="text-sm text-red-300">{geminiResult.error}</p>
          )}

          {geminiResult.imageUrl ? (
            <img
              src={geminiResult.imageUrl}
              alt="Gemini edited result"
              className="w-full max-h-[70vh] object-contain rounded-lg border border-[#3d4a68] bg-black"
            />
          ) : (
            <div className="h-64 rounded-lg border border-dashed border-[#3d4a68] flex items-center justify-center text-sm text-[#b9aa87]">
              {runningEdit ? 'Running Gemini edit...' : 'No Gemini edit result yet.'}
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-[#3d4a68] bg-[#111a2f] p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className={`${cormorant.className} text-2xl text-[#f1d386]`}>gpt-image-2 edit</h3>
            <span className="text-xs text-[#b9aa87]">Time: {formatDuration(gptImage2Result.durationMs)}</span>
          </div>

          {gptImage2Result.error && (
            <p className="text-sm text-red-300">{gptImage2Result.error}</p>
          )}

          {gptImage2Result.imageUrl ? (
            <img
              src={gptImage2Result.imageUrl}
              alt="gpt-image-2 edited result"
              className="w-full max-h-[70vh] object-contain rounded-lg border border-[#3d4a68] bg-black"
            />
          ) : (
            <div className="h-64 rounded-lg border border-dashed border-[#3d4a68] flex items-center justify-center text-sm text-[#b9aa87]">
              {runningEdit ? 'Running gpt-image-2 edit...' : 'No gpt-image-2 edit result yet.'}
            </div>
          )}
        </div>
      </section>

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
                onClick={() => void browseReferencePrefix(referencePrefixInput.trim() || LIVE_REFERENCE_DEFAULT_PREFIX, 1)}
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
          </div>
        </div>
      )}
    </div>
  )
}
