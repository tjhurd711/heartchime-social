'use client'

import { useEffect, useRef, useState } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { Cormorant_Garamond, DM_Sans } from 'next/font/google'

const cormorant = Cormorant_Garamond({ subsets: ['latin'], weight: ['500', '600', '700'] })
const dmSans = DM_Sans({ subsets: ['latin'], weight: ['400', '500', '700'] })

const RELATIONSHIPS = [
  'dad',
  'mom',
  'brother',
  'sister',
  'spouse',
  'child',
  'best friend',
  'grandparent',
  'partner',
  'other',
]

interface PreparedPhoto {
  id: string
  file: File
  previewUrl: string
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

export default function TributePage() {
  const [tributeId, setTributeId] = useState<string>('')

  const [lovedOneName, setLovedOneName] = useState('')
  const [relationship, setRelationship] = useState('')
  const [relationshipOther, setRelationshipOther] = useState('')
  const [dateOfBirth, setDateOfBirth] = useState('')
  const [dateOfPassing, setDateOfPassing] = useState('')
  const [submitterEmail, setSubmitterEmail] = useState('')
  const [submitterName, setSubmitterName] = useState('')

  const [lovedThings, setLovedThings] = useState('')
  const [waysHonored, setWaysHonored] = useState('')
  const [thingsMissed, setThingsMissed] = useState('')
  const [specificMemory, setSpecificMemory] = useState('')
  const [song, setSong] = useState('')
  const [otherDetails, setOtherDetails] = useState('')

  const [photos, setPhotos] = useState<PreparedPhoto[]>([])
  const [convertingPhotos, setConvertingPhotos] = useState(false)
  const [showMore, setShowMore] = useState(false)

  const [submitting, setSubmitting] = useState(false)
  const [progress, setProgress] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)
  const [submittedName, setSubmittedName] = useState('')

  const fileInputRef = useRef<HTMLInputElement>(null)
  const photosRef = useRef<PreparedPhoto[]>([])

  useEffect(() => {
    setTributeId(uuidv4())
  }, [])

  useEffect(() => {
    photosRef.current = photos
  }, [photos])

  useEffect(() => {
    return () => {
      photosRef.current.forEach((p) => URL.revokeObjectURL(p.previewUrl))
    }
  }, [])

  const handleFilesSelected = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return
    setError(null)
    setConvertingPhotos(true)
    try {
      const incoming = Array.from(fileList)
      const prepared: PreparedPhoto[] = []

      for (const original of incoming) {
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
            continue
          }
        }

        if (!file.type.startsWith('image/')) {
          setError(`${original.name} is not an image.`)
          continue
        }

