'use client'

import { useEffect, useRef, useState } from 'react'
import { v4 as uuidv4 } from 'uuid'

// The S3-hosted icon the server renderer bakes into the final PNG. Using the same
// asset here keeps the live preview identical to the downloaded card.
const HEARTGEM_ICON_URL =
  'https://heartbeat-photos-prod.s3.us-east-2.amazonaws.com/icons/websitegem.png'

const GOLD = '#FFC300'
const ORANGE = '#FF9800'
const NAVY = '#1A365D'
const LIGHTER_NAVY = '#2C5282'
const MAX_CONTEXT_LENGTH = 200
const MAX_HANDLE_LENGTH = 40

const GOLD_TEXT_GRADIENT: React.CSSProperties = {
  background: `linear-gradient(135deg, ${GOLD}, ${ORANGE})`,
  WebkitBackgroundClip: 'text',
  WebkitTextFillColor: 'transparent',
  backgroundClip: 'text',
}

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

export default function CreateGemCardPage() {
  const [cardId, setCardId] = useState('')
  const [photo, setPhoto] = useState<PreparedPhoto | null>(null)
  const [context, setContext] = useState('')
  const [creatorHandle, setCreatorHandle] = useState('')
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

  const normalizedHandle = creatorHandle.trim()
    ? `@${creatorHandle.trim().replace(/^@+/, '')}`
    : ''

  const handleCreate = async () => {
    if (!photo) {
      setError('Please add an image first.')
      return
    }
    if (!context.trim()) {
      setError('Please write a context line for your gem.')
      return
    }

    setError(null)
    setCardUrl(null)
    setRendering(true)
    setProgress('Uploading your image…')

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
        throw new Error(presignData?.error || 'Could not prepare image upload.')
      }

      const putRes = await fetch(presignData.putUrl, {
        method: 'PUT',
        headers: { 'Content-Type': file.type },
        body: file,
      })
      if (!putRes.ok) {
        throw new Error('Image failed to upload. Please try again.')
      }

      setProgress('Creating your HeartGem card…')

      const renderRes = await fetch('/api/gem-card/render', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          photoKey: presignData.key,
          context: context.trim(),
          creatorHandle: normalizedHandle,
        }),
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
      a.download = 'heartgem-card.png'
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
            Create your HeartGem card
          </h1>
          <p style={{ color: '#9fb0d0', fontSize: 17, marginTop: 12, lineHeight: 1.5 }}>
            Upload an image, add the moment&rsquo;s context, and we&rsquo;ll turn it into a
            beautiful shareable card.
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
              <h2 style={{ fontSize: 18, fontWeight: 600, margin: '0 0 14px' }}>1. Your image</h2>

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
                  {preparing ? 'Preparing image…' : '+ Upload an image'}
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
              <h2 style={{ fontSize: 18, fontWeight: 600, margin: '0 0 14px' }}>2. Context</h2>
              <textarea
                value={context}
                onChange={(e) => setContext(e.target.value.slice(0, MAX_CONTEXT_LENGTH))}
                rows={3}
                placeholder="Because one of your favorite memories was baking Christmas cookies with Mom"
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
                {context.length} / {MAX_CONTEXT_LENGTH}
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
                3. Creator handle
              </h2>
              <p style={{ color: '#7f8db0', fontSize: 13, margin: '0 0 14px' }}>
                Optional &mdash; bakes a &ldquo;via @handle&rdquo; credit under the image.
              </p>
              <input
                type="text"
                value={creatorHandle}
                onChange={(e) => setCreatorHandle(e.target.value.slice(0, MAX_HANDLE_LENGTH))}
                placeholder="caitlins_table"
                style={{
                  width: '100%',
                  borderRadius: 12,
                  border: '1px solid #364767',
                  background: '#0f1728',
                  color: '#f3ead9',
                  padding: '12px 14px',
                  fontSize: 15,
                  fontFamily: 'inherit',
                  outline: 'none',
                }}
              />
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
                {rendering ? progress || 'Creating…' : 'Create my HeartGem card'}
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
              <GemCardPreview
                photoUrl={photo?.previewUrl}
                context={context}
                creatorHandle={normalizedHandle}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// Self-contained preview matching lib/gemCardRenderer.ts.
function GemCardPreview({
  photoUrl,
  context,
  creatorHandle,
}: {
  photoUrl?: string
  context: string
  creatorHandle: string
}) {
  return (
    <div
      style={{
        width: 304,
        padding: 2.5,
        borderRadius: 24,
        background: NAVY,
        boxShadow: '0 6px 15px 2px rgba(26, 54, 93, 0.3)',
      }}
    >
      <div
        style={{
          padding: 20,
          borderRadius: 21.5,
          background: `linear-gradient(135deg, ${NAVY} 0%, ${LIGHTER_NAVY} 100%)`,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 16,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={HEARTGEM_ICON_URL}
            alt="HeartGem"
            style={{ width: 44, height: 40, objectFit: 'contain' }}
          />
          <span style={{ fontWeight: 600, fontSize: 25, ...GOLD_TEXT_GRADIENT }}>HeartGem</span>
        </div>

        {photoUrl ? (
          <div style={{ position: 'relative', width: '100%', borderRadius: 16, overflow: 'hidden' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
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
              }}
            />
            <div
              style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <div
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: '50%',
                  background: 'rgba(0, 0, 0, 0.6)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.35)',
                }}
              >
                <svg
                  viewBox="0 0 24 24"
                  fill={GOLD}
                  style={{ width: 30, height: 30, marginLeft: 4 }}
                >
                  <path d="M8 5v14l11-7z" />
                </svg>
              </div>
            </div>
          </div>
        ) : (
          <div
            style={{
              width: '100%',
              height: 200,
              borderRadius: 16,
              background: 'rgba(255, 255, 255, 0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <span style={{ fontSize: 48, opacity: 0.6 }}>📷</span>
          </div>
        )}

        {context ? (
          <p
            style={{
              fontSize: 16,
              fontWeight: 600,
              textAlign: 'center',
              lineHeight: 1.4,
              margin: 0,
              ...GOLD_TEXT_GRADIENT,
            }}
          >
            {context}
          </p>
        ) : (
          <p
            style={{
              fontSize: 16,
              fontWeight: 600,
              textAlign: 'center',
              lineHeight: 1.4,
              margin: 0,
              color: 'rgba(255, 255, 255, 0.4)',
              fontStyle: 'italic',
            }}
          >
            Your context line will appear here…
          </p>
        )}

        {creatorHandle && (
          <p
            style={{
              fontSize: 12,
              fontWeight: 500,
              fontStyle: 'italic',
              color: 'rgba(255, 195, 0, 0.7)',
              textAlign: 'center',
              margin: '-8px 0 0',
            }}
          >
            via {creatorHandle}
          </p>
        )}
      </div>
    </div>
  )
}
