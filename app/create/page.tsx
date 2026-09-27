'use client'

import { useEffect, useRef, useState } from 'react'
import { v4 as uuidv4 } from 'uuid'

// The S3-hosted icon the server renderer bakes into the final PNG. Using the same
// asset here keeps the live preview identical to the downloaded card.
const HEARTCHIME_ICON_URL =
  'https://heartbeat-photos-prod.s3.us-east-2.amazonaws.com/icons/websitechime.png'

const GOLD = '#FFC300'
const ORANGE = '#FF9800'
const NAVY = '#1A365D'
const MAX_MESSAGE_LENGTH = 600

const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/avif': 'avif',
  'image/gif': 'gif',
}

function isHeic(file: File): boolean {
  return (
    file.type === 'image/heic' ||
    file.type === 'image/heif' ||
    /\.hei[cf]$/i.test(file.name)
  )
}

interface PreparedPhoto {
  file: File
  previewUrl: string
}

export default function CreateCardPage() {
  const [cardId, setCardId] = useState('')
  const [photo, setPhoto] = useState<PreparedPhoto | null>(null)
  const [message, setMessage] = useState('')
  const [dotCount, setDotCount] = useState(0)
  const [preparing, setPreparing] = useState(false)

  const [rendering, setRendering] = useState(false)
  const [progress, setProgress] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [cardUrl, setCardUrl] = useState<string | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const photoRef = useRef<PreparedPhoto | null>(null)

  useEffect(() => {
    setCardId(uuidv4())
  }, [])

  useEffect(() => {
    photoRef.current = photo
  }, [photo])

  useEffect(() => {
    return () => {
      if (photoRef.current) URL.revokeObjectURL(photoRef.current.previewUrl)
    }
  }, [])

  const handleFileSelected = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return
    setError(null)
    setCardUrl(null)
    setPreparing(true)
    try {
      const original = fileList[0]
      let file = original

      if (isHeic(original)) {
        try {
          const heic2any = (await import('heic2any')).default
          const converted = await heic2any({
            blob: original,
            toType: 'image/jpeg',
            quality: 0.9,
          })
          const blob = Array.isArray(converted) ? converted[0] : converted
          const newName = original.name.replace(/\.[^.]+$/, '') + '.jpg'
          file = new File([blob], newName, { type: 'image/jpeg' })
        } catch {
          setError(
            `Could not convert ${original.name}. Try exporting it as a JPEG and uploading again.`
          )
          return
        }
      }

      if (!file.type.startsWith('image/')) {
        setError(`${original.name} is not an image.`)
        return
      }

      if (photoRef.current) URL.revokeObjectURL(photoRef.current.previewUrl)
      setPhoto({ file, previewUrl: URL.createObjectURL(file) })
    } finally {
      setPreparing(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const removePhoto = () => {
    if (photo) URL.revokeObjectURL(photo.previewUrl)
    setPhoto(null)
    setCardUrl(null)
  }

  const handleCreate = async () => {
    if (!photo) {
      setError('Please add a photo first.')
      return
    }
    if (!message.trim()) {
      setError('Please write a message for your card.')
      return
    }

    setError(null)
    setCardUrl(null)
    setRendering(true)
    setProgress('Uploading your photo…')

    try {
      const { file } = photo
      const ext = MIME_TO_EXT[file.type] || 'jpg'
      const filename = `photo.${ext}`

      const presignRes = await fetch('/api/card/presigned-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cardId, filename, contentType: file.type }),
      })
      const presignData = await presignRes.json()
      if (!presignRes.ok) {
        throw new Error(presignData?.error || 'Could not prepare photo upload.')
      }

      const putRes = await fetch(presignData.putUrl, {
        method: 'PUT',
        headers: { 'Content-Type': file.type },
        body: file,
      })
      if (!putRes.ok) {
        throw new Error('Photo failed to upload. Please try again.')
      }

      setProgress('Creating your HeartChime card…')

      const renderRes = await fetch('/api/card/render', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ photoKey: presignData.key, message: message.trim(), dotCount }),
      })
      const renderData = await renderRes.json()
      if (!renderRes.ok) {
        throw new Error(renderData?.error || 'Could not create your card. Please try again.')
      }

      setCardUrl(renderData.url as string)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setRendering(false)
      setProgress(null)
    }
  }

  const handleDownload = async () => {
    if (!cardUrl) return
    try {
      const res = await fetch(cardUrl)
      const blob = await res.blob()
      const objectUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = objectUrl
      a.download = 'heartchime-card.png'
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(objectUrl)
    } catch {
      // Fallback: open in a new tab so the user can save manually.
      window.open(cardUrl, '_blank')
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'linear-gradient(160deg, #0b1220 0%, #14233f 100%)',
        color: '#f3ead9',
        padding: '40px 20px',
        fontFamily:
          "'Raleway', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      }}
    >
      <link
        href="https://fonts.googleapis.com/css2?family=Raleway:wght@400;500;600;700&display=swap"
        rel="stylesheet"
      />

      <div style={{ maxWidth: 980, margin: '0 auto' }}>
        <header style={{ textAlign: 'center', marginBottom: 36 }}>
          <h1 style={{ fontSize: 40, fontWeight: 700, margin: 0, letterSpacing: -0.5 }}>
            Create your HeartChime card
          </h1>
          <p style={{ color: '#9fb0d0', fontSize: 17, marginTop: 12, lineHeight: 1.5 }}>
            Upload a photo, write a message, and we&rsquo;ll turn it into a beautiful
            shareable card.
          </p>
        </header>

        {error && (
          <div
            style={{
              maxWidth: 640,
              margin: '0 auto 24px',
              borderRadius: 12,
              border: '1px solid rgba(248, 113, 113, 0.4)',
              background: 'rgba(248, 113, 113, 0.1)',
              color: '#fecaca',
              padding: '12px 16px',
              fontSize: 14,
            }}
          >
            {error}
          </div>
        )}

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 360px)',
            gap: 32,
            alignItems: 'start',
          }}
        >
          {/* ── Editor ───────────────────────────────────────────── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            <section
              style={{
                borderRadius: 18,
                border: '1px solid #2c3b59',
                background: '#121b2d',
                padding: 24,
              }}
            >
              <h2 style={{ fontSize: 18, fontWeight: 600, margin: '0 0 14px' }}>1. Your photo</h2>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,.heic,.heif,image/heic,image/heif"
                onChange={(e) => void handleFileSelected(e.target.files)}
                style={{ display: 'none' }}
              />

              {!photo ? (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={preparing}
                  style={{
                    width: '100%',
                    borderRadius: 12,
                    border: '1px dashed #4a5c82',
                    background: '#0f1728',
                    color: '#d6b274',
                    padding: '28px 16px',
                    fontSize: 15,
                    cursor: preparing ? 'default' : 'pointer',
                    opacity: preparing ? 0.6 : 1,
                  }}
                >
                  {preparing ? 'Preparing photo…' : '+ Upload a photo'}
                </button>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={photo.previewUrl}
                    alt="Selected"
                    style={{
                      width: 88,
                      height: 88,
                      objectFit: 'cover',
                      borderRadius: 12,
                      border: '1px solid #364767',
                    }}
                  />
                  <div style={{ display: 'flex', gap: 10 }}>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      style={{
                        borderRadius: 10,
                        border: '1px solid #4a5c82',
                        background: 'transparent',
                        color: '#d6b274',
                        padding: '8px 14px',
                        fontSize: 14,
                        cursor: 'pointer',
                      }}
                    >
                      Replace
                    </button>
                    <button
                      type="button"
                      onClick={removePhoto}
                      style={{
                        borderRadius: 10,
                        border: '1px solid #4a5c82',
                        background: 'transparent',
                        color: '#9fb0d0',
                        padding: '8px 14px',
                        fontSize: 14,
                        cursor: 'pointer',
                      }}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              )}
              <p style={{ color: '#7f8db0', fontSize: 12, marginTop: 10 }}>
                iPhone HEIC photos are supported and converted automatically.
              </p>
            </section>

            <section
              style={{
                borderRadius: 18,
                border: '1px solid #2c3b59',
                background: '#121b2d',
                padding: 24,
              }}
            >
              <h2 style={{ fontSize: 18, fontWeight: 600, margin: '0 0 14px' }}>2. Your message</h2>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value.slice(0, MAX_MESSAGE_LENGTH))}
                rows={5}
                placeholder="Write something from the heart…"
                style={{
                  width: '100%',
                  borderRadius: 12,
                  border: '1px solid #364767',
                  background: '#0f1728',
                  color: '#f3ead9',
                  padding: '12px 14px',
                  fontSize: 15,
                  lineHeight: 1.5,
                  resize: 'vertical',
                  fontFamily: 'inherit',
                  outline: 'none',
                }}
              />
              <p style={{ color: '#7f8db0', fontSize: 12, marginTop: 8, textAlign: 'right' }}>
                {message.length} / {MAX_MESSAGE_LENGTH}
              </p>
            </section>

            <section
              style={{
                borderRadius: 18,
                border: '1px solid #2c3b59',
                background: '#121b2d',
                padding: 24,
              }}
            >
              <h2 style={{ fontSize: 18, fontWeight: 600, margin: '0 0 6px' }}>
                3. Slideshow dots
              </h2>
              <p style={{ color: '#7f8db0', fontSize: 13, margin: '0 0 14px' }}>
                Add little dots under the photo to hint there&rsquo;s a slideshow.
              </p>
              <div style={{ display: 'flex', gap: 10 }}>
                {[
                  { value: 0, label: 'Off' },
                  { value: 2, label: '2' },
                  { value: 3, label: '3' },
                  { value: 4, label: '4' },
                ].map((opt) => {
                  const selected = dotCount === opt.value
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setDotCount(opt.value)}
                      style={{
                        flex: 1,
                        borderRadius: 10,
                        border: selected ? '1px solid #b58d45' : '1px solid #364767',
                        background: selected ? 'rgba(181, 141, 69, 0.15)' : '#0f1728',
                        color: selected ? '#e7c98d' : '#9fb0d0',
                        padding: '10px 0',
                        fontSize: 15,
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      {opt.label}
                    </button>
                  )
                })}
              </div>
            </section>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <button
                type="button"
                onClick={() => void handleCreate()}
                disabled={rendering || preparing}
                style={{
                  width: '100%',
                  borderRadius: 12,
                  border: 'none',
                  background: rendering ? '#8a6c34' : '#b58d45',
                  color: '#101828',
                  padding: '16px',
                  fontSize: 16,
                  fontWeight: 700,
                  cursor: rendering || preparing ? 'default' : 'pointer',
                  opacity: rendering || preparing ? 0.7 : 1,
                }}
              >
                {rendering ? progress || 'Creating…' : 'Create my HeartChime card'}
              </button>
              {rendering && (
                <p style={{ textAlign: 'center', fontSize: 12, color: '#7f8db0' }}>
                  Keep this page open.
                </p>
              )}
            </div>

            {cardUrl && (
              <section
                style={{
                  borderRadius: 18,
                  border: '1px solid rgba(181, 141, 69, 0.5)',
                  background: 'rgba(181, 141, 69, 0.08)',
                  padding: 24,
                  textAlign: 'center',
                }}
              >
                <h2 style={{ fontSize: 18, fontWeight: 600, margin: '0 0 14px' }}>
                  Your card is ready
                </h2>
                <button
                  type="button"
                  onClick={() => void handleDownload()}
                  style={{
                    borderRadius: 12,
                    border: 'none',
                    background: '#b58d45',
                    color: '#101828',
                    padding: '12px 24px',
                    fontSize: 15,
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  Download PNG
                </button>
                <p style={{ marginTop: 12, fontSize: 12, color: '#9fb0d0' }}>
                  Or{' '}
                  <a
                    href={cardUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: '#e7c98d' }}
                  >
                    open the full-size image
                  </a>
                  .
                </p>
              </section>
            )}
          </div>

          {/* ── Live preview ─────────────────────────────────────── */}
          <div style={{ position: 'sticky', top: 24 }}>
            <p
              style={{
                color: '#7f8db0',
                fontSize: 12,
                textTransform: 'uppercase',
                letterSpacing: 1,
                marginBottom: 12,
                textAlign: 'center',
              }}
            >
              Live preview
            </p>
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <CardPreview photoUrl={photo?.previewUrl} message={message} dotCount={dotCount} />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// Self-contained preview matching lib/socialCardRenderer.ts (socialMode design).
function CardPreview({
  photoUrl,
  message,
  dotCount,
}: {
  photoUrl?: string
  message: string
  dotCount: number
}) {
  return (
    <div
      style={{
        width: 300,
        padding: 20,
        borderRadius: 24,
        background: `linear-gradient(135deg, ${GOLD} 0%, ${ORANGE} 100%)`,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 16,
        boxShadow: '0 0 30px 5px rgba(255, 195, 0, 0.4)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={HEARTCHIME_ICON_URL}
          alt="Heartchime"
          style={{ width: 50, height: 40, objectFit: 'contain' }}
        />
        <span style={{ fontWeight: 600, fontSize: 25, color: NAVY }}>HeartChime</span>
      </div>

      {photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={photoUrl}
          alt="Memory"
          style={{
            width: '100%',
            height: 'auto',
            minHeight: 150,
            maxHeight: 350,
            objectFit: 'cover',
            display: 'block',
            borderRadius: 16,
          }}
        />
      ) : (
        <div
          style={{
            width: '100%',
            height: 200,
            borderRadius: 16,
            background: 'rgba(26, 54, 93, 0.2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <span style={{ fontSize: 48, opacity: 0.4 }}>📷</span>
        </div>
      )}

      {dotCount >= 2 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          {Array.from({ length: dotCount }).map((_, i) => (
            <span
              key={i}
              style={{
                width: i === 0 ? 22 : 8,
                height: 8,
                borderRadius: i === 0 ? 4 : '50%',
                background: i === 0 ? NAVY : 'rgba(26, 54, 93, 0.3)',
              }}
            />
          ))}
        </div>
      )}

      <p
        style={{
          fontSize: 18,
          fontWeight: 500,
          color: NAVY,
          textAlign: 'center',
          lineHeight: 1.5,
          margin: 0,
        }}
      >
        {message || (
          <span style={{ opacity: 0.5, fontStyle: 'italic' }}>Your message will appear here…</span>
        )}
      </p>
    </div>
  )
}
