'use client'
/* eslint-disable @next/next/no-img-element */

import { useState } from 'react'
import { Cormorant_Garamond, DM_Sans } from 'next/font/google'

const headingFont = Cormorant_Garamond({
  subsets: ['latin'],
  weight: ['600', '700'],
})

const bodyFont = DM_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '700'],
})

type ArtifactFormat =
  | 'book_page'
  | 'highlighted_book'
  | 'tweet'
  | 'typed_note'
  | 'handwritten'
  | 'book_page_photo'

type OgTheme = 'classic' | 'elegant' | 'moody' | 'vintage'
type OgFont = 'eb_garamond' | 'cormorant' | 'courier_prime' | 'system_sans'
type OverlayDesign =
  | 'none'
  | 'windchime'
  | 'olivebranch'
  | 'coffee'
  | 'moonphases'
  | 'candle'
  | 'whitecandle'
  | 'goldcandle'
  | 'blackcandle'
  | 'blackolive'
  | 'whiteolive'
  | 'goldenolive'
  | 'blackmoons'
  | 'whitemoons'
  | 'goldmoons'
  | 'goldchimes'
  | 'whitewindchimes'
  | 'blackwindchimes'
  | 'goldcoffee'
  | 'whitecoffee'
  | 'blackcoffee'

interface GenerateQuotesResponse {
  quotes: string[]
}

interface GenerateMemoryThoughtResponse {
  thought?: string
  provider?: 'claude' | 'chatgpt'
  words?: number
  error?: string
  details?: string
}

interface RenderCardResponse {
  key: string
  url: string
}

interface AttributionResponse {
  attribution: string
}

interface SendToDeviceResult {
  imported_count?: number
  note_created?: boolean
}

interface QuoteCardDraft {
  id: string
  quote: string
  format: ArtifactFormat
  ogTheme: OgTheme
  ogFont: OgFont
  floralAccent: boolean
  overlayDesign: OverlayDesign
  attribution: string
  highlightText: string
  styleDetails: string
  status: 'idle' | 'rendering' | 'success' | 'error'
  key?: string
  url?: string
  error?: string
}

const MAX_QUOTES = 10
const DEFAULT_COUNT = 5

