'use client'
/* eslint-disable @next/next/no-img-element */

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import heic2any from 'heic2any'
import { TemplateReferencePhoto } from '../../_components/reference-panel'

const MAX_REFERENCE_PHOTOS = 8

interface TemplateEditPayload {
  id: string
  name: string
  audio_track_name: string | null
  audio_track_url: string | null
  reference_video_url: string | null
  reference_photos: TemplateReferencePhoto[] | null
}

function toRenderableUrl(rawUrl: string): string {
  if (/\.amazonaws\.com\//i.test(rawUrl)) {
    return `/api/admin/social/templates/reference-media?url=${encodeURIComponent(rawUrl)}`
  }
  return rawUrl
}

export default function EditTemplatePage() {
  const params = useParams<{ id: string }>()
  const templateId = params.id

  const [templateName, setTemplateName] = useState('')
  const [audioTrackName, setAudioTrackName] = useState('')
  const [audioTrackUrl, setAudioTrackUrl] = useState('')
  const [referenceVideoUrl, setReferenceVideoUrl] = useState('')
  const [referencePhotos, setReferencePhotos] = useState<TemplateReferencePhoto[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploadingVideo, setUploadingVideo] = useState(false)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const videoInputRef = useRef<HTMLInputElement | null>(null)
  const photoInputRef = useRef<HTMLInputElement | null>(null)

  const isReferenceVideo = /\.(mp4|webm|mov)(\?.*)?$/i.test(referenceVideoUrl)

  useEffect(() => {
    const loadTemplate = async () => {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch(`/api/admin/social/templates/${templateId}`)
        const data: TemplateEditPayload & { error?: string } = await res.json()
        if (!res.ok) {
          throw new Error(data?.error || 'Failed to load template')
        }

        setTemplateName(data.name)
        setAudioTrackName(data.audio_track_name || '')
        setAudioTrackUrl(data.audio_track_url || '')
        setReferenceVideoUrl(data.reference_video_url || '')
        setReferencePhotos(Array.isArray(data.reference_photos) ? data.reference_photos : [])
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load template')
      } finally {
        setLoading(false)
      }
    }

    if (templateId) {
      void loadTemplate()
    }
  }, [templateId])

  const uploadReferenceFile = async (file: File, kind: 'video' | 'photo' | 'media') => {
    console.info('[template-reference-upload-client] starting', {
      templateId,
      kind,
      fileName: file.name,
      fileType: file.type,
      fileSize: file.size,
    })
    const formData = new FormData()
    formData.append('file', file)
    formData.append('kind', kind)

    const res = await fetch(`/api/admin/social/templates/${templateId}/upload-reference`, {
      method: 'POST',
      body: formData,
    })
    const data = await res.json()
    if (!res.ok) {
      console.error('[template-reference-upload-client] failed response', {
        status: res.status,
        body: data,
      })
      throw new Error(data?.error || 'Upload failed')
    }
    console.info('[template-reference-upload-client] success', {
      url: data.url,
      key: data.key,
    })
    return data.url as string
  }

  const normalizeImageForUpload = async (file: File): Promise<File> => {
    const isHeicLike =
      file.type === 'image/heic' ||
      file.type === 'image/heif' ||
      /\.hei(c|f)$/i.test(file.name)

    if (!isHeicLike) {
      return file
    }

    const converted = await heic2any({
      blob: file,
      toType: 'image/jpeg',
      quality: 0.92,
    })

    const convertedBlob = Array.isArray(converted) ? converted[0] : converted
    const nextName = file.name.replace(/\.hei(c|f)$/i, '.jpg')
    return new File([convertedBlob], nextName, { type: 'image/jpeg' })
  }

  const handleReferenceMediaUpload = async (file: File) => {
    setUploadingVideo(true)
    setError(null)
    setSuccess(null)
    try {
      const fileToUpload = file.type.startsWith('image/')
        ? await normalizeImageForUpload(file)
        : file
      const url = await uploadReferenceFile(fileToUpload, 'media')
      setReferenceVideoUrl(url)
      setSuccess('Reference media uploaded.')
    } catch (err) {
      console.error('[template-reference-upload-client] reference media upload failed', err)
      setError(err instanceof Error ? err.message : 'Reference media upload failed')
    } finally {
      setUploadingVideo(false)
    }
  }

  const handlePhotoUpload = async (files: FileList | File[]) => {
    const incoming = Array.from(files)
    if (incoming.length === 0) return
    if (referencePhotos.length >= MAX_REFERENCE_PHOTOS) {
      setError(`You can upload up to ${MAX_REFERENCE_PHOTOS} reference photos.`)
      return
    }

    setUploadingPhoto(true)
    setError(null)
    setSuccess(null)
    try {
      const capacity = MAX_REFERENCE_PHOTOS - referencePhotos.length
      const nextBatch = incoming.slice(0, capacity)
      const normalizedFiles = await Promise.all(
        nextBatch.map((file) => normalizeImageForUpload(file))
      )
      const uploadedUrls = await Promise.all(normalizedFiles.map((file) => uploadReferenceFile(file, 'photo')))
      setReferencePhotos((prev) => [
        ...prev,
        ...uploadedUrls.map((url, index) => ({
          order: prev.length + index + 1,
          url,
          label: `Slide ${prev.length + index + 1}`,
        })),
      ])
      setSuccess('Reference photos uploaded.')
    } catch (err) {
      console.error('[template-reference-upload-client] reference photos upload failed', err)
      setError(err instanceof Error ? err.message : 'Photo upload failed')
    } finally {
      setUploadingPhoto(false)
    }
  }

  const updatePhotoLabel = (index: number, label: string) => {
    setReferencePhotos((prev) =>
      prev.map((photo, photoIndex) => (photoIndex === index ? { ...photo, label } : photo))
    )
  }

  const removePhoto = (index: number) => {
    setReferencePhotos((prev) =>
      prev
        .filter((_, photoIndex) => photoIndex !== index)
        .map((photo, photoIndex) => ({ ...photo, order: photoIndex + 1 }))
    )
  }

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault()
    setSaving(true)
    setError(null)
    setSuccess(null)
    try {
      const res = await fetch(`/api/admin/social/templates/${templateId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          audio_track_name: audioTrackName || null,
          audio_track_url: audioTrackUrl || null,
          reference_video_url: referenceVideoUrl || null,
          reference_photos: referencePhotos.map((photo, index) => ({
            order: index + 1,
            url: photo.url,
            label: (photo.label || '').trim(),
          })),
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data?.error || 'Failed to save template')
      }
      setSuccess('Template updated.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save template')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="p-6 lg:p-8 text-gray-400">Loading template...</div>
  }

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <div>
        <Link href={`/admin/social/templates/${templateId}/generate`} className="text-gray-400 hover:text-white text-sm">
          ← Back to Generate Page
        </Link>
        <h1 className="text-3xl font-bold text-white mt-2">Edit Template: {templateName}</h1>
        <p className="text-gray-400 mt-1">Manage admin-only reference media and audio metadata.</p>
      </div>

      <form onSubmit={handleSave} className="bg-[#1a1f2e] rounded-2xl p-6 border border-gray-800/50 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-gray-300 mb-2">Audio Track Name</label>
            <input
              type="text"
              value={audioTrackName}
              onChange={(e) => setAudioTrackName(e.target.value)}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-300 mb-2">Audio Track URL</label>
            <input
              type="text"
              value={audioTrackUrl}
              onChange={(e) => setAudioTrackUrl(e.target.value)}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"
            />
          </div>
        </div>

        <section className="space-y-3">
          <h2 className="text-white font-semibold">Reference Media (Photo or MP4)</h2>
          <input
            ref={videoInputRef}
            type="file"
            accept="video/*,image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) {
                void handleReferenceMediaUpload(file)
              }
            }}
          />
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault()
              const file = e.dataTransfer.files?.[0]
              if (file) {
                void handleReferenceMediaUpload(file)
              }
            }}
            onClick={() => videoInputRef.current?.click()}
            className="border border-dashed border-gray-600 rounded-xl p-6 text-center cursor-pointer hover:border-amber-400/60"
          >
            <p className="text-sm text-gray-300">
              {uploadingVideo ? 'Uploading...' : 'Drag & drop a photo/MP4 or click to upload'}
            </p>
          </div>
          {referenceVideoUrl && (
            isReferenceVideo ? (
              <video src={toRenderableUrl(referenceVideoUrl)} controls autoPlay muted loop playsInline className="w-full max-w-[320px] rounded-lg border border-gray-700" />
            ) : (
              <img src={toRenderableUrl(referenceVideoUrl)} alt="Reference media" className="w-full max-w-[320px] rounded-lg border border-gray-700 object-cover" />
            )
          )}
        </section>

        <section className="space-y-3">
          <h2 className="text-white font-semibold">Reference Photos ({referencePhotos.length}/{MAX_REFERENCE_PHOTOS})</h2>
          <input
            ref={photoInputRef}
            type="file"
            multiple
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const files = e.target.files
              if (files) {
                void handlePhotoUpload(files)
              }
            }}
          />
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault()
              void handlePhotoUpload(e.dataTransfer.files)
            }}
            onClick={() => photoInputRef.current?.click()}
            className="border border-dashed border-gray-600 rounded-xl p-6 text-center cursor-pointer hover:border-amber-400/60"
          >
            <p className="text-sm text-gray-300">{uploadingPhoto ? 'Uploading...' : 'Drag & drop photos or click to upload'}</p>
          </div>

          {referencePhotos.length > 0 && (
            <div className="space-y-3">
              {referencePhotos.map((photo, index) => (
                <div key={`${photo.url}-${index}`} className="flex items-center gap-3 bg-gray-800/50 p-3 rounded-lg">
                  <img src={toRenderableUrl(photo.url)} alt={photo.label || `Reference ${index + 1}`} className="w-16 h-16 object-cover rounded border border-gray-700" />
                  <div className="flex-1 space-y-2">
                    <p className="text-xs text-gray-400">Photo {index + 1}</p>
                    <input
                      type="text"
                      value={photo.label || ''}
                      onChange={(e) => updatePhotoLabel(index, e.target.value)}
                      placeholder={`Slide ${index + 1}: ...`}
                      className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white text-sm"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => removePhoto(index)}
                    className="px-2 py-1 rounded bg-red-500/20 text-red-300 text-xs hover:bg-red-500/30"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        {error && <p className="text-red-400 text-sm">{error}</p>}
        {success && <p className="text-green-400 text-sm">{success}</p>}

        <button
          type="submit"
          disabled={saving || uploadingPhoto || uploadingVideo}
          className={`w-full py-3 rounded-xl font-semibold ${
            saving || uploadingPhoto || uploadingVideo
              ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
              : 'bg-gradient-to-r from-amber-500 to-orange-500 text-white hover:from-amber-400 hover:to-orange-400'
          }`}
        >
          {saving ? 'Saving...' : 'Save Template'}
        </button>
      </form>
    </div>
  )
}
