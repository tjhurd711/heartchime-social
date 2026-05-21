'use client'
/* eslint-disable @next/next/no-img-element */

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

export default function ReferencePanel({
  templateId,
  referenceVideoUrl,
  referencePhotos,
  compact = false,
}: ReferencePanelProps) {
  const photos = sortedPhotos(referencePhotos)
  const hasMedia = !!referenceVideoUrl || photos.length > 0

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
          {referenceVideoUrl && (
            <video
              src={referenceVideoUrl}
              autoPlay
              muted
              loop
              playsInline
              controls
              className="w-full max-w-[200px] rounded-md border border-gray-700 bg-black"
            />
          )}

          {photos.length > 0 && (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {photos.map((photo, index) => (
                <div key={`${photo.url}-${index}`} className="min-w-[72px] space-y-1">
                  <img
                    src={photo.url}
                    alt={photo.label || `Reference ${index + 1}`}
                    className="w-[72px] h-[72px] object-cover rounded border border-gray-700"
                  />
                  <p className="text-[10px] text-gray-300 leading-tight">{photo.label || `Slide ${index + 1}`}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </aside>
  )
}