export default function QuoteCardsPage() {
  const [jobId] = useState(() => crypto.randomUUID())
  const [quoteCount, setQuoteCount] = useState(DEFAULT_COUNT)
  const [cards, setCards] = useState<QuoteCardDraft[]>([])
  const [slideshowKeys, setSlideshowKeys] = useState<string[]>([])
  const [isGeneratingQuotes, setIsGeneratingQuotes] = useState(false)
  const [isGeneratingMemoryThought, setIsGeneratingMemoryThought] = useState(false)
  const [isGeneratingAttributionById, setIsGeneratingAttributionById] = useState<Record<string, boolean>>({})
  const [isRenderingAll, setIsRenderingAll] = useState(false)
  const [isSendingToDevice, setIsSendingToDevice] = useState(false)
  const [sendToDeviceResult, setSendToDeviceResult] = useState<SendToDeviceResult | null>(null)
  const [deviceNoteText, setDeviceNoteText] = useState('')
  const [error, setError] = useState<string | null>(null)

  function updateCard(id: string, patch: Partial<QuoteCardDraft>) {
    setCards((prev) => prev.map((card) => (card.id === id ? { ...card, ...patch } : card)))
  }

  function addQuote() {
    setCards((prev) => {
      if (prev.length >= MAX_QUOTES) return prev
      return [
        ...prev,
        {
          id: crypto.randomUUID(),
          quote: '',
          format: 'book_page',
          ogTheme: 'classic',
          ogFont: 'eb_garamond',
          floralAccent: false,
          overlayDesign: 'none',
          attribution: '',
          highlightText: '',
          styleDetails: '',
          status: 'idle',
        },
      ]
    })
  }

  function createCardDraft(quote: string): QuoteCardDraft {
    return {
      id: crypto.randomUUID(),
      quote,
      format: 'book_page',
      ogTheme: 'classic',
      ogFont: 'eb_garamond',
      floralAccent: false,
      overlayDesign: 'none',
      attribution: '',
      highlightText: '',
      styleDetails: '',
      status: 'idle',
    }
  }

  function removeCard(id: string) {
    setCards((prev) => prev.filter((card) => card.id !== id))
  }

  function pushSlideshowKey(key: string) {
    setSlideshowKeys((prev) => [...prev, key])
  }

  async function handleGenerateQuotes() {
    setIsGeneratingQuotes(true)
    setError(null)
    try {
      const response = await fetch('/api/quotes/generate-text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ count: quoteCount }),
      })
      const data = (await response.json()) as GenerateQuotesResponse & { error?: string; details?: string }
      if (!response.ok) {
        throw new Error(data.details || data.error || 'Failed to generate quotes')
      }
      setCards(
        (data.quotes || []).slice(0, MAX_QUOTES).map((quote) => createCardDraft(quote))
      )
    } catch (generationError) {
      setError(generationError instanceof Error ? generationError.message : 'Failed to generate quotes')
    } finally {
      setIsGeneratingQuotes(false)
    }
  }

  async function handleGenerateMemoryThought() {
    if (cards.length >= MAX_QUOTES) {
      setError(`Maximum of ${MAX_QUOTES} cards reached. Remove one before generating another.`)
      return
    }

    setIsGeneratingMemoryThought(true)
    setError(null)

    try {
      const response = await fetch('/api/quotes/generate-memory-thought', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: 'auto' }),
      })

      const data = (await response.json()) as GenerateMemoryThoughtResponse
      if (!response.ok) {
        throw new Error(data.details || data.error || 'Failed to generate memory thought')
      }

      const thought = data.thought?.trim()
      if (!thought) {
        throw new Error('Memory thought generator did not return text.')
      }

      setCards((prev) => [createCardDraft(thought), ...prev])
    } catch (generationError) {
      setError(
        generationError instanceof Error
          ? generationError.message
          : 'Failed to generate memory thought'
      )
    } finally {
      setIsGeneratingMemoryThought(false)
    }
  }

  async function handleMakeAttribution(cardId: string) {
    const targetCard = cards.find((card) => card.id === cardId)
    if (!targetCard) return
    if (
      targetCard.format !== 'book_page' &&
      targetCard.format !== 'highlighted_book' &&
      targetCard.format !== 'tweet' &&
      targetCard.format !== 'book_page_photo'
    ) {
      return
    }
    if (!targetCard.quote.trim()) {
      setError('Add quote text before generating attribution.')
      return
    }

    setIsGeneratingAttributionById((prev) => ({ ...prev, [cardId]: true }))
    setError(null)

    try {
      const response = await fetch('/api/quotes/generate-attribution', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quote: targetCard.quote,
          format: targetCard.format,
        }),
      })
      const data = (await response.json()) as AttributionResponse & { error?: string; details?: string }
      if (!response.ok) {
        throw new Error(data.details || data.error || 'Failed to generate attribution')
      }
      updateCard(cardId, { attribution: data.attribution || '' })
    } catch (attributionError) {
      setError(attributionError instanceof Error ? attributionError.message : 'Failed to generate attribution')
    } finally {
      setIsGeneratingAttributionById((prev) => ({ ...prev, [cardId]: false }))
    }
  }

  async function handleRenderCard(card: QuoteCardDraft) {
    if (!card.quote.trim()) {
      updateCard(card.id, { status: 'error', error: 'Quote text is required.' })
      return
    }
    setError(null)
    updateCard(card.id, { status: 'rendering', error: undefined })
    try {
      const response = await fetch('/api/quotes/render-card', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          format: card.format,
          ogTheme:
            card.format === 'book_page' ||
            card.format === 'highlighted_book' ||
            card.format === 'tweet' ||
            card.format === 'typed_note'
              ? card.ogTheme
              : undefined,
          ogFont:
            card.format === 'book_page' ||
            card.format === 'highlighted_book' ||
            card.format === 'tweet' ||
            card.format === 'typed_note'
              ? card.ogFont
              : undefined,
          floralAccent:
            card.format === 'book_page' || card.format === 'highlighted_book'
              ? card.floralAccent
              : undefined,
          overlayDesign:
            card.format === 'book_page' || card.format === 'highlighted_book'
              ? card.overlayDesign
              : undefined,
          quote: card.quote,
          attribution: card.attribution || undefined,
          highlightText: card.format === 'highlighted_book' ? (card.highlightText || undefined) : undefined,
          styleDetails:
            card.format === 'handwritten' || card.format === 'book_page_photo'
              ? (card.styleDetails || undefined)
              : undefined,
          jobId,
        }),
      })
      const data = (await response.json()) as RenderCardResponse & { error?: string; details?: string }
      if (!response.ok) {
        throw new Error(data.details || data.error || 'Failed to render card')
      }
      updateCard(card.id, {
        status: 'success',
        key: data.key,
        url: data.url,
      })
    } catch (renderError) {
      updateCard(card.id, {
        status: 'error',
        error: renderError instanceof Error ? renderError.message : 'Failed to render card',
      })
    }
  }

  async function handleRenderAllCards() {
    const renderableCards = cards.filter((card) => card.quote.trim().length > 0)
    if (renderableCards.length === 0) {
      setError('Add quote text to at least one card before rendering.')
      return
    }
    setError(null)
    setIsRenderingAll(true)
    for (const card of renderableCards) {
      await handleRenderCard(card)
    }
    setIsRenderingAll(false)
  }

  async function handleSendToDevice() {
    const renderedCards = cards.filter((card) => card.status === 'success' && card.url)
    if (renderedCards.length === 0) {
      setError('Render at least one quote card before sending to iPhone.')
      return
    }

    setError(null)
    setIsSendingToDevice(true)
    setSendToDeviceResult(null)

    try {
      const payloadSlides = renderedCards.map((card, index) => ({
        order: index + 1,
        image_url: card.url!,
        overlay_text: deviceNoteText.trim(),
      }))

      const response = await fetch('/api/admin/social/send-to-device', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          post_id: jobId,
          trend_name: 'Quote Cards',
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
      <div className="mx-auto max-w-7xl px-6 py-8">
        <header className="rounded-2xl border border-[#d4af37]/30 bg-[#121a2d] p-6">
          <p className="text-xs uppercase tracking-[0.2em] text-[#d4af37]">Admin Social</p>
          <h1 className={`${headingFont.className} mt-2 text-4xl font-semibold text-[#f8f1df]`}>
            Quote Cards
          </h1>
          <p className="mt-3 max-w-3xl text-sm text-[#f8f1df]/80">
            Generate remembrance quotes, choose artifact formats per card, and render vertical PNGs with downloadable
            presigned links.
          </p>
          <p className="mt-2 text-xs text-[#f8f1df]/60">
            Job ID: <span className="font-mono">{jobId}</span>
          </p>
        </header>

        <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <section className="space-y-6 rounded-2xl border border-[#d4af37]/20 bg-[#121a2d] p-6">
            <div>
              <h2 className={`${headingFont.className} text-2xl text-[#f8f1df]`}>1) Quotes + Formats</h2>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <label className="text-sm text-[#f8f1df]/80">
                  Count
                  <input
                    type="number"
                    min={1}
                    max={MAX_QUOTES}
                    value={quoteCount}
                    onChange={(event) =>
                      setQuoteCount(Math.max(1, Math.min(MAX_QUOTES, Number(event.target.value) || 1)))
                    }
                    className="ml-2 w-20 rounded-md border border-[#d4af37]/35 bg-[#0b1120] px-2 py-1 text-sm text-[#f8f1df]"
                  />
                </label>
                <button
                  type="button"
                  onClick={() => void handleGenerateQuotes()}
                  disabled={isGeneratingQuotes}
                  className="rounded-lg bg-[#d4af37] px-4 py-2 text-sm font-semibold text-[#0b1120] hover:bg-[#e2c462] disabled:opacity-50"
                >
                  {isGeneratingQuotes ? 'Generating...' : 'Generate quotes'}
                </button>
                <button
                  type="button"
                  onClick={() => void handleGenerateMemoryThought()}
                  disabled={isGeneratingMemoryThought || cards.length >= MAX_QUOTES}
                  className="rounded-lg border border-[#d4af37]/40 px-4 py-2 text-sm font-semibold text-[#f8f1df] hover:bg-[#1a2642] disabled:opacity-50"
                >
                  {isGeneratingMemoryThought ? 'Writing memory thought...' : 'Generate memory thought'}
                </button>
                <button
                  type="button"
                  onClick={addQuote}
                  disabled={cards.length >= MAX_QUOTES}
                  className="rounded-lg border border-[#d4af37]/40 px-3 py-2 text-sm text-[#f8f1df] disabled:opacity-50"
                >
                  Add quote
                </button>
              </div>
            </div>

            <div className="space-y-3">
              {cards.length === 0 ? (
                <p className="rounded-lg border border-dashed border-[#d4af37]/25 p-4 text-sm text-[#f8f1df]/65">
                  No quotes yet. Generate or add one manually.
                </p>
              ) : (
                cards.map((card, index) => (
                  <div key={card.id} className="rounded-lg border border-[#d4af37]/20 bg-[#0f172a] p-3 space-y-3">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <p className="text-xs uppercase tracking-[0.12em] text-[#d4af37]">Quote {index + 1}</p>
                      <button
                        type="button"
                        onClick={() => removeCard(card.id)}
                        className="rounded-md border border-red-400/40 px-2 py-1 text-xs text-red-300"
                      >
                        Remove
                      </button>
                    </div>
                    <textarea
                      value={card.quote}
                      onChange={(event) => updateCard(card.id, { quote: event.target.value })}
                      rows={3}
                      className="w-full rounded-lg border border-[#d4af37]/25 bg-[#0b1120] px-3 py-2 text-sm text-[#f8f1df] focus:outline-none focus:ring-2 focus:ring-[#d4af37]/35"
                    />
                    <label className="block text-xs text-[#f8f1df]/80">
                      Format
                      <select
                        value={card.format}
                        onChange={(event) => updateCard(card.id, { format: event.target.value as ArtifactFormat })}
                        className="mt-1 w-full rounded-lg border border-[#d4af37]/25 bg-[#0b1120] px-3 py-2 text-sm text-[#f8f1df]"
                      >
                        <option value="book_page">book_page</option>
                        <option value="highlighted_book">highlighted_book</option>
                        <option value="tweet">tweet</option>
                        <option value="typed_note">typed_note</option>
                        <option value="handwritten">handwritten</option>
                        <option value="book_page_photo">book_page_photo</option>
                      </select>
                    </label>

                    {(card.format === 'book_page' ||
                      card.format === 'highlighted_book' ||
                      card.format === 'tweet' ||
                      card.format === 'typed_note') ? (
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <label className="block text-xs text-[#f8f1df]/80">
                          Theme
                          <select
                            value={card.ogTheme}
                            onChange={(event) => updateCard(card.id, { ogTheme: event.target.value as OgTheme })}
                            className="mt-1 w-full rounded-lg border border-[#d4af37]/25 bg-[#0b1120] px-3 py-2 text-sm text-[#f8f1df]"
                          >
                            <option value="classic">classic</option>
                            <option value="elegant">elegant</option>
                            <option value="moody">moody</option>
                            <option value="vintage">vintage</option>
                          </select>
                        </label>
                        <label className="block text-xs text-[#f8f1df]/80">
                          Font
                          <select
                            value={card.ogFont}
                            onChange={(event) => updateCard(card.id, { ogFont: event.target.value as OgFont })}
                            className="mt-1 w-full rounded-lg border border-[#d4af37]/25 bg-[#0b1120] px-3 py-2 text-sm text-[#f8f1df]"
                          >
                            <option value="eb_garamond">EB Garamond</option>
                            <option value="cormorant">Cormorant Garamond</option>
                            <option value="courier_prime">Courier Prime</option>
                            <option value="system_sans">System Sans</option>
                          </select>
                        </label>
                      </div>
                    ) : null}

                    {(card.format === 'book_page' || card.format === 'highlighted_book') ? (
                      <label className="flex items-center gap-2 text-xs text-[#f8f1df]/80">
                        <input
                          type="checkbox"
                          checked={card.floralAccent}
                          onChange={(event) => updateCard(card.id, { floralAccent: event.target.checked })}
                          className="h-4 w-4 rounded border-[#d4af37]/40 bg-[#0b1120] text-[#d4af37] focus:ring-[#d4af37]/50"
                        />
                        Floral corner accent
                      </label>
                    ) : null}

                    {(card.format === 'book_page' || card.format === 'highlighted_book') ? (
                      <label className="block text-xs text-[#f8f1df]/80">
                        Bottom-half design overlay
                        <select
                          value={card.overlayDesign}
                          onChange={(event) => updateCard(card.id, { overlayDesign: event.target.value as OverlayDesign })}
                          className="mt-1 w-full rounded-lg border border-[#d4af37]/25 bg-[#0b1120] px-3 py-2 text-sm text-[#f8f1df]"
                        >
                          <option value="none">none</option>
                          <option value="windchime">windchime</option>
                          <option value="olivebranch">olivebranch</option>
                          <option value="coffee">coffee</option>
                          <option value="moonphases">moonphases</option>
                          <option value="candle">candle</option>
                          <option value="whitecandle">whitecandle</option>
                          <option value="goldcandle">goldcandle</option>
                          <option value="blackcandle">blackcandle</option>
                          <option value="blackolive">blackolive</option>
                          <option value="whiteolive">whiteolive</option>
                          <option value="goldenolive">goldenolive</option>
                          <option value="blackmoons">blackmoons</option>
                          <option value="whitemoons">whitemoons</option>
                          <option value="goldmoons">goldmoons</option>
                          <option value="goldchimes">goldchimes</option>
                          <option value="whitewindchimes">whitewindchimes</option>
                          <option value="blackwindchimes">blackwindchimes</option>
                          <option value="goldcoffee">goldcoffee</option>
                          <option value="whitecoffee">whitecoffee</option>
                          <option value="blackcoffee">blackcoffee</option>
                        </select>
                      </label>
                    ) : null}

                    {(card.format === 'book_page' ||
                      card.format === 'highlighted_book' ||
                      card.format === 'tweet' ||
                      card.format === 'book_page_photo') ? (
                      <div className="space-y-2">
                        <label className="block text-xs text-[#f8f1df]/80">
                          Attribution
                          <input
                            value={card.attribution}
                            onChange={(event) => updateCard(card.id, { attribution: event.target.value })}
                            placeholder={card.format === 'tweet' ? 'Display Name (@handle)' : 'Title, Author'}
                            className="mt-1 w-full rounded-lg border border-[#d4af37]/25 bg-[#0b1120] px-3 py-2 text-sm text-[#f8f1df]"
                          />
                        </label>
                        <button
                          type="button"
                          onClick={() => void handleMakeAttribution(card.id)}
                          disabled={Boolean(isGeneratingAttributionById[card.id])}
                          className="rounded-md border border-[#d4af37]/40 px-3 py-1.5 text-xs text-[#f8f1df] disabled:opacity-50"
                        >
                          {isGeneratingAttributionById[card.id] ? 'Making one up...' : 'Make one up'}
                        </button>
                      </div>
                    ) : null}

                    {card.format === 'highlighted_book' ? (
                      <label className="block text-xs text-[#f8f1df]/80">
                        Highlight substring (optional)
                        <input
                          value={card.highlightText}
                          onChange={(event) => updateCard(card.id, { highlightText: event.target.value })}
                          placeholder="If blank, first sentence is highlighted"
                          className="mt-1 w-full rounded-lg border border-[#d4af37]/25 bg-[#0b1120] px-3 py-2 text-sm text-[#f8f1df]"
                        />
                      </label>
                    ) : null}

                    {(card.format === 'handwritten' || card.format === 'book_page_photo') ? (
                      <label className="block text-xs text-[#f8f1df]/80">
                        Style details (optional)
                        <input
                          value={card.styleDetails}
                          onChange={(event) => updateCard(card.id, { styleDetails: event.target.value })}
                          placeholder="e.g. elegant floral margins, soft warm light, vintage paper grain"
                          className="mt-1 w-full rounded-lg border border-[#d4af37]/25 bg-[#0b1120] px-3 py-2 text-sm text-[#f8f1df]"
                        />
                        <span className="mt-1 block text-[11px] text-[#f8f1df]/60">
                          Used by AI-rendered formats to add visual detail without changing quote text.
                        </span>
                      </label>
                    ) : null}

                    <button
                      type="button"
                      onClick={() => void handleRenderCard(card)}
                      disabled={card.status === 'rendering'}
                      className="rounded-lg bg-[#d4af37] px-4 py-2 text-sm font-semibold text-[#0b1120] hover:bg-[#e2c462] disabled:opacity-50"
                    >
                      {card.status === 'rendering' ? 'Rendering...' : 'Render this card'}
                    </button>
                  </div>
                ))
              )}
            </div>
          </section>

          <section className="space-y-6">
            <div className="rounded-2xl border border-[#d4af37]/20 bg-[#121a2d] p-6">
              <h2 className={`${headingFont.className} text-2xl text-[#f8f1df]`}>2) Rendered Results</h2>
              <p className="mt-3 text-sm text-[#f8f1df]/70">
                Render each row independently for mixed formats. Handwritten + book_page_photo use GPT-image and others use OG.
              </p>
              <button
                type="button"
                onClick={() => void handleRenderAllCards()}
                disabled={isRenderingAll}
                className="mt-4 w-full rounded-lg bg-[#d4af37] px-4 py-3 text-sm font-semibold text-[#0b1120] hover:bg-[#e2c462] disabled:opacity-50"
              >
                {isRenderingAll ? 'Rendering all cards...' : 'Render all cards'}
              </button>
              {error ? <p className="mt-3 text-sm text-red-300">{error}</p> : null}
            </div>

            <div className="rounded-2xl border border-[#d4af37]/20 bg-[#121a2d] p-6">
              <h2 className={`${headingFont.className} text-2xl text-[#f8f1df]`}>3) Send to iPhone</h2>
              <p className="mt-3 text-sm text-[#f8f1df]/70">
                Send rendered quote cards through the same device-delivery flow used by other social generators.
              </p>
              <label className="mt-4 block text-sm text-[#f8f1df]/85">
                Note text (optional, applied to each slide)
                <textarea
                  value={deviceNoteText}
                  onChange={(event) => setDeviceNoteText(event.target.value)}
                  rows={3}
                  className="mt-2 w-full rounded-lg border border-[#d4af37]/30 bg-[#0f172a] px-3 py-2 text-sm text-[#f8f1df] focus:outline-none focus:ring-2 focus:ring-[#d4af37]/40"
                  placeholder="Write optional note text for the iPhone delivery..."
                />
              </label>
              <button
                type="button"
                onClick={() => void handleSendToDevice()}
                disabled={isSendingToDevice || isRenderingAll}
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
            </div>
          </section>
        </div>

        <section className="mt-8 rounded-2xl border border-[#d4af37]/20 bg-[#121a2d] p-6">
          <h2 className={`${headingFont.className} text-3xl text-[#f8f1df]`}>Rendered Cards</h2>
          {cards.length === 0 ? (
            <p className="mt-3 text-sm text-[#f8f1df]/65">No cards rendered yet.</p>
          ) : (
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {cards.map((card) => (
                <div key={card.id} className="rounded-xl border border-[#d4af37]/25 bg-[#0f172a] p-3">
                  {card.url ? (
                    <img
                      src={card.url}
                      alt="Rendered quote card"
                      className="aspect-[9/16] w-full rounded-md border border-[#d4af37]/20 object-cover"
                    />
                  ) : (
                    <div className="aspect-[9/16] w-full rounded-md border border-dashed border-[#d4af37]/20 bg-[#121a2d]" />
                  )}
                  <p className="mt-3 text-xs text-[#f8f1df]/75">{card.quote}</p>
                  <p className="mt-1 text-[11px] text-[#f8f1df]/60">
                    Format: {card.format}
                  </p>
                  {card.attribution ? <p className="mt-1 text-[11px] text-[#f8f1df]/60">{card.attribution}</p> : null}
                  <p className="mt-2 text-xs text-[#d4af37]">
                    {card.status === 'rendering'
                      ? 'Rendering...'
                      : card.status === 'idle'
                        ? 'Not rendered yet'
                      : card.status === 'success'
                        ? 'Ready'
                        : `Failed: ${card.error || 'Unknown error'}`}
                  </p>
                  {card.status === 'success' && card.url && card.key ? (
                    <div className="mt-3 space-y-2">
                      <a
                        href={card.url}
                        download
                        target="_blank"
                        rel="noreferrer"
                        className="block rounded-md bg-[#d4af37] px-3 py-2 text-center text-xs font-semibold text-[#0b1120] hover:bg-[#e2c462]"
                      >
                        Download PNG
                      </a>
                      <button
                        type="button"
                        onClick={() => pushSlideshowKey(card.key!)}
                        className="w-full rounded-md border border-[#d4af37]/40 px-3 py-2 text-xs text-[#f8f1df]"
                      >
                        Add to slideshow
                      </button>
                      <p className="break-all text-[11px] text-[#f8f1df]/55">{card.key}</p>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="mt-6 rounded-2xl border border-[#d4af37]/20 bg-[#121a2d] p-6">
          <h2 className={`${headingFont.className} text-2xl text-[#f8f1df]`}>Slideshow Keys Queue</h2>
          <p className="mt-2 text-sm text-[#f8f1df]/70">
            This is the ordered key list you can feed into the memorial slideshow flow.
          </p>
          {slideshowKeys.length === 0 ? (
            <p className="mt-3 text-sm text-[#f8f1df]/60">No keys added yet.</p>
          ) : (
            <div className="mt-3 space-y-2">
              {slideshowKeys.map((key, index) => (
                <p key={`${key}-${index}`} className="break-all rounded-md bg-[#0f172a] px-3 py-2 text-xs text-[#f8f1df]/80">
                  {index + 1}. {key}
                </p>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
