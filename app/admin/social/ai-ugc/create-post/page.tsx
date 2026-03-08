'use client'

import { useState, useEffect, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import type { AiUgcPersonaWithLovedOne, Platform } from '@/lib/aiUgcTypes'

// ═══════════════════════════════════════════════════════════════════════════
// POST BUILDER PAGE - Multi-step flow with Photo Review
// ═══════════════════════════════════════════════════════════════════════════

interface ParsedSlide {
  slideNumber: number
  type: string
  era?: string | null
  context?: string | null
  caption?: string | null
  cardMessage?: string | null
  generatedUrl?: string | null
  existingAssetUrl?: string | null
}

interface ParsedPost {
  slides: ParsedSlide[]
  overallCaption?: string
  platform?: Platform
}

interface GeneratedPhoto {
  slideNumber: number
  type: string
  generatedUrl: string
  era?: string | null
  context?: string | null
  replacedUrl?: string | null // If user uploaded a replacement
  isSelectedForCard?: boolean
  prompt?: string | null // The prompt used to generate this photo
}

type Step = 'input' | 'edit' | 'review' | 'card'

export default function CreatePostPage() {
  const searchParams = useSearchParams()
  const preselectedPersona = searchParams.get('persona')
  
  // Persona state
  const [personas, setPersonas] = useState<AiUgcPersonaWithLovedOne[]>([])
  const [selectedPersonaId, setSelectedPersonaId] = useState<string>(preselectedPersona || '')
  const [description, setDescription] = useState<string>('')
  
  // Loading states
  const [loading, setLoading] = useState(true)
  const [parsing, setParsing] = useState(false)
  const [generatingPhotos, setGeneratingPhotos] = useState(false)
  const [generatingCard, setGeneratingCard] = useState(false)
  
  // Step state
  const [currentStep, setCurrentStep] = useState<Step>('input')
  
  // Data state
  const [parsedPost, setParsedPost] = useState<ParsedPost | null>(null)
  const [generatedPhotos, setGeneratedPhotos] = useState<GeneratedPhoto[]>([])
  const [selectedPhotoForCard, setSelectedPhotoForCard] = useState<number | null>(null)
  const [finalCardUrl, setFinalCardUrl] = useState<string | null>(null)
  const [caption, setCaption] = useState<string>('')
  const [platform, setPlatform] = useState<Platform>('both')
  
  // Error state
  const [error, setError] = useState<string | null>(null)
  
  // Editing states
  const [editingCardMessage, setEditingCardMessage] = useState<number | null>(null)
  const [editingContext, setEditingContext] = useState<number | null>(null)
  const [editingCaption, setEditingCaption] = useState<number | null>(null)
  const [editingEra, setEditingEra] = useState<number | null>(null)
  
  // File input ref for photo replacement
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [replacingPhotoIndex, setReplacingPhotoIndex] = useState<number | null>(null)
  
  // Retry modal state
  const [retryingPhotoIndex, setRetryingPhotoIndex] = useState<number | null>(null)
  const [retryPrompt, setRetryPrompt] = useState<string>('')
  const [regenerating, setRegenerating] = useState(false)
  
  // Selfie generation state (Slide 1)
  const [includeSelfie, setIncludeSelfie] = useState<boolean>(true)
  const [selfieEmotion, setSelfieEmotion] = useState<string>('slight smile')
  const [selfieSetting, setSelfieSetting] = useState<string>('home')
  
  // Emotion options for Slide 1 selfie
  const emotionOptions = [
    'neutral',
    'slight smile', 
    'bittersweet',
    'sad',
    'hopeful',
    'tired',
    'peaceful',
    'contemplative',
    'forced smile',
    'teary-eyed'
  ]

  // Setting options for Slide 1 selfie
  const settingOptions = [
    'home',
    'kitchen', 
    'bedroom',
    'living room',
    'car',
    'outside',
    'backyard',
    'office',
    'coffee shop',
    'park'
  ]
  
  // Manual card crop state
  const [manualCardCropUrl, setManualCardCropUrl] = useState<string | null>(null)
  const [uploadingCardCrop, setUploadingCardCrop] = useState(false)
  const cardCropInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetchPersonas()
  }, [])

  const fetchPersonas = async () => {
    try {
      const res = await fetch('/api/admin/social/ai-ugc/personas')
      const data = await res.json()
      setPersonas(data.personas || [])
      
      if (preselectedPersona && data.personas?.some((p: any) => p.id === preselectedPersona)) {
        setSelectedPersonaId(preselectedPersona)
      }
    } catch (err) {
      setError('Failed to fetch personas')
    } finally {
      setLoading(false)
    }
  }

  const selectedPersona = personas.find(p => p.id === selectedPersonaId)
  const selectedLovedOne = selectedPersona?.loved_ones?.[0]

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 1: Parse natural language description
  // ═══════════════════════════════════════════════════════════════════════════
  
  const handleParse = async () => {
    if (!selectedPersonaId || !description.trim()) {
      setError('Please select a persona and enter a description')
      return
    }

    setParsing(true)
    setError(null)
    setParsedPost(null)
    setGeneratedPhotos([])
    setFinalCardUrl(null)

    try {
      const res = await fetch('/api/admin/social/ai-ugc/parse-post', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          personaId: selectedPersonaId,
          description,
          includeSelfie,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to parse description')
      }

      setParsedPost(data.parsed)
      setCaption(data.parsed.overallCaption || '')
      if (data.parsed.platform) {
        setPlatform(data.parsed.platform)
      }
      setCurrentStep('edit')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setParsing(false)
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 2: Generate photos (without HeartChime card)
  // ═══════════════════════════════════════════════════════════════════════════
  
  const handleGeneratePhotos = async () => {
    if (!parsedPost || !selectedPersonaId) return

    setGeneratingPhotos(true)
    setError(null)

    try {
      const res = await fetch('/api/admin/social/ai-ugc/generate-photos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          personaId: selectedPersonaId,
          slides: parsedPost.slides,
          // Only include selfie params if includeSelfie is true
          ...(includeSelfie && {
            selfieEmotion,
            selfieSetting,
          }),
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to generate photos')
      }

      // Store generated photos
      setGeneratedPhotos(data.photos)
      
      // Auto-select together_photo for card, or last photo if no together_photo
      const togetherPhotoIndex = data.photos.findIndex((p: GeneratedPhoto) => p.type === 'together_photo')
      if (togetherPhotoIndex >= 0) {
        setSelectedPhotoForCard(togetherPhotoIndex)
      } else if (data.photos.length > 0) {
        setSelectedPhotoForCard(data.photos.length - 1)
      }
      
      if (data.errors && data.errors.length > 0) {
        setError(`Some photos failed: ${data.errors.join(', ')}`)
      }
      
      setCurrentStep('review')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setGeneratingPhotos(false)
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 3: Photo Review - Replace photo
  // ═══════════════════════════════════════════════════════════════════════════
  
  const handleReplacePhoto = (index: number) => {
    setReplacingPhotoIndex(index)
    fileInputRef.current?.click()
  }

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || replacingPhotoIndex === null) return

    try {
      // Upload to S3
      const formData = new FormData()
      formData.append('file', file)
      formData.append('folder', 'ai-ugc-posts/replaced')

      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      })

      if (!res.ok) {
        throw new Error('Failed to upload replacement photo')
      }

      const data = await res.json()
      
      // Update the photo at this index with the replaced URL
      setGeneratedPhotos(prev => {
        const updated = [...prev]
        updated[replacingPhotoIndex] = {
          ...updated[replacingPhotoIndex],
          replacedUrl: data.url,
        }
        return updated
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload')
    } finally {
      setReplacingPhotoIndex(null)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  const downloadPhoto = async (url: string, filename: string) => {
    try {
      // Fetch the image as a blob to enable cross-origin download
      const response = await fetch(url)
      const blob = await response.blob()
      
      // Create a blob URL and trigger download
      const blobUrl = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = blobUrl
      link.download = filename
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      
      // Clean up the blob URL
      URL.revokeObjectURL(blobUrl)
    } catch (error) {
      console.error('Download failed:', error)
      // Fallback: open in new tab
      window.open(url, '_blank')
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // RETRY PHOTO GENERATION
  // ═══════════════════════════════════════════════════════════════════════════
  
  const openRetryModal = (index: number) => {
    const photo = generatedPhotos[index]
    setRetryingPhotoIndex(index)
    setRetryPrompt(photo.prompt || photo.context || '')
  }

  const closeRetryModal = () => {
    setRetryingPhotoIndex(null)
    setRetryPrompt('')
  }

  const handleRetryPhoto = async () => {
    if (retryingPhotoIndex === null || !selectedPersonaId || !retryPrompt.trim()) return
    
    setRegenerating(true)
    setError(null)

    try {
      const photo = generatedPhotos[retryingPhotoIndex]
      
      // Get the slide info from parsedPost
      const slideInfo = parsedPost?.slides.find(s => s.slideNumber === photo.slideNumber)
      
      const res = await fetch('/api/admin/social/ai-ugc/generate-photos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          personaId: selectedPersonaId,
          slides: [{
            slideNumber: photo.slideNumber,
            type: photo.type,
            era: photo.era,
            context: retryPrompt, // Use the edited prompt as context
          }],
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to regenerate photo')
      }

      if (data.photos && data.photos.length > 0) {
        // Update the photo at this index
        setGeneratedPhotos(prev => {
          const updated = [...prev]
          updated[retryingPhotoIndex] = {
            ...updated[retryingPhotoIndex],
            generatedUrl: data.photos[0].generatedUrl,
            prompt: data.photos[0].prompt,
            replacedUrl: null, // Clear any previous replacement
          }
          return updated
        })
        
        closeRetryModal()
      } else {
        throw new Error('No photo returned from API')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to regenerate photo')
    } finally {
      setRegenerating(false)
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MANUAL CARD CROP UPLOAD
  // ═══════════════════════════════════════════════════════════════════════════
  
  const handleCardCropUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploadingCardCrop(true)
    setError(null)

    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('folder', 'ai-ugc-card-crops')

      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      })

      if (!res.ok) {
        throw new Error('Failed to upload card crop')
      }

      const data = await res.json()
      setManualCardCropUrl(data.url)
      console.log('[create-post] ✅ Manual card crop uploaded:', data.url)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload')
    } finally {
      setUploadingCardCrop(false)
      if (cardCropInputRef.current) {
        cardCropInputRef.current.value = ''
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 4: Generate HeartChime card
  // ═══════════════════════════════════════════════════════════════════════════
  
  const handleGenerateCard = async () => {
    if (selectedPhotoForCard === null || !parsedPost) return

    setGeneratingCard(true)
    setError(null)

    try {
      const selectedPhoto = generatedPhotos[selectedPhotoForCard]
      const photoUrl = selectedPhoto.replacedUrl || selectedPhoto.generatedUrl
      
      // Find HeartChime slide to get the message
      const heartchimeSlide = parsedPost.slides.find(s => s.type === 'heartchime_card')
      const cardMessage = heartchimeSlide?.cardMessage || 'Missing you today ❤️'

      const res = await fetch('/api/admin/social/ai-ugc/generate-card', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          photoUrl,
          message: cardMessage,
          manualCropUrl: manualCardCropUrl || undefined, // Pass manual crop if uploaded
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to generate card')
      }

      setFinalCardUrl(data.cardUrl)
      setCurrentStep('card')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setGeneratingCard(false)
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Edit handlers
  // ═══════════════════════════════════════════════════════════════════════════
  
  const handleUpdateCardMessage = (slideIndex: number, newMessage: string) => {
    if (!parsedPost) return
    const updatedSlides = [...parsedPost.slides]
    updatedSlides[slideIndex] = { ...updatedSlides[slideIndex], cardMessage: newMessage }
    setParsedPost({ ...parsedPost, slides: updatedSlides })
    setEditingCardMessage(null)
  }

  const handleUpdateContext = (slideIndex: number, newContext: string) => {
    if (!parsedPost) return
    const updatedSlides = [...parsedPost.slides]
    updatedSlides[slideIndex] = { ...updatedSlides[slideIndex], context: newContext }
    setParsedPost({ ...parsedPost, slides: updatedSlides })
    setEditingContext(null)
  }

  const handleUpdateSlideCaption = (slideIndex: number, newCaption: string) => {
    if (!parsedPost) return
    const updatedSlides = [...parsedPost.slides]
    updatedSlides[slideIndex] = { ...updatedSlides[slideIndex], caption: newCaption }
    setParsedPost({ ...parsedPost, slides: updatedSlides })
    setEditingCaption(null)
  }

  const handleUpdateEra = (slideIndex: number, newEra: string | null) => {
    if (!parsedPost) return
    const updatedSlides = [...parsedPost.slides]
    updatedSlides[slideIndex] = { ...updatedSlides[slideIndex], era: newEra }
    setParsedPost({ ...parsedPost, slides: updatedSlides })
    setEditingEra(null)
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Download all slides
  // ═══════════════════════════════════════════════════════════════════════════
  
  const handleDownloadAll = async () => {
    // Download all photos with a small delay between each
    for (const photo of generatedPhotos) {
      const url = photo.replacedUrl || photo.generatedUrl
      await downloadPhoto(url, `slide-${photo.slideNumber}.png`)
      // Small delay to avoid overwhelming the browser
      await new Promise(resolve => setTimeout(resolve, 300))
    }
    
    // Download card if exists
    if (finalCardUrl) {
      await downloadPhoto(finalCardUrl, 'heartchime-card.png')
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Save draft
  // ═══════════════════════════════════════════════════════════════════════════
  
  const handleSaveDraft = async () => {
    if (!selectedPersonaId || generatedPhotos.length === 0) return

    try {
      // Build final slides array
      const finalSlides = [
        ...generatedPhotos.map(p => ({
          slideNumber: p.slideNumber,
          type: p.type,
          generatedUrl: p.replacedUrl || p.generatedUrl,
          era: p.era,
          context: p.context,
        })),
        ...(finalCardUrl ? [{
          slideNumber: generatedPhotos.length + 1,
          type: 'heartchime_card',
          generatedUrl: finalCardUrl,
        }] : [])
      ]

      const res = await fetch('/api/admin/social/ai-ugc/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          persona_id: selectedPersonaId,
          platform,
          post_type: 'carousel',
          slides: finalSlides,
          caption,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to save post')
      }

      window.location.href = `/admin/social/ai-ugc/${selectedPersonaId}?tab=posts`
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════════

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0d1117] p-8">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-2 border-violet-500/30 border-t-violet-500 rounded-full animate-spin" />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0d1117] p-8">
      <div className="max-w-6xl mx-auto">
        {/* Hidden file input for photo replacement */}
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileSelected}
          accept="image/*"
          className="hidden"
        />
        
        {/* Hidden file input for manual card crop */}
        <input
          type="file"
          ref={cardCropInputRef}
          onChange={handleCardCropUpload}
          accept="image/*"
          className="hidden"
        />

        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <Link 
            href="/admin/social/ai-ugc"
            className="text-gray-500 hover:text-gray-300 transition-colors"
          >
            ← AI UGC
          </Link>
        </div>

        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-white flex items-center gap-3">
              <span className="text-4xl">✨</span>
              Post Builder
            </h1>
            <p className="text-gray-400 mt-1">
              Describe your post in natural language and we&apos;ll generate it
            </p>
          </div>
          
          {/* Step indicator */}
          <div className="flex items-center gap-2">
            {['input', 'edit', 'review', 'card'].map((step, index) => (
              <div key={step} className="flex items-center">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                  currentStep === step 
                    ? 'bg-violet-500 text-white' 
                    : index < ['input', 'edit', 'review', 'card'].indexOf(currentStep)
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/50'
                      : 'bg-gray-800 text-gray-500'
                }`}>
                  {index + 1}
                </div>
                {index < 3 && (
                  <div className={`w-8 h-0.5 ${
                    index < ['input', 'edit', 'review', 'card'].indexOf(currentStep)
                      ? 'bg-emerald-500/50'
                      : 'bg-gray-800'
                  }`} />
                )}
              </div>
            ))}
          </div>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 mb-6 text-red-400">
            {error}
            <button 
              onClick={() => setError(null)} 
              className="ml-4 text-red-300 hover:text-red-200"
            >
              ✕
            </button>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════════════ */}
        {/* STEP 1 & 2: INPUT & EDIT */}
        {/* ═══════════════════════════════════════════════════════════════════════════ */}
        
        {(currentStep === 'input' || currentStep === 'edit') && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Left Column - Input */}
            <div className="space-y-6">
              {/* Persona Selection */}
              <div className="bg-[#161b22] rounded-xl border border-gray-800 p-6">
                <h3 className="text-lg font-semibold text-white mb-4">1. Select Persona</h3>
                
                <select
                  value={selectedPersonaId}
                  onChange={(e) => setSelectedPersonaId(e.target.value)}
                  disabled={currentStep !== 'input'}
                  className="w-full bg-[#0d1117] border border-gray-700 rounded-lg px-4 py-3 text-white focus:border-violet-500 focus:outline-none disabled:opacity-50"
                >
                  <option value="">Choose a persona...</option>
                  {personas.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.age}yo) - {p.loved_ones?.[0]?.name || 'No loved one'}
                    </option>
                  ))}
                </select>

                {selectedPersona && (
                  <div className="mt-4 flex items-center gap-4 bg-[#0d1117] rounded-lg p-3">
                    <img
                      src={selectedPersona.master_photo_url}
                      alt={selectedPersona.name}
                      className="w-12 h-12 rounded-lg object-cover"
                    />
                    <div className="flex-1">
                      <p className="text-white font-medium">{selectedPersona.name}</p>
                      <p className="text-gray-400 text-sm">{selectedPersona.vibe || selectedPersona.job || 'No description'}</p>
                    </div>
                    {selectedLovedOne && (
                      <>
                        <div className="text-gray-600">+</div>
                        <img
                          src={selectedLovedOne.master_photo_url}
                          alt={selectedLovedOne.name}
                          className="w-12 h-12 rounded-lg object-cover"
                        />
                        <div>
                          <p className="text-white font-medium">{selectedLovedOne.name}</p>
                          <p className="text-gray-400 text-sm">{selectedLovedOne.relationship}</p>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* Slide 1 Selfie Settings */}
              <div className="bg-[#161b22] rounded-xl border border-gray-800 p-6">
                <h3 className="text-lg font-semibold text-white mb-4">2. First Slide Options</h3>
                
                <div className="mb-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input 
                      type="checkbox" 
                      checked={includeSelfie}
                      onChange={(e) => setIncludeSelfie(e.target.checked)}
                      disabled={currentStep !== 'input'}
                      className="rounded bg-[#0d1117] border-gray-600 text-violet-500 focus:ring-violet-500 disabled:opacity-50"
                    />
                    <span className="text-sm font-medium text-white">Include auto-generated Slide 1 selfie</span>
                  </label>
                  <p className="text-xs text-gray-500 mt-1 ml-6">
                    {includeSelfie 
                      ? 'Slide 1 will be auto-generated. Describe Slides 2+ below.'
                      : 'No auto selfie. Describe all slides including Slide 1 below.'
                    }
                  </p>
                </div>

                {includeSelfie && (
                  <>
                    <div className="flex gap-4 mb-4">
                      <div className="flex-1">
                        <label className="block text-xs text-gray-500 mb-1">Emotion</label>
                        <select 
                          value={selfieEmotion} 
                          onChange={(e) => setSelfieEmotion(e.target.value)}
                          disabled={currentStep !== 'input'}
                          className="w-full bg-[#0d1117] border border-gray-700 rounded-lg px-3 py-2 text-white focus:border-violet-500 focus:outline-none disabled:opacity-50"
                        >
                          {emotionOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                        </select>
                      </div>
                      <div className="flex-1">
                        <label className="block text-xs text-gray-500 mb-1">Setting</label>
                        <select 
                          value={selfieSetting} 
                          onChange={(e) => setSelfieSetting(e.target.value)}
                          disabled={currentStep !== 'input'}
                          className="w-full bg-[#0d1117] border border-gray-700 rounded-lg px-3 py-2 text-white focus:border-violet-500 focus:outline-none disabled:opacity-50"
                        >
                          {settingOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                        </select>
                      </div>
                    </div>
                    <p className="text-xs text-gray-400">
                      Slide 1 will be a selfie of {selectedPersona?.name || 'the persona'} with this expression and setting
                    </p>
                  </>
                )}
              </div>

              {/* Natural Language Input */}
              <div className="bg-[#161b22] rounded-xl border border-gray-800 p-6">
                <h3 className="text-lg font-semibold text-white mb-4">
                  {includeSelfie ? '3. Describe Slides 2+ (Natural Language)' : '3. Describe All Slides (Natural Language)'}
                </h3>
                
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={`Example: Slide 2: old photo of ${selectedPersona?.name || 'Linda'} and ${selectedLovedOne?.name || 'dad'} cooking together in the 90s. Slide 3: pot of pasta on stove. Slide 4: HeartChime card "Why do I still make enough pasta for two?" (Slide 1 selfie is auto-generated above)`}
                  rows={6}
                  disabled={currentStep !== 'input'}
                  className="w-full bg-[#0d1117] border border-gray-700 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:border-violet-500 focus:outline-none resize-none disabled:opacity-50"
                />

                {currentStep === 'input' && (
                  <button
                    onClick={handleParse}
                    disabled={parsing || !selectedPersonaId || !description.trim()}
                    className={`mt-4 w-full py-3 rounded-xl font-semibold transition-all flex items-center justify-center gap-2 ${
                      parsing || !selectedPersonaId || !description.trim()
                        ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
                        : 'bg-violet-500/20 text-violet-400 border border-violet-500/30 hover:bg-violet-500/30'
                    }`}
                  >
                    {parsing ? (
                      <>
                        <div className="w-4 h-4 border-2 border-violet-400/30 border-t-violet-400 rounded-full animate-spin" />
                        Parsing...
                      </>
                    ) : (
                      <>🧠 Parse Description</>
                    )}
                  </button>
                )}
              </div>

              {/* Parsed Slides Preview */}
              {parsedPost && currentStep === 'edit' && (
                <div className="bg-[#161b22] rounded-xl border border-gray-800 p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-white">
                      {includeSelfie ? '4. Edit Slides 2+' : '4. Edit Slides'}
                    </h3>
                    <span className="text-sm text-gray-400">
                      {parsedPost.slides.length} slides{includeSelfie ? ' (+ Slide 1 selfie)' : ''}
                    </span>
                  </div>

                  <div className="space-y-3">
                    {parsedPost.slides.map((slide, index) => (
                      <div
                        key={index}
                        className="bg-[#0d1117] rounded-lg p-4 border border-gray-700"
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            {/* Header row */}
                            <div className="flex items-center gap-2 mb-2">
                              <span className="text-violet-400 font-medium">Slide {slide.slideNumber}</span>
                              <span className={`text-xs px-2 py-0.5 rounded ${
                                slide.type === 'heartchime_card' ? 'bg-amber-500/20 text-amber-400' :
                                slide.type === 'together_photo' ? 'bg-rose-500/20 text-rose-400' :
                                slide.type === 'persona_photo' ? 'bg-violet-500/20 text-violet-400' :
                                slide.type === 'loved_one_photo' ? 'bg-blue-500/20 text-blue-400' :
                                'bg-gray-500/20 text-gray-400'
                              }`}>
                                {slide.type.replace('_', ' ')}
                              </span>
                              
                              {/* Editable Era */}
                              {slide.type !== 'heartchime_card' && (
                                editingEra === index ? (
                                  <select
                                    defaultValue={slide.era || ''}
                                    onChange={(e) => handleUpdateEra(index, e.target.value || null)}
                                    onBlur={(e) => handleUpdateEra(index, e.target.value || null)}
                                    className="text-xs bg-[#161b22] border border-gray-600 rounded px-1 py-0.5 text-white"
                                    autoFocus
                                  >
                                    <option value="">No era</option>
                                    <option value="1970s">1970s</option>
                                    <option value="1980s">1980s</option>
                                    <option value="1990s">1990s</option>
                                    <option value="2000s">2000s</option>
                                    <option value="2010s">2010s</option>
                                    <option value="2020s">2020s</option>
                                  </select>
                                ) : (
                                  <button
                                    onClick={() => setEditingEra(index)}
                                    className="text-xs text-gray-500 hover:text-gray-300 px-1"
                                  >
                                    {slide.era || '+ era'}
                                  </button>
                                )
                              )}
                            </div>

                            {/* Editable Context/Prompt */}
                            {slide.type !== 'heartchime_card' && (
                              <div className="mb-2">
                                {editingContext === index ? (
                                  <div className="flex items-start gap-2">
                                    <textarea
                                      defaultValue={slide.context || ''}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter' && !e.shiftKey) {
                                          e.preventDefault()
                                          handleUpdateContext(index, (e.target as HTMLTextAreaElement).value)
                                        }
                                      }}
                                      className="flex-1 bg-[#161b22] border border-gray-600 rounded px-2 py-1 text-sm text-white resize-none"
                                      rows={2}
                                      autoFocus
                                    />
                                    <button
                                      onClick={(e) => {
                                        const textarea = (e.target as HTMLElement).previousElementSibling as HTMLTextAreaElement
                                        handleUpdateContext(index, textarea.value)
                                      }}
                                      className="text-emerald-400 text-sm px-2"
                                    >
                                      ✓
                                    </button>
                                  </div>
                                ) : (
                                  <button
                                    onClick={() => setEditingContext(index)}
                                    className="text-gray-400 text-sm hover:text-gray-200 text-left w-full"
                                  >
                                    {slide.context || <span className="text-gray-600 italic">+ add scene description...</span>}
                                  </button>
                                )}
                              </div>
                            )}

                            {/* Warning for together photos in recent eras */}
                            {slide.type === 'together_photo' && (!slide.era || slide.era === '2010s' || slide.era === '2020s') && (
                              <div className="mt-2 bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2 text-amber-400 text-xs flex items-start gap-2">
                                <span className="text-amber-500">💡</span>
                                <span>Tip: Together photos work best in throwback eras (1980s-2000s). Recent eras may have less consistent faces.</span>
                              </div>
                            )}

                            {/* Card Message (HeartChime only) */}
                            {slide.type === 'heartchime_card' && (
                              <div className="mt-2">
                                {editingCardMessage === index ? (
                                  <div className="flex items-center gap-2">
                                    <input
                                      type="text"
                                      defaultValue={slide.cardMessage || ''}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                          handleUpdateCardMessage(index, (e.target as HTMLInputElement).value)
                                        }
                                      }}
                                      className="flex-1 bg-[#161b22] border border-gray-600 rounded px-2 py-1 text-sm text-white"
                                      autoFocus
                                    />
                                    <button
                                      onClick={(e) => {
                                        const input = (e.target as HTMLElement).previousElementSibling as HTMLInputElement
                                        handleUpdateCardMessage(index, input.value)
                                      }}
                                      className="text-emerald-400 text-sm"
                                    >
                                      ✓
                                    </button>
                                  </div>
                                ) : (
                                  <button
                                    onClick={() => setEditingCardMessage(index)}
                                    className="text-amber-400 text-sm hover:text-amber-300 flex items-center gap-1"
                                  >
                                    <span>✏️</span>
                                    {slide.cardMessage || 'Set card message...'}
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Caption Input */}
                  <div className="mt-4 pt-4 border-t border-gray-700">
                    <label className="text-sm text-gray-400 mb-2 block">Post Caption</label>
                    <textarea
                      value={caption}
                      onChange={(e) => setCaption(e.target.value)}
                      placeholder="Enter the caption that will appear on the post..."
                      rows={3}
                      className="w-full bg-[#0d1117] border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-500 text-sm focus:border-violet-500 focus:outline-none resize-none"
                    />
                  </div>

                  {/* Platform Selection */}
                  <div className="mt-4 flex items-center gap-4">
                    <label className="text-sm text-gray-400">Platform:</label>
                    <div className="flex items-center gap-2">
                      {(['instagram', 'tiktok', 'both'] as Platform[]).map((p) => (
                        <button
                          key={p}
                          onClick={() => setPlatform(p)}
                          className={`px-3 py-1 rounded-lg text-sm transition-all ${
                            platform === p
                              ? 'bg-violet-500/20 text-violet-400 border border-violet-500/50'
                              : 'bg-[#0d1117] text-gray-400 border border-gray-700 hover:border-gray-600'
                          }`}
                        >
                          {p === 'both' ? 'Both' : p.charAt(0).toUpperCase() + p.slice(1)}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Generate Photos Button */}
                  <button
                    onClick={handleGeneratePhotos}
                    disabled={generatingPhotos}
                    className={`mt-6 w-full py-4 rounded-xl font-semibold text-lg transition-all flex items-center justify-center gap-3 ${
                      generatingPhotos
                        ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
                        : 'bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white hover:from-violet-600 hover:to-fuchsia-600 shadow-lg shadow-violet-500/20'
                    }`}
                  >
                    {generatingPhotos ? (
                      <>
                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Generating photos...
                      </>
                    ) : (
                      <>
                        <span>📸</span>
                        Generate Photos
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>

            {/* Right Column - Preview placeholder */}
            <div className="bg-[#161b22] rounded-xl border border-gray-800 p-6 h-fit sticky top-8">
              <h3 className="text-lg font-semibold text-white mb-4">Preview</h3>
              <div className="aspect-[9/16] rounded-xl bg-[#0d1117] flex items-center justify-center">
                <div className="text-center px-8">
                  <div className="text-6xl mb-4 opacity-50">✨</div>
                  <p className="text-gray-500">
                    {currentStep === 'input' 
                      ? "Describe your post and click \"Parse Description\" to get started"
                      : "Edit your slides and click \"Generate Photos\" to continue"
                    }
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════════════ */}
        {/* STEP 3: PHOTO REVIEW */}
        {/* ═══════════════════════════════════════════════════════════════════════════ */}
        
        {currentStep === 'review' && (
          <div className="space-y-6">
            <div className="bg-[#161b22] rounded-xl border border-gray-800 p-6">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="text-xl font-semibold text-white">📸 Photo Review</h3>
                  <p className="text-gray-400 text-sm mt-1">
                    Review your generated photos. Select one to use for the HeartChime card.
                  </p>
                </div>
                <button
                  onClick={() => {
                    setCurrentStep('edit')
                    setManualCardCropUrl(null) // Reset manual crop when going back
                  }}
                  className="text-gray-400 hover:text-gray-300 text-sm"
                >
                  ← Back to Edit
                </button>
              </div>

              {/* Photo Grid */}
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {generatedPhotos.map((photo, index) => {
                  const displayUrl = photo.replacedUrl || photo.generatedUrl
                  const isSelected = selectedPhotoForCard === index
                  
                  return (
                    <div
                      key={index}
                      className={`relative group rounded-xl overflow-hidden border-2 transition-all ${
                        isSelected 
                          ? 'border-amber-500 shadow-lg shadow-amber-500/20' 
                          : 'border-gray-700 hover:border-gray-600'
                      }`}
                    >
                      {/* Image */}
                      <div className="aspect-[9/16] bg-[#0d1117]">
                        <img
                          src={displayUrl}
                          alt={`Slide ${photo.slideNumber}`}
                          className="w-full h-full object-cover"
                        />
                      </div>

                      {/* Overlay info */}
                      <div className="absolute top-0 left-0 right-0 p-2 bg-gradient-to-b from-black/70 to-transparent">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="w-6 h-6 bg-black/60 rounded-full flex items-center justify-center text-white text-xs font-medium">
                              {photo.slideNumber}
                            </span>
                            <span className={`text-xs px-2 py-0.5 rounded ${
                              photo.type === 'together_photo' ? 'bg-rose-500/60 text-white' :
                              photo.type === 'persona_photo' ? 'bg-violet-500/60 text-white' :
                              photo.type === 'loved_one_photo' ? 'bg-blue-500/60 text-white' :
                              'bg-gray-500/60 text-white'
                            }`}>
                              {photo.type.replace('_', ' ')}
                            </span>
                          </div>
                          {photo.replacedUrl && (
                            <span className="text-xs bg-emerald-500/60 text-white px-2 py-0.5 rounded">
                              Replaced
                            </span>
                          )}
                        </div>
                        {photo.era && (
                          <span className="text-xs text-gray-300 mt-1 block">{photo.era}</span>
                        )}
                      </div>

                      {/* Selected indicator */}
                      {isSelected && (
                        <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-amber-500/80 to-transparent">
                          <div className="flex items-center justify-center gap-1 text-white text-sm font-medium">
                            <span>🎴</span> Using for Card
                          </div>
                        </div>
                      )}

                      {/* Action buttons - show on hover */}
                      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2">
                        {/* Select for card radio */}
                        <button
                          onClick={() => {
                            if (selectedPhotoForCard !== index) {
                              setManualCardCropUrl(null) // Clear manual crop when changing selection
                            }
                            setSelectedPhotoForCard(index)
                          }}
                          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                            isSelected
                              ? 'bg-amber-500 text-white'
                              : 'bg-white/20 text-white hover:bg-white/30'
                          }`}
                        >
                          {isSelected ? '✓ Selected for Card' : 'Use for Card'}
                        </button>

                        {/* Retry with prompt button */}
                        <button
                          onClick={() => openRetryModal(index)}
                          className="px-4 py-2 rounded-lg text-sm font-medium bg-violet-500/80 text-white hover:bg-violet-500"
                        >
                          🔁 Retry with Prompt
                        </button>

                        {/* Replace button */}
                        <button
                          onClick={() => handleReplacePhoto(index)}
                          className="px-4 py-2 rounded-lg text-sm font-medium bg-white/20 text-white hover:bg-white/30"
                        >
                          📁 Upload Replacement
                        </button>

                        {/* Download button */}
                        <button
                          onClick={() => downloadPhoto(displayUrl, `slide-${photo.slideNumber}.png`)}
                          className="px-4 py-2 rounded-lg text-sm font-medium bg-white/20 text-white hover:bg-white/30"
                        >
                          ⬇️ Download
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Manual Card Crop Section - shown when a photo is selected */}
              {selectedPhotoForCard !== null && (
                <div className="mt-6 bg-[#0d1117] rounded-xl p-4 border border-gray-700">
                  <div className="flex items-start gap-4">
                    {/* Left: Selected photo preview */}
                    <div className="flex-shrink-0">
                      <p className="text-sm text-gray-400 mb-2">Selected for card:</p>
                      <div className="w-24 h-32 rounded-lg overflow-hidden bg-gray-800">
                        <img
                          src={generatedPhotos[selectedPhotoForCard]?.replacedUrl || generatedPhotos[selectedPhotoForCard]?.generatedUrl}
                          alt="Selected"
                          className="w-full h-full object-cover"
                        />
                      </div>
                    </div>
                    
                    {/* Middle: Manual crop upload */}
                    <div className="flex-1">
                      <p className="text-sm text-gray-400 mb-2">
                        Manual horizontal crop (5:4):
                        <span className="text-gray-600 ml-1">optional</span>
                      </p>
                      
                      {manualCardCropUrl ? (
                        <div className="flex items-center gap-3">
                          <div className="w-32 h-24 rounded-lg overflow-hidden bg-gray-800 border-2 border-emerald-500/50">
                            <img
                              src={manualCardCropUrl}
                              alt="Manual crop"
                              className="w-full h-full object-cover"
                            />
                          </div>
                          <div className="flex flex-col gap-2">
                            <span className="text-xs text-emerald-400">✓ Custom crop uploaded</span>
                            <button
                              onClick={() => cardCropInputRef.current?.click()}
                              className="text-xs text-gray-400 hover:text-gray-300"
                            >
                              Replace
                            </button>
                            <button
                              onClick={() => setManualCardCropUrl(null)}
                              className="text-xs text-red-400 hover:text-red-300"
                            >
                              Remove
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          onClick={() => cardCropInputRef.current?.click()}
                          disabled={uploadingCardCrop}
                          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
                            uploadingCardCrop
                              ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
                              : 'bg-amber-500/20 text-amber-400 border border-amber-500/30 hover:bg-amber-500/30'
                          }`}
                        >
                          {uploadingCardCrop ? (
                            <>
                              <div className="w-4 h-4 border-2 border-amber-400/30 border-t-amber-400 rounded-full animate-spin" />
                              Uploading...
                            </>
                          ) : (
                            <>
                              📐 Upload Horizontal Crop (5:4)
                            </>
                          )}
                        </button>
                      )}
                      
                      <p className="text-xs text-gray-600 mt-2">
                        {manualCardCropUrl 
                          ? 'This crop will be used for the HeartChime card instead of auto-cropping.'
                          : 'Without a manual crop, the center of the 9:16 photo will be auto-cropped to 5:4.'
                        }
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Continue button */}
              <div className="mt-8 flex items-center justify-between">
                <p className="text-gray-400 text-sm">
                  {selectedPhotoForCard !== null 
                    ? `Photo ${generatedPhotos[selectedPhotoForCard]?.slideNumber} will be used for the HeartChime card${manualCardCropUrl ? ' (with manual crop)' : ''}`
                    : 'Select a photo to use for the HeartChime card'
                  }
                </p>
                <button
                  onClick={handleGenerateCard}
                  disabled={selectedPhotoForCard === null || generatingCard}
                  className={`px-8 py-3 rounded-xl font-semibold transition-all flex items-center gap-3 ${
                    selectedPhotoForCard === null || generatingCard
                      ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
                      : 'bg-gradient-to-r from-amber-500 to-orange-500 text-white hover:from-amber-600 hover:to-orange-600 shadow-lg shadow-amber-500/20'
                  }`}
                >
                  {generatingCard ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Generating Card...
                    </>
                  ) : (
                    <>
                      <span>🎴</span>
                      Generate HeartChime Card
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════════════ */}
        {/* STEP 4: FINAL PREVIEW WITH CARD */}
        {/* ═══════════════════════════════════════════════════════════════════════════ */}
        
        {currentStep === 'card' && (
          <div className="space-y-6">
            <div className="bg-[#161b22] rounded-xl border border-gray-800 p-6">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="text-xl font-semibold text-white">✅ Final Preview</h3>
                  <p className="text-gray-400 text-sm mt-1">
                    Your post is ready! Download all slides or save as draft.
                  </p>
                </div>
                <button
                  onClick={() => setCurrentStep('review')}
                  className="text-gray-400 hover:text-gray-300 text-sm"
                >
                  ← Back to Review
                </button>
              </div>

              {/* All Slides Grid */}
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                {/* Photo slides */}
                {generatedPhotos.map((photo, index) => {
                  const displayUrl = photo.replacedUrl || photo.generatedUrl
                  
                  return (
                    <div key={index} className="relative group">
                      <div className="aspect-[9/16] rounded-lg overflow-hidden bg-[#0d1117]">
                        <img
                          src={displayUrl}
                          alt={`Slide ${photo.slideNumber}`}
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div className="absolute top-2 left-2 w-6 h-6 bg-black/60 rounded-full flex items-center justify-center text-white text-xs font-medium">
                        {photo.slideNumber}
                      </div>
                    </div>
                  )
                })}

                {/* HeartChime card */}
                {finalCardUrl && (
                  <div className="relative group">
                    <div className="aspect-[9/16] rounded-lg overflow-hidden bg-[#0d1117] border-2 border-amber-500/50">
                      <img
                        src={finalCardUrl}
                        alt="HeartChime Card"
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="absolute top-2 left-2 w-6 h-6 bg-amber-500 rounded-full flex items-center justify-center text-white text-xs font-medium">
                      {generatedPhotos.length + 1}
                    </div>
                  </div>
                )}
              </div>

              {/* Caption Preview */}
              {caption && (
                <div className="mt-6 bg-[#0d1117] rounded-lg p-4">
                  <p className="text-sm text-gray-400 mb-1">Caption:</p>
                  <p className="text-white text-sm">{caption}</p>
                </div>
              )}

              {/* Action Buttons */}
              <div className="mt-8 flex items-center gap-4">
                <button
                  onClick={handleDownloadAll}
                  className="flex-1 py-3 bg-gray-800 text-white rounded-xl font-medium hover:bg-gray-700 transition-colors flex items-center justify-center gap-2"
                >
                  ⬇️ Download All ({generatedPhotos.length + (finalCardUrl ? 1 : 0)} slides)
                </button>
                <button
                  onClick={handleSaveDraft}
                  className="flex-1 py-3 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-xl font-medium hover:bg-emerald-500/30 transition-colors flex items-center justify-center gap-2"
                >
                  💾 Save Draft
                </button>
              </div>

              <button
                onClick={() => {
                  alert('Post marked as ready! In a full implementation, this would update the status.')
                }}
                className="mt-4 w-full py-4 bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white rounded-xl font-semibold hover:from-violet-600 hover:to-fuchsia-600 transition-colors"
              >
                ✅ Mark Ready to Post
              </button>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════════════ */}
        {/* RETRY PHOTO MODAL */}
        {/* ═══════════════════════════════════════════════════════════════════════════ */}
        
        {retryingPhotoIndex !== null && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
            <div className="bg-[#161b22] rounded-xl border border-gray-700 max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
              {/* Modal Header */}
              <div className="flex items-center justify-between p-4 border-b border-gray-700">
                <div>
                  <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                    <span>🔁</span>
                    Retry Photo Generation
                  </h3>
                  <p className="text-gray-400 text-sm mt-1">
                    Edit the prompt below and regenerate the photo
                  </p>
                </div>
                <button
                  onClick={closeRetryModal}
                  className="text-gray-400 hover:text-white text-2xl leading-none"
                >
                  ×
                </button>
              </div>

              {/* Modal Body */}
              <div className="flex-1 overflow-auto p-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Current Photo Preview */}
                  <div>
                    <label className="text-sm text-gray-400 mb-2 block">Current Photo</label>
                    <div className="aspect-[9/16] rounded-lg overflow-hidden bg-[#0d1117]">
                      <img
                        src={generatedPhotos[retryingPhotoIndex]?.replacedUrl || generatedPhotos[retryingPhotoIndex]?.generatedUrl}
                        alt="Current photo"
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <span className={`text-xs px-2 py-0.5 rounded ${
                        generatedPhotos[retryingPhotoIndex]?.type === 'together_photo' ? 'bg-rose-500/20 text-rose-400' :
                        generatedPhotos[retryingPhotoIndex]?.type === 'persona_photo' ? 'bg-violet-500/20 text-violet-400' :
                        generatedPhotos[retryingPhotoIndex]?.type === 'loved_one_photo' ? 'bg-blue-500/20 text-blue-400' :
                        'bg-gray-500/20 text-gray-400'
                      }`}>
                        {generatedPhotos[retryingPhotoIndex]?.type.replace('_', ' ')}
                      </span>
                      {generatedPhotos[retryingPhotoIndex]?.era && (
                        <span className="text-xs text-gray-400">{generatedPhotos[retryingPhotoIndex]?.era}</span>
                      )}
                    </div>
                  </div>

                  {/* Prompt Editor */}
                  <div className="flex flex-col">
                    <label className="text-sm text-gray-400 mb-2 block">
                      Edit Prompt
                      <span className="text-gray-600 ml-2">(scene description)</span>
                    </label>
                    <textarea
                      value={retryPrompt}
                      onChange={(e) => setRetryPrompt(e.target.value)}
                      placeholder="Describe the scene..."
                      rows={8}
                      className="flex-1 bg-[#0d1117] border border-gray-700 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:border-violet-500 focus:outline-none resize-none font-mono text-sm"
                    />
                    
                    {/* Original prompt reference */}
                    {generatedPhotos[retryingPhotoIndex]?.prompt && (
                      <div className="mt-4">
                        <button
                          onClick={() => setRetryPrompt(generatedPhotos[retryingPhotoIndex]?.prompt || '')}
                          className="text-xs text-violet-400 hover:text-violet-300 mb-2"
                        >
                          ↺ Reset to original full prompt
                        </button>
                        <details className="text-xs">
                          <summary className="text-gray-500 cursor-pointer hover:text-gray-400">
                            View original full prompt
                          </summary>
                          <pre className="mt-2 p-3 bg-[#0d1117] rounded-lg text-gray-400 whitespace-pre-wrap overflow-auto max-h-40 font-mono">
                            {generatedPhotos[retryingPhotoIndex]?.prompt}
                          </pre>
                        </details>
                      </div>
                    )}

                    <p className="text-xs text-gray-500 mt-3">
                      💡 Tip: The prompt will be combined with era-specific camera types, lighting, and artifacts automatically.
                    </p>
                  </div>
                </div>
              </div>

              {/* Modal Footer */}
              <div className="flex items-center justify-end gap-3 p-4 border-t border-gray-700">
                <button
                  onClick={closeRetryModal}
                  className="px-4 py-2 text-gray-400 hover:text-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleRetryPhoto}
                  disabled={regenerating || !retryPrompt.trim()}
                  className={`px-6 py-2 rounded-lg font-medium transition-all flex items-center gap-2 ${
                    regenerating || !retryPrompt.trim()
                      ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
                      : 'bg-violet-500 text-white hover:bg-violet-600'
                  }`}
                >
                  {regenerating ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Regenerating...
                    </>
                  ) : (
                    <>
                      🔁 Regenerate Photo
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
