'use client'

import Link from 'next/link'
import { ChangeEvent, useEffect, useMemo, useRef, useState } from 'react'
import { Cormorant_Garamond, DM_Sans } from 'next/font/google'

type SlideState = 'idle' | 'uploading' | 'uploaded' | 'sent' | 'imported' | 'error'

interface SlideDraft {
  id: string
  order: number
  file: File
  previewUrl: string
  note: string
  status: SlideState
  s3Key?: string
  getUrl?: string
  error?: string
}

interface PresignedResponse {
  key: string
  putUrl: string
  getUrl: string
}

const cormorant = Cormorant_Garamond({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
})

const dmSans = DM_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '700'],
})

function buildDefaultAlbumName(): string {
  const now = new Date()
  const timestamp = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
    String(now.getHours()).padStart(2, '0'),
    String(now.getMinutes()).padStart(2, '0'),
    String(now.getSeconds()).padStart(2, '0'),
  ].join('')
  return `post_${timestamp}`
}

function normalizeExtension(file: File): string {
  const fromName = file.name.split('.').pop()?.trim().toLowerCase()
  if (fromName && /^[a-z0-9]+$/.test(fromName)) {
    return fromName
  }

  if (file.type === 'image/png') return 'png'
  if (file.type === 'image/webp') return 'webp'
  if (file.type === 'image/heic') return 'heic'
  if (file.type === 'image/heif') return 'heif'
  if (file.type === 'image/avif') return 'avif'
  if (file.type === 'image/gif') return 'gif'
  return 'jpg'
}

function statusLabel(status: SlideState): string {
  if (status === 'idle') return 'Pending'
  if (status === 'uploading') return 'Uploading'
  if (status === 'uploaded') return 'Uploaded'
  if (status === 'sent') return 'Sent'
  if (status === 'imported') return 'Imported'
  return 'Error'
}

