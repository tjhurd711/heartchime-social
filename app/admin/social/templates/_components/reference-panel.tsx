'use client'
/* eslint-disable @next/next/no-img-element */

import { useMemo, useRef, useState } from 'react'
import Link from 'next/link'

export interface TemplateReferencePhoto {
  order?: number
  url: string
  label?: string
}

interface ReferencePanelProps {
  templateId: string
  referenceVideoUrl?: string | null
  referencePhotos?: TemplateReferencePhoto[] | null
  compact?: boolean
}

function sortedPhotos(referencePhotos: TemplateReferencePhoto[] | null | undefined): TemplateReferencePhoto[] {
  const photos = Array.isArray(referencePhotos) ? [...referencePhotos] : []
  return photos.sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
}

function isVideoUrl(url: string | null | undefined): boolean {
  if (!url) return false
  return /\.(mp4|webm|mov)(\?.*)?$/i.test(url)
}

function toRenderableUrl(rawUrl: string): string {
  if (/\.amazonaws\.com\//i.test(rawUrl)) {
    return `/api/admin/social/templates/reference-media?url=${encodeURIComponent(rawUrl)}`
  }
  return rawUrl
}

function ReferenceMedia({
  url,
  label,
}: {
  url: string
  label: string
}) {
  const [forceImage, setForceImage] = useState(false)
  const [imageFailed, setImageFailed] = useState(false)
  const renderVideo = isVideoUrl(url) && !forceImage
  const displayUrl = toRenderableUrl(url)

  return (
    <div className="relative w-full aspect-[9/16] rounded-lg overflow-hidden border border-gray-700 bg-black">
      {renderVideo ? (
        <video
          src={displayUrl}
          autoPlay
          muted
          loop
          playsInline
          controls
          onError={() => {
            console.error('[reference-panel] video failed to load, falling back to image', { url, label })
            setForceImage(true)
          }}
          className="w-full h-full object-cover"
        />
      ) : (
        <>
          {!imageFailed && (
            <img
              src={displayUrl}
              alt={label}
              onError={() => {
                console.error('[reference-panel] image failed to load', { url, label })
                setImageFailed(true)
              }}
              className="w-full h-full object-cover"
            />
          )}
          {imageFailed && (
            <div className="w-full h-full flex items-center justify-center px-3 text-center text-xs text-red-300 bg-black/60">
              Failed to load reference media
            </div>
          )}
        </>
      )}
      <div className="absolute inset-x-0 bottom-0 px-2 py-1 bg-gradient-to-t from-black/85 to-transparent">
        <p className="text-[10px] text-white font-medium truncate">{label}</p>
      </div>
    </div>
  )
}

export default function ReferencePanel({
  templateId,
  referenceVideoUrl,
  referencePhotos,
  compact = false,
}: ReferencePanelProps) {
  const photos = sortedPhotos(referencePhotos)
  const slides = useMemo(() => {
    const photoSlides = photos.map((photo, index) => ({
      url: photo.url,
      label: photo.label || `Slide ${index + 1}`,
    }))

    if (photoSlides.length > 0) return photoSlides
    if (!referenceVideoUrl) return []
    return [
      {
        url: referenceVideoUrl,
        label: 'Reference',
      },
    ]
  }, [photos, referenceVideoUrl])
  const hasMedia = slides.length > 0
  const scrollerRef = useRef<HTMLDivElement | null>(null)
  const [activeIndex, setActiveIndex] = useState(0)

  const goToSlide = (targetIndex: number) => {
    const container = scrollerRef.current
    if (!container) return
    const bounded = Math.max(0, Math.min(targetIndex, slides.length - 1))
    const nextChild = container.children.item(bounded) as HTMLElement | null
    if (!nextChild) return
    nextChild.scrollIntoView({ behavior: 'smooth', inline: 'start', block: 'nearest' })
    setActiveIndex(bounded)
  }

  const handleScroll = () => {
    const container = scrollerRef.current
    if (!container) return
    const width = container.clientWidth || 1
    const index = Math.round(container.scrollLeft / width)
    const bounded = Math.max(0, Math.min(index, slides.length - 1))
    if (bounded !== activeIndex) {
      setActiveIndex(bounded)
    }
  }

  return (
    <aside className={`border border-gray-700/60 rounded-xl bg-[#141826] ${compact ? 'p-3 w-[220px]' : 'p-4 w-[240px]'}`}>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-semibold text-gray-200 uppercase tracking-wide">Reference</h3>
        <Link href={`/admin/social/templates/${templateId}/edit`} className="text-[11px] text-amber-300 hover:text-amber-200">
          Edit
        </Link>
      </div>

      {!hasMedia ? (
        <Link
          href={`/admin/social/templates/${templateId}/edit`}
          className="inline-flex items-center px-2 py-1 rounded-md bg-amber-500/20 text-amber-300 text-xs hover:bg-amber-500/30"
        >
          Upload reference
        </Link>
      ) : (
        <div className="space-y-2">
          <div
            ref={scrollerRef}
            onScroll={handleScroll}
            className="flex overflow-x-auto snap-x snap-mandatory gap-2 scroll-smooth"
          >
            {slides.map((slide, index) => (
              <div key={`${slide.url}-${index}`} className="snap-start shrink-0 w-full">
                <ReferenceMedia url={slide.url} label={slide.label} />
              </div>
            ))}
          </div>

          {slides.length > 1 && (
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => goToSlide(activeIndex - 1)}
                className="px-2 py-1 rounded bg-gray-700/80 text-[11px] text-gray-200 disabled:opacity-40"
                disabled={activeIndex <= 0}
              >
                Prev
              </button>
              <div className="flex items-center gap-1">
                {slides.map((slide, index) => (
                  <button
                    key={`${slide.url}-dot-${index}`}
                    type="button"
                    onClick={() => goToSlide(index)}
                    className={`w-2 h-2 rounded-full ${activeIndex === index ? 'bg-amber-300' : 'bg-gray-600'}`}
                    aria-label={`Go to slide ${index + 1}`}
                  />
                ))}
              </div>
              <button
                type="button"
                onClick={() => goToSlide(activeIndex + 1)}
                className="px-2 py-1 rounded bg-gray-700/80 text-[11px] text-gray-200 disabled:opacity-40"
                disabled={activeIndex >= slides.length - 1}
              >
                Next
              </button>
            </div>
          )}
        </div>
      )}
    </aside>
  )
}