        prepared.push({
          id: uuidv4(),
          file,
          previewUrl: URL.createObjectURL(file),
        })
      }

      setPhotos((prev) => [...prev, ...prepared])
    } finally {
      setConvertingPhotos(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const removePhoto = (id: string) => {
    setPhotos((prev) => {
      const target = prev.find((p) => p.id === id)
      if (target) URL.revokeObjectURL(target.previewUrl)
      return prev.filter((p) => p.id !== id)
    })
  }

  const resolvedRelationship = (): string => {
    if (relationship === 'other') return relationshipOther.trim()
    return relationship
  }

  const validate = (): string | null => {
    if (!lovedOneName.trim()) return "Please enter your loved one's name."
    if (!relationship) return 'Please choose your relationship to them.'
    if (relationship === 'other' && !relationshipOther.trim())
      return 'Please describe your relationship.'
    if (!submitterEmail.trim()) return 'Please enter your email so we can reach you.'
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(submitterEmail.trim()))
      return 'Please enter a valid email address.'
    if (photos.length === 0) return 'Please add at least one photo.'
    return null
  }

  const handleSubmit = async () => {
    const validationError = validate()
    if (validationError) {
      setError(validationError)
      return
    }
    setError(null)
    setSubmitting(true)
    setProgress('Uploading photos…')

    try {
      const photoKeys: string[] = []

      for (let i = 0; i < photos.length; i++) {
        const { file } = photos[i]
        const ext = MIME_TO_EXT[file.type] || 'jpg'
        const filename = `photo-${i + 1}.${ext}`
        setProgress(`Uploading photo ${i + 1} of ${photos.length}…`)

        const presignRes = await fetch('/api/tribute/presigned-url', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tributeId, filename, contentType: file.type }),
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
          throw new Error(`Photo ${i + 1} failed to upload. Please try again.`)
        }

        photoKeys.push(presignData.key as string)
      }

      setProgress('Saving tribute…')

      const submitRes = await fetch('/api/tribute/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tributeId,
          loved_one_name: lovedOneName.trim(),
          relationship: resolvedRelationship(),
          date_of_birth: dateOfBirth || null,
          date_of_passing: dateOfPassing || null,
          photo_s3_keys: photoKeys,
          submitter_email: submitterEmail.trim(),
          submitter_name: submitterName.trim() || null,
          loved_things: lovedThings.trim() || null,
          ways_honored: waysHonored.trim() || null,
          things_missed: thingsMissed.trim() || null,
          specific_memory: specificMemory.trim() || null,
          song: song.trim() || null,
          other_details: otherDetails.trim() || null,
        }),
      })
      const submitData = await submitRes.json()
      if (!submitRes.ok) {
        throw new Error(submitData?.error || 'Could not save your tribute. Please try again.')
      }

      setSubmittedName(lovedOneName.trim())
      setSubmitted(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setSubmitting(false)
      setProgress(null)
    }
  }

  const inputClass =
    'mt-1.5 w-full rounded-xl border border-[#364767] bg-[#0f1728] px-4 py-3 text-base text-[#f3ead9] placeholder-[#6f7e9e] focus:outline-none focus:ring-2 focus:ring-[#b58d45]'
  const labelClass = 'block text-sm font-medium text-[#ceb995]'

  if (submitted) {
    return (
      <div className={`min-h-screen bg-[#0b1220] text-[#f3ead9] flex items-center px-5 ${dmSans.className}`}>
        <div className="max-w-md mx-auto text-center space-y-5 py-16">
          <div className="mx-auto w-16 h-16 rounded-full border border-[#b58d45]/50 bg-[#121b2d] flex items-center justify-center text-3xl text-[#e7c98d]">
            ♥
          </div>
          <h1 className={`text-4xl text-[#f3ead9] ${cormorant.className}`}>Thank you.</h1>
          <p className="text-[#ceb995] text-lg leading-relaxed">
            We received {submittedName}&rsquo;s tribute. We&rsquo;ll be in touch.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className={`min-h-screen bg-[#0b1220] text-[#f3ead9] px-5 py-10 md:py-14 ${dmSans.className}`}>
      <div className="max-w-xl mx-auto space-y-8">
        <header className="text-center space-y-3">
          <h1 className={`text-4xl md:text-5xl text-[#f3ead9] ${cormorant.className}`}>
            Share a tribute
          </h1>
          <p className="text-[#ceb995] leading-relaxed">
            Tell us about someone you love and miss. Share a few photos and a few words, and
            we&rsquo;ll create something to honor them.
          </p>
        </header>

        {error && (
          <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-red-200 text-sm">
            {error}
          </div>
        )}

        <section className="rounded-2xl border border-[#2c3b59] bg-[#121b2d] p-5 md:p-7 space-y-5">
          <label className={labelClass}>
            Loved one&rsquo;s name <span className="text-[#e7c98d]">*</span>
            <input
              value={lovedOneName}
              onChange={(e) => setLovedOneName(e.target.value)}
              placeholder="e.g. Robert Hurd"
              className={inputClass}
            />
          </label>

          <label className={labelClass}>
            Your relationship to them <span className="text-[#e7c98d]">*</span>
            <select
              value={relationship}
              onChange={(e) => setRelationship(e.target.value)}
              className={inputClass}
            >
              <option value="">Select…</option>
              {RELATIONSHIPS.map((r) => (
                <option key={r} value={r}>
                  {r.charAt(0).toUpperCase() + r.slice(1)}
                </option>
              ))}
            </select>
          </label>

          {relationship === 'other' && (
            <label className={labelClass}>
              Describe your relationship <span className="text-[#e7c98d]">*</span>
              <input
                value={relationshipOther}
                onChange={(e) => setRelationshipOther(e.target.value)}
                placeholder="e.g. aunt, mentor, neighbor"
                className={inputClass}
              />
            </label>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className={labelClass}>
              Date of birth <span className="text-[#7f8db0] font-normal">(recommended)</span>
              <input
                type="date"
                value={dateOfBirth}
                onChange={(e) => setDateOfBirth(e.target.value)}
                className={inputClass}
              />
            </label>
            <label className={labelClass}>
              Date of passing <span className="text-[#7f8db0] font-normal">(recommended)</span>
              <input
                type="date"
                value={dateOfPassing}
                onChange={(e) => setDateOfPassing(e.target.value)}
                className={inputClass}
              />
            </label>
          </div>
        </section>

        {/* Photos */}
        <section className="rounded-2xl border border-[#2c3b59] bg-[#121b2d] p-5 md:p-7 space-y-4">
          <div>
            <p className={labelClass}>
              Photo(s) <span className="text-[#e7c98d]">*</span>
            </p>
            <p className="text-xs text-[#7f8db0] mt-1">
              Upload one or more photos. iPhone HEIC photos are supported and converted
              automatically.
            </p>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,.heic,.heif,image/heic,image/heif"
            multiple
            onChange={(e) => void handleFilesSelected(e.target.files)}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={convertingPhotos}
            className="w-full rounded-xl border border-dashed border-[#4a5c82] bg-[#0f1728] px-4 py-5 text-sm text-[#d6b274] hover:border-[#b58d45] hover:bg-[#13203a] transition-colors disabled:opacity-60"
          >
            {convertingPhotos ? 'Preparing photos…' : '+ Add photos'}
          </button>

          {photos.length > 0 && (
            <div className="grid grid-cols-3 gap-3">
              {photos.map((photo) => (
                <div
                  key={photo.id}
                  className="relative aspect-square rounded-xl overflow-hidden border border-[#364767] bg-[#0f1728]"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={photo.previewUrl}
                    alt="Selected"
                    className="w-full h-full object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => removePhoto(photo.id)}
                    className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/70 text-white text-sm flex items-center justify-center hover:bg-black/90"
                    aria-label="Remove photo"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Contact */}
        <section className="rounded-2xl border border-[#2c3b59] bg-[#121b2d] p-5 md:p-7 space-y-5">
          <label className={labelClass}>
            Your email <span className="text-[#e7c98d]">*</span>
            <input
              type="email"
              value={submitterEmail}
              onChange={(e) => setSubmitterEmail(e.target.value)}
              placeholder="you@example.com"
              className={inputClass}
            />
          </label>
          <label className={labelClass}>
            Your name <span className="text-[#7f8db0] font-normal">(optional)</span>
            <input
              value={submitterName}
              onChange={(e) => setSubmitterName(e.target.value)}
              placeholder="Your name"
              className={inputClass}
            />
          </label>
        </section>

        {/* Deeper fields (collapsible) */}
        <section className="rounded-2xl border border-[#2c3b59] bg-[#121b2d] overflow-hidden">
          <button
            type="button"
            onClick={() => setShowMore((v) => !v)}
            className="w-full flex items-center justify-between gap-3 px-5 md:px-7 py-5 text-left"
          >
            <span>
              <span className={`block text-xl text-[#f1d386] ${cormorant.className}`}>
                Tell us more
              </span>
              <span className="text-xs text-[#7f8db0]">helps us make a better tribute</span>
            </span>
            <span className="text-[#d6b274] text-lg">{showMore ? '−' : '+'}</span>
          </button>

          {showMore && (
            <div className="px-5 md:px-7 pb-7 space-y-5">
              <label className={labelClass}>
                3 things they loved
                <textarea
                  value={lovedThings}
                  onChange={(e) => setLovedThings(e.target.value)}
                  rows={3}
                  placeholder="e.g. fishing, black coffee, Friday night football"
                  className={inputClass}
                />
              </label>
              <label className={labelClass}>
                3 ways you honor them
                <textarea
                  value={waysHonored}
                  onChange={(e) => setWaysHonored(e.target.value)}
                  rows={3}
                  className={inputClass}
                />
              </label>
              <label className={labelClass}>
                3 things you miss about them
                <textarea
                  value={thingsMissed}
                  onChange={(e) => setThingsMissed(e.target.value)}
                  rows={3}
                  className={inputClass}
                />
              </label>
              <label className={labelClass}>
                A specific memory
                <textarea
                  value={specificMemory}
                  onChange={(e) => setSpecificMemory(e.target.value)}
                  rows={2}
                  placeholder="One or two sentences"
                  className={inputClass}
                />
              </label>
              <label className={labelClass}>
                A song that reminds you of them
                <input
                  value={song}
                  onChange={(e) => setSong(e.target.value)}
                  placeholder="Song & artist"
                  className={inputClass}
                />
              </label>
              <label className={labelClass}>
                Anything else
                <textarea
                  value={otherDetails}
                  onChange={(e) => setOtherDetails(e.target.value)}
                  rows={3}
                  className={inputClass}
                />
              </label>
            </div>
          )}
        </section>

        <div className="space-y-3">
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={submitting || convertingPhotos}
            className="w-full rounded-xl bg-[#b58d45] px-6 py-4 text-base font-semibold text-[#101828] hover:bg-[#c59c4f] transition-colors disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? progress || 'Submitting…' : 'Submit tribute'}
          </button>
          {progress && submitting && (
            <p className="text-center text-xs text-[#7f8db0]">{progress} Keep this page open.</p>
          )}
        </div>
      </div>
    </div>
  )
}