export default function SendToPhonePage() {
  const [albumName, setAlbumName] = useState(buildDefaultAlbumName())
  const [slides, setSlides] = useState<SlideDraft[]>([])
  const [sending, setSending] = useState(false)
  const [globalError, setGlobalError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const slidesRef = useRef<SlideDraft[]>([])

  useEffect(() => {
    slidesRef.current = slides
  }, [slides])

  useEffect(() => {
    return () => {
      slidesRef.current.forEach((slide) => URL.revokeObjectURL(slide.previewUrl))
    }
  }, [])

  const orderedSlides = useMemo(
    () => slides.map((slide, index) => ({ ...slide, order: index + 1 })),
    [slides]
  )

  const updateSlide = (id: string, updater: (slide: SlideDraft) => SlideDraft) => {
    setSlides((prev) => prev.map((slide) => (slide.id === id ? updater(slide) : slide)))
  }

  const updateSlideStatus = (id: string, status: SlideState, error?: string) => {
    updateSlide(id, (slide) => ({ ...slide, status, error }))
  }

  const handleFilesPicked = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || [])
    if (files.length === 0) return

    setGlobalError(null)
    setSuccessMessage(null)
    setSlides((prev) => {
      prev.forEach((slide) => URL.revokeObjectURL(slide.previewUrl))
      return files.map((file, index) => ({
        id: `${Date.now()}-${index}-${file.name}`,
        order: index + 1,
        file,
        previewUrl: URL.createObjectURL(file),
        note: '',
        status: 'idle' as SlideState,
      }))
    })
    event.target.value = ''
  }

  const moveSlide = (id: string, direction: 'up' | 'down') => {
    setSlides((prev) => {
      const idx = prev.findIndex((slide) => slide.id === id)
      if (idx < 0) return prev
      if (direction === 'up' && idx === 0) return prev
      if (direction === 'down' && idx === prev.length - 1) return prev
      const next = [...prev]
      const swapIndex = direction === 'up' ? idx - 1 : idx + 1
      ;[next[idx], next[swapIndex]] = [next[swapIndex], next[idx]]
      return next
    })
  }

  const sendToPhone = async () => {
    setGlobalError(null)
    setSuccessMessage(null)

    const trimmedAlbumName = albumName.trim()
    if (!trimmedAlbumName) {
      setGlobalError('Album name is required.')
      return
    }
    if (orderedSlides.length === 0) {
      setGlobalError('Pick at least one image slide first.')
      return
    }

    setSending(true)
    try {
      const uploadedSlidesById = new Map<string, { getUrl: string; s3Key: string }>()

      for (const slide of orderedSlides) {
        updateSlideStatus(slide.id, 'uploading')

        const presignRes = await fetch('/api/send-to-phone/presigned-url', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            albumName: trimmedAlbumName,
            order: slide.order,
            extension: normalizeExtension(slide.file),
            contentType: slide.file.type || 'image/jpeg',
          }),
        })
        const presignData = await presignRes.json()
        if (!presignRes.ok) {
          const message = presignData?.details || presignData?.error || 'Failed to create upload URL.'
          updateSlideStatus(slide.id, 'error', message)
          throw new Error(message)
        }

        const { key, putUrl, getUrl } = presignData as PresignedResponse
        const uploadRes = await fetch(putUrl, {
          method: 'PUT',
          headers: {
            'Content-Type': slide.file.type || 'image/jpeg',
          },
          body: slide.file,
        })
        if (!uploadRes.ok) {
          const message = `Upload failed for slide ${slide.order}`
          updateSlideStatus(slide.id, 'error', message)
          throw new Error(message)
        }

        updateSlide(slide.id, (item) => ({
          ...item,
          status: 'uploaded',
          s3Key: key,
          getUrl,
          error: undefined,
        }))
        uploadedSlidesById.set(slide.id, {
          getUrl,
          s3Key: key,
        })
      }

      setSlides((prev) => prev.map((slide) => ({ ...slide, status: 'sent' })))

      const payloadSlides = orderedSlides.map((slide) => {
        const uploaded = uploadedSlidesById.get(slide.id)
        const latest = slidesRef.current.find((current) => current.id === slide.id)
        return {
          order: slide.order,
          image_url: uploaded?.getUrl || latest?.getUrl || slide.getUrl || '',
          note: latest?.note ?? slide.note,
          s3_key: uploaded?.s3Key || latest?.s3Key || slide.s3Key || '',
        }
      })

      if (payloadSlides.some((slide) => !slide.image_url)) {
        throw new Error('Missing presigned GET URL for one or more slides.')
      }

      const sendRes = await fetch('/api/admin/social/send-to-phone', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          albumName: trimmedAlbumName,
          slides: payloadSlides,
        }),
      })

      const sendData = await sendRes.json()
      if (!sendRes.ok) {
        const details = sendData?.details
        const errorText =
          typeof details === 'string'
            ? details
            : details
              ? JSON.stringify(details)
              : sendData?.error || 'Failed to send slides to phone.'
        setSlides((prev) =>
          prev.map((slide) => ({
            ...slide,
            status: 'error',
            error: errorText,
          }))
        )
        throw new Error(errorText)
      }

      setSlides((prev) =>
        prev.map((slide) => ({
          ...slide,
          status: 'imported',
          error: undefined,
        }))
      )
      setSuccessMessage(`Sent ${payloadSlides.length} slide(s) to ${trimmedAlbumName}.`)
    } catch (error) {
      setGlobalError(error instanceof Error ? error.message : 'Failed to send slides.')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className={`min-h-screen bg-[#0b1220] text-[#f3ead9] p-5 md:p-8 ${dmSans.className}`}>
      <div className="max-w-5xl mx-auto space-y-6">
        <header className="space-y-3">
          <Link href="/admin/social" className="inline-flex text-sm text-[#d6b274] hover:text-[#ecc98a] transition-colors">
            ← Back to Social
          </Link>
          <div>
            <h1 className={`text-4xl text-[#f3ead9] ${cormorant.className}`}>Send To Phone</h1>
            <p className="text-[#ceb995] mt-1">
              Upload static slides, keep slide notes, then forward short-lived fetch URLs to your Mac import pipeline.
            </p>
          </div>
        </header>

        <section className="rounded-2xl border border-[#2c3b59] bg-[#121b2d] p-4 md:p-5 space-y-4">
          <label className="block text-sm text-[#ceb995]">
            Album name
            <input
              value={albumName}
              onChange={(event) => setAlbumName(event.target.value)}
              className="mt-1 w-full rounded-lg border border-[#364767] bg-[#0f1728] px-3 py-2 text-sm text-[#f3ead9] focus:outline-none focus:ring-2 focus:ring-[#b58d45]"
              placeholder="post_20260528120000"
            />
          </label>

          <label className="block text-sm text-[#ceb995]">
            Pick slides (images)
            <input
              type="file"
              accept="image/*"
              capture="environment"
              multiple
              onChange={handleFilesPicked}
              className="mt-1 w-full rounded-lg border border-[#364767] bg-[#0f1728] px-3 py-2 text-sm text-[#f3ead9]"
            />
          </label>

          <button
            type="button"
            onClick={() => void sendToPhone()}
            disabled={sending || orderedSlides.length === 0}
            className="w-full rounded-lg bg-[#b58d45] px-4 py-2.5 text-sm font-semibold text-[#111827] hover:bg-[#c59c4f] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {sending ? 'Sending...' : 'Send to phone'}
          </button>
        </section>

        {globalError && (
          <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-red-300 text-sm">
            {globalError}
          </div>
        )}
        {successMessage && (
          <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-emerald-200 text-sm">
            {successMessage}
          </div>
        )}

        <section className="rounded-2xl border border-[#2c3b59] bg-[#121b2d] p-4 md:p-5">
          <h2 className={`${cormorant.className} text-2xl text-[#f1d386] mb-4`}>Slides</h2>
          {orderedSlides.length === 0 ? (
            <p className="text-sm text-[#ceb995]">No slides selected yet.</p>
          ) : (
            <div className="space-y-3">
              {orderedSlides.map((slide, index) => (
                <article
                  key={slide.id}
                  className="rounded-xl border border-[#32476b] bg-[#0f1728] p-3 grid grid-cols-1 md:grid-cols-[92px_1fr_auto] gap-3 items-start"
                >
                  <img
                    src={slide.previewUrl}
                    alt={`Slide ${index + 1}`}
                    className="w-[92px] h-[92px] rounded-md object-cover border border-[#32476b]"
                  />

                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-medium text-[#f3ead9]">Slide {index + 1}</p>
                      <span className="text-xs rounded-full border border-[#415477] px-2 py-0.5 text-[#d7c29b]">
                        {statusLabel(slide.status)}
                      </span>
                    </div>
                    <label className="block text-xs text-[#ccb78f]">
                      Notes
                      <input
                        value={slide.note}
                        onChange={(event) =>
                          updateSlide(slide.id, (item) => ({ ...item, note: event.target.value }))
                        }
                        placeholder="optional notes"
                        className="mt-1 w-full rounded-lg border border-[#364767] bg-[#0b1322] px-3 py-2 text-sm text-[#f3ead9] focus:outline-none focus:ring-2 focus:ring-[#b58d45]"
                      />
                    </label>
                    {slide.error ? <p className="text-xs text-red-300">{slide.error}</p> : null}
                  </div>

                  <div className="flex md:flex-col gap-2">
                    <button
                      type="button"
                      onClick={() => moveSlide(slide.id, 'up')}
                      disabled={index === 0 || sending}
                      className="rounded-md border border-[#415477] px-2 py-1 text-xs text-[#d7c29b] hover:border-[#d8b372] disabled:opacity-50"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      onClick={() => moveSlide(slide.id, 'down')}
                      disabled={index === orderedSlides.length - 1 || sending}
                      className="rounded-md border border-[#415477] px-2 py-1 text-xs text-[#d7c29b] hover:border-[#d8b372] disabled:opacity-50"
                    >
                      ↓
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
