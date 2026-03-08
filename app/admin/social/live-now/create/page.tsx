'use client'

import { useState, useEffect, useMemo, Suspense } from 'react'
import { createClient } from '@supabase/supabase-js'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import HeartchimePreviewCard from '@/app/admin/components/HeartchimePreviewCard'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// ===========================================
// TYPES
// ===========================================

interface Hook {
  id: string
  text: string
  category: string
  text_style: 'snapchat' | 'clean'
  times_used: number
}

type TextStyle = 'snapchat' | 'clean'

// Selfie generation types
type SelfieGender = 'male' | 'female'
type SelfieEthnicity = 'white' | 'black' | 'hispanic' | 'asian' | 'middle eastern' | 'south asian' | 'mixed'
type SelfieAngle = 'from below' | 'straight on' | 'from above' | 'side tilt'
type SelfieEmotion = 'neutral' | 'slight smile' | 'bittersweet' | 'sad' | 'hopeful' | 'tired' | 'peaceful'
type SelfieGaze = 'looking at camera' | 'looking away' | 'eyes down' | 'looking off to side'
type SelfieSetting = 'home' | 'car' | 'outside' | 'office'

// ===========================================
// CONSTANTS
// ===========================================

const RELATIONSHIPS = [
  'grandmother', 'grandfather',
  'mother', 'father',
  'aunt', 'uncle',
  'sister', 'brother',
  'spouse',
  'son', 'daughter',
  'friend'
]

const TIME_PERIODS = [
  '1940s', '1950s', '1960s', '1970s', '1980s', '1990s', '2000s', '2010s', '2020s'
]

// Selfie option arrays
const ETHNICITIES: { value: SelfieEthnicity; label: string }[] = [
  { value: 'white', label: 'White' },
  { value: 'black', label: 'Black' },
  { value: 'hispanic', label: 'Hispanic' },
  { value: 'asian', label: 'Asian' },
  { value: 'middle eastern', label: 'Middle Eastern' },
  { value: 'south asian', label: 'South Asian' },
  { value: 'mixed', label: 'Mixed' },
]

const ANGLES: { value: SelfieAngle; label: string }[] = [
  { value: 'from below', label: 'From Below' },
  { value: 'straight on', label: 'Straight On' },
  { value: 'from above', label: 'From Above' },
  { value: 'side tilt', label: 'Side Tilt' },
]

const EMOTIONS: { value: SelfieEmotion; label: string }[] = [
  { value: 'neutral', label: 'Neutral' },
  { value: 'slight smile', label: 'Slight Smile' },
  { value: 'bittersweet', label: 'Bittersweet' },
  { value: 'sad', label: 'Sad' },
  { value: 'hopeful', label: 'Hopeful' },
  { value: 'tired', label: 'Tired' },
  { value: 'peaceful', label: 'Peaceful' },
]

const GAZES: { value: SelfieGaze; label: string }[] = [
  { value: 'looking at camera', label: 'At Camera' },
  { value: 'looking away', label: 'Looking Away' },
  { value: 'eyes down', label: 'Eyes Down' },
  { value: 'looking off to side', label: 'Off to Side' },
]

const SETTINGS: { value: SelfieSetting; label: string }[] = [
  { value: 'home', label: 'Home' },
  { value: 'car', label: 'Car' },
  { value: 'outside', label: 'Outside' },
  { value: 'office', label: 'Office' },
]

// ===========================================
// MAIN COMPONENT (wrapped in Suspense)
// ===========================================

function CreateLiveNowPostContent() {
  const router = useRouter()
  const searchParams = useSearchParams()

  // Get trend data from URL params (if any)
  const trendKeywordParam = searchParams.get('keyword') || ''
  const trendAngleParam = searchParams.get('angle') || ''
  const trendIdParam = searchParams.get('trend_id') || ''
  const whyTrendingParam = searchParams.get('why_trending') || ''

  // Determine if we're in manual mode (no URL params)
  const isManualMode = !trendKeywordParam

  // Data from database
  const [hooks, setHooks] = useState<Hook[]>([])
  const [loading, setLoading] = useState(true)

  // Selfie generation state
  const [selfieAge, setSelfieAge] = useState<number>(35)
  const [selfieGender, setSelfieGender] = useState<SelfieGender>('female')
  const [selfieEthnicity, setSelfieEthnicity] = useState<SelfieEthnicity>('white')
  const [selfieAngle, setSelfieAngle] = useState<SelfieAngle>('straight on')
  const [selfieEmotion, setSelfieEmotion] = useState<SelfieEmotion>('bittersweet')
  const [selfieGaze, setSelfieGaze] = useState<SelfieGaze>('looking at camera')
  const [selfieSetting, setSelfieSetting] = useState<SelfieSetting>('home')
  const [selfieUrl, setSelfieUrl] = useState<string | null>(null)
  const [isGeneratingSelfie, setIsGeneratingSelfie] = useState(false)

  // Form state - Manual mode fields
  const [manualTopic, setManualTopic] = useState('')
  const [manualContext, setManualContext] = useState('')
  const [manualCaption, setManualCaption] = useState('')
  const [manualPhotoPrompt, setManualPhotoPrompt] = useState('')

  // Slide 3 state (optional media slide)
  const [includeSlide3, setIncludeSlide3] = useState(false)
  const [slide3Type, setSlide3Type] = useState<'album_art' | 'movie_poster'>('album_art')
  const [slide3ImageUrl, setSlide3ImageUrl] = useState('')
  const [slide3Title, setSlide3Title] = useState('')
  const [slide3Artist, setSlide3Artist] = useState('')

  // Form state - Common fields
  const [relationship, setRelationship] = useState<string>('')
  const [nickname, setNickname] = useState<string>('')
  const [timePeriod, setTimePeriod] = useState<string>('1990s')
  const [peopleOverride, setPeopleOverride] = useState<string>('')
  const [textStyle, setTextStyle] = useState<TextStyle>('snapchat')
  const [selectedHookId, setSelectedHookId] = useState<string | null>(null)
  const [customHookText, setCustomHookText] = useState<string>(
    trendAngleParam ? decodeURIComponent(trendAngleParam) : ''
  )
  const [photoHint, setPhotoHint] = useState<string>('')

  // Generation state
  const [isGenerating, setIsGenerating] = useState(false)
  const [activeSlide, setActiveSlide] = useState(0)

  // Platform
  const [platforms, setPlatforms] = useState({ tiktok: true, instagram: true })

  // Toast
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)

  // ===========================================
  // DATA FETCHING
  // ===========================================

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    setLoading(true)
    try {
      const hooksRes = await supabase
        .from('social_hooks')
        .select('*')
        .order('times_used', { ascending: true })

      if (hooksRes.data) setHooks(hooksRes.data)
    } catch (error) {
      console.error('Error fetching data:', error)
    } finally {
      setLoading(false)
    }
  }

  // ===========================================
  // COMPUTED VALUES
  // ===========================================

  const filteredHooks = useMemo(() => {
    return hooks.filter(h => h.text_style === textStyle).slice(0, 6)
  }, [hooks, textStyle])

  const activeHookText = useMemo(() => {
    if (customHookText.trim()) return customHookText
    const selectedHook = hooks.find(h => h.id === selectedHookId)
    return selectedHook?.text || ''
  }, [customHookText, selectedHookId, hooks])

  // Different validation for manual vs trend mode
  const canGenerate = useMemo(() => {
    const commonFieldsValid = selfieUrl && relationship && timePeriod && activeHookText

    // If Slide 3 is enabled, require the image URL and title
    const slide3Valid = !includeSlide3 || (slide3ImageUrl.trim() && slide3Title.trim())

    if (isManualMode) {
      // Manual mode requires topic, caption, and photo prompt
      return commonFieldsValid && manualTopic.trim() && manualCaption.trim() && manualPhotoPrompt.trim() && slide3Valid
    } else {
      // Trend mode requires photo hint
      return commonFieldsValid && photoHint.trim() && slide3Valid
    }
  }, [selfieUrl, relationship, timePeriod, activeHookText, photoHint, isManualMode, manualTopic, manualCaption, manualPhotoPrompt, includeSlide3, slide3ImageUrl, slide3Title])

  // Get the effective topic/keyword
  const effectiveTopic = isManualMode ? manualTopic : trendKeywordParam

  // ===========================================
  // HANDLERS
  // ===========================================

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 4000)
  }

  // Generate selfie
  const handleGenerateSelfie = async () => {
    setIsGeneratingSelfie(true)
    try {
      const response = await fetch('/api/admin/social/generate-selfie', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          age: selfieAge,
          gender: selfieGender,
          ethnicity: selfieEthnicity,
          angle: selfieAngle,
          emotion: selfieEmotion,
          gaze: selfieGaze,
          setting: selfieSetting,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to generate selfie')
      }

      const data = await response.json()
      setSelfieUrl(data.selfieUrl)
      showToast('Selfie generated!', 'success')
    } catch (error) {
      console.error('Error generating selfie:', error)
      showToast(error instanceof Error ? error.message : 'Failed to generate selfie', 'error')
    } finally {
      setIsGeneratingSelfie(false)
    }
  }

  const handleGenerate = async () => {
    if (!canGenerate || !selfieUrl) return

    setIsGenerating(true)
    try {
      const platformValue = platforms.tiktok && platforms.instagram
        ? 'both'
        : platforms.tiktok
          ? 'tiktok'
          : 'instagram'

      const response = await fetch('/api/admin/social/generate-live-now-post', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          selfieUrl,
          relationship,
          nickname: nickname || relationship,
          hookText: activeHookText,
          hookStyle: textStyle,
          platform: platformValue,
          timePeriod,
          ...(peopleOverride && { peopleOverride }),
          // Use manual fields if in manual mode, otherwise use trend data
          photoHint: isManualMode ? manualPhotoPrompt : photoHint,
          trendKeyword: effectiveTopic,
          trendId: trendIdParam || null,
          whyTrending: isManualMode ? manualContext : (whyTrendingParam ? decodeURIComponent(whyTrendingParam) : ''),
          suggestedAngle: isManualMode ? '' : (trendAngleParam ? decodeURIComponent(trendAngleParam) : ''),
          // Manual mode specific
          isManualMode,
          manualCaption: isManualMode ? manualCaption : undefined,
          // Slide 3 (optional)
          includeSlide3,
          slide3Type: includeSlide3 ? slide3Type : undefined,
          slide3ImageUrl: includeSlide3 ? slide3ImageUrl : undefined,
          slide3Title: includeSlide3 ? slide3Title : undefined,
          slide3Artist: includeSlide3 ? slide3Artist : undefined,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to generate post')
      }

      const data = await response.json()

      if (!data.success) {
        throw new Error(data.error || 'Failed to generate post')
      }

      showToast('Post generated! Redirecting...', 'success')

      // Redirect to post detail page
      setTimeout(() => {
        router.push(`/admin/social/live-now/${data.post.id}`)
      }, 1000)

    } catch (error) {
      console.error('Error generating post:', error)
      showToast(error instanceof Error ? error.message : 'Failed to generate post', 'error')
    } finally {
      setIsGenerating(false)
    }
  }

  // ===========================================
  // RENDER
  // ===========================================

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 p-6 flex items-center justify-center">
        <div className="text-gray-400">Loading...</div>
      </div>
    )
  }

  return (
    <div className="p-6 lg:p-8 space-y-6">
      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg ${
          toast.type === 'success' ? 'bg-emerald-600' : 'bg-red-600'
        } text-white font-medium flex items-center gap-2`}>
          {toast.type === 'success' ? (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          ) : (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          )}
          {toast.message}
        </div>
      )}

      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Link href="/admin/social" className="text-gray-400 hover:text-white text-sm">
            Social Command Center
          </Link>
          <span className="text-gray-600">/</span>
          <Link href="/admin/social/live-now" className="text-gray-400 hover:text-white text-sm">
            Live Now
          </Link>
          <span className="text-gray-600">/</span>
          <span className="text-gray-300 text-sm">Create Post</span>
        </div>
        <div className="flex items-center gap-3">
          <h1 className="text-3xl font-bold text-white">
            {isManualMode ? '✏️ Create Manual Post' : '⚡ Create Live Now Post'}
          </h1>
          {isManualMode && (
            <span className="px-3 py-1 bg-emerald-500/20 text-emerald-400 text-xs font-medium rounded-full border border-emerald-500/30">
              Manual Mode
            </span>
          )}
        </div>
        <p className="text-gray-400 mt-1">
          {isManualMode 
            ? 'Create a custom post with your own topic and content'
            : 'Create a trending-topic post for TikTok/Instagram'
          }
        </p>
      </div>

      {/* Trend Context Banner - Only show if NOT manual mode */}
      {!isManualMode && trendKeywordParam && (
        <div className="bg-gradient-to-r from-amber-500/20 to-orange-500/20 border border-amber-500/30 rounded-2xl p-6">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-full bg-amber-500/30 flex items-center justify-center flex-shrink-0">
              <span className="text-2xl">📈</span>
            </div>
            <div className="flex-1">
              <h2 className="text-xl font-bold text-white mb-1">{trendKeywordParam}</h2>
              {whyTrendingParam && (
                <p className="text-amber-200/80 text-sm mb-2">{decodeURIComponent(whyTrendingParam)}</p>
              )}
              {trendAngleParam && (
                <div className="mt-2 bg-black/20 rounded-lg p-3">
                  <p className="text-xs text-amber-400/70 mb-1">💡 Suggested Angle:</p>
                  <p className="text-amber-100 text-sm">{decodeURIComponent(trendAngleParam)}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Two-column layout */}
      <div className="flex gap-6">
        {/* Left Column - Form */}
        <div className="flex-1 max-w-[60%] space-y-6">

          {/* MANUAL MODE: Topic & Content Section */}
          {isManualMode && (
            <div className="bg-[#1a1f2e] rounded-2xl border border-gray-800/50 p-6">
              <div className="flex items-center gap-2 mb-4">
                <span className="w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-400 text-xs font-bold flex items-center justify-center">1</span>
                <h2 className="text-lg font-semibold text-white">Topic & Content</h2>
              </div>

              <div className="space-y-4">
                {/* Topic */}
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-2">
                    Topic *
                    <span className="text-gray-500 font-normal ml-2">What is this post about?</span>
                  </label>
                  <input
                    type="text"
                    value={manualTopic}
                    onChange={(e) => setManualTopic(e.target.value)}
                    placeholder="e.g., Catherine O'Hara, Super Bowl LVIII, Taylor Swift Grammys"
                    className="w-full px-4 py-3 bg-[#0f1419] border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                  />
                </div>

                {/* Context / Why it matters */}
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-2">
                    Why it matters
                    <span className="text-gray-500 font-normal ml-2">Brief context for the topic</span>
                  </label>
                  <textarea
                    value={manualContext}
                    onChange={(e) => setManualContext(e.target.value)}
                    placeholder="e.g., Home Alone and Schitt's Creek star is trending after her Golden Globes appearance"
                    rows={2}
                    className="w-full px-4 py-3 bg-[#0f1419] border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 resize-none"
                  />
                </div>

                {/* HeartChime Caption */}
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-2">
                    HeartChime Caption *
                    <span className="text-gray-500 font-normal ml-2">The text on the HeartChime card (Slide 2)</span>
                  </label>
                  <textarea
                    value={manualCaption}
                    onChange={(e) => setManualCaption(e.target.value)}
                    placeholder="e.g., Grandma would have loved watching this with you. Her laughter still echoes in your memory. 💕"
                    rows={3}
                    className="w-full px-4 py-3 bg-[#0f1419] border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 resize-none"
                  />
                </div>

                {/* Photo Prompt */}
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-2">
                    Photo Prompt *
                    <span className="text-gray-500 font-normal ml-2">Describe the vintage photo to generate</span>
                  </label>
                  <textarea
                    value={manualPhotoPrompt}
                    onChange={(e) => setManualPhotoPrompt(e.target.value)}
                    placeholder="e.g., Grandmother and grandchild laughing together while watching Home Alone on an old TV in the living room, Christmas decorations visible"
                    rows={3}
                    className="w-full px-4 py-3 bg-[#0f1419] border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 resize-none"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    The AI will generate a vintage-style family photo based on this description
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Section: Generate Selfie */}
          <div className="bg-[#1a1f2e] rounded-2xl border border-gray-800/50 p-6">
            <div className="flex items-center gap-2 mb-4">
              <span className={`w-6 h-6 rounded-full ${isManualMode ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'} text-xs font-bold flex items-center justify-center`}>
                {isManualMode ? '2' : '1'}
              </span>
              <h2 className="text-lg font-semibold text-white">Generate Selfie (Slide 1)</h2>
            </div>

            <div className="grid grid-cols-4 gap-4 mb-4">
              {/* Age */}
              <div>
                <label className="block text-sm text-gray-400 mb-2">Age</label>
                <input
                  type="number"
                  min={18}
                  max={80}
                  value={selfieAge}
                  onChange={(e) => setSelfieAge(Number(e.target.value))}
                  className="w-full px-4 py-3 bg-[#0f1419] border border-gray-700 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                />
              </div>

              {/* Gender */}
              <div>
                <label className="block text-sm text-gray-400 mb-2">Gender</label>
                <select
                  value={selfieGender}
                  onChange={(e) => setSelfieGender(e.target.value as SelfieGender)}
                  className="w-full px-4 py-3 bg-[#0f1419] border border-gray-700 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                >
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                </select>
              </div>

              {/* Ethnicity */}
              <div>
                <label className="block text-sm text-gray-400 mb-2">Ethnicity</label>
                <select
                  value={selfieEthnicity}
                  onChange={(e) => setSelfieEthnicity(e.target.value as SelfieEthnicity)}
                  className="w-full px-4 py-3 bg-[#0f1419] border border-gray-700 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                >
                  {ETHNICITIES.map((eth) => (
                    <option key={eth.value} value={eth.value}>{eth.label}</option>
                  ))}
                </select>
              </div>

              {/* Angle */}
              <div>
                <label className="block text-sm text-gray-400 mb-2">Angle</label>
                <select
                  value={selfieAngle}
                  onChange={(e) => setSelfieAngle(e.target.value as SelfieAngle)}
                  className="w-full px-4 py-3 bg-[#0f1419] border border-gray-700 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                >
                  {ANGLES.map((ang) => (
                    <option key={ang.value} value={ang.value}>{ang.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4 mb-4">
              {/* Emotion */}
              <div>
                <label className="block text-sm text-gray-400 mb-2">Emotion</label>
                <select
                  value={selfieEmotion}
                  onChange={(e) => setSelfieEmotion(e.target.value as SelfieEmotion)}
                  className="w-full px-4 py-3 bg-[#0f1419] border border-gray-700 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                >
                  {EMOTIONS.map((emo) => (
                    <option key={emo.value} value={emo.value}>{emo.label}</option>
                  ))}
                </select>
              </div>

              {/* Gaze */}
              <div>
                <label className="block text-sm text-gray-400 mb-2">Gaze</label>
                <select
                  value={selfieGaze}
                  onChange={(e) => setSelfieGaze(e.target.value as SelfieGaze)}
                  className="w-full px-4 py-3 bg-[#0f1419] border border-gray-700 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                >
                  {GAZES.map((gaz) => (
                    <option key={gaz.value} value={gaz.value}>{gaz.label}</option>
                  ))}
                </select>
              </div>

              {/* Setting */}
              <div>
                <label className="block text-sm text-gray-400 mb-2">Setting</label>
                <select
                  value={selfieSetting}
                  onChange={(e) => setSelfieSetting(e.target.value as SelfieSetting)}
                  className="w-full px-4 py-3 bg-[#0f1419] border border-gray-700 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                >
                  {SETTINGS.map((set) => (
                    <option key={set.value} value={set.value}>{set.label}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Generate / Regenerate Button */}
            <div className="flex gap-4 items-center">
              <button
                onClick={handleGenerateSelfie}
                disabled={isGeneratingSelfie}
                className={`flex-1 py-3 rounded-xl font-semibold transition-all ${
                  !isGeneratingSelfie
                    ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white hover:from-purple-600 hover:to-pink-600'
                    : 'bg-gray-700 text-gray-500 cursor-not-allowed'
                }`}
              >
                {isGeneratingSelfie ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Generating Selfie...
                  </span>
                ) : selfieUrl ? (
                  '🔄 Regenerate Selfie'
                ) : (
                  '✨ Generate Selfie'
                )}
              </button>

              {selfieUrl && (
                <div className="flex items-center gap-3">
                  <img src={selfieUrl} alt="Generated selfie" className="w-16 h-16 rounded-lg object-cover" />
                  <span className="text-green-400 text-sm">✓ Selfie ready</span>
                </div>
              )}
            </div>
          </div>

          {/* Section: Deceased Details */}
          <div className="bg-[#1a1f2e] rounded-2xl border border-gray-800/50 p-6">
            <div className="flex items-center gap-2 mb-4">
              <span className={`w-6 h-6 rounded-full ${isManualMode ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'} text-xs font-bold flex items-center justify-center`}>
                {isManualMode ? '3' : '2'}
              </span>
              <h2 className="text-lg font-semibold text-white">Deceased Details</h2>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm text-gray-400 mb-2">Relationship *</label>
                <select
                  value={relationship}
                  onChange={(e) => setRelationship(e.target.value)}
                  className="w-full px-4 py-3 bg-[#0f1419] border border-gray-700 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                >
                  <option value="">Select...</option>
                  {RELATIONSHIPS.map((rel) => (
                    <option key={rel} value={rel}>
                      {rel.charAt(0).toUpperCase() + rel.slice(1)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-2">Nickname</label>
                <input
                  type="text"
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  placeholder="e.g., Nanny, Papa"
                  className="w-full px-4 py-3 bg-[#0f1419] border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-2">Photo Era *</label>
                <select
                  value={timePeriod}
                  onChange={(e) => setTimePeriod(e.target.value)}
                  className="w-full px-4 py-3 bg-[#0f1419] border border-gray-700 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                >
                  {TIME_PERIODS.map((period) => (
                    <option key={period} value={period}>{period}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-2">People in Photo</label>
                <select
                  value={peopleOverride}
                  onChange={(e) => setPeopleOverride(e.target.value)}
                  className={`w-full px-4 py-3 bg-[#0f1419] border border-gray-700 rounded-xl text-white focus:outline-none focus:ring-2 ${isManualMode ? 'focus:ring-emerald-500/50' : 'focus:ring-amber-500/50'}`}
                >
                  <option value="">Auto (two people)</option>
                  <option value="solo">Solo — just the deceased</option>
                  <option value="two">Two people — deceased + recipient</option>
                </select>
              </div>
            </div>

            {/* Photo Scene Description - Only for TREND mode */}
            {!isManualMode && (
              <div className="mt-4">
                <label className="block text-sm font-medium text-gray-400 mb-2">
                  Describe the photo scene *
                </label>
                <input
                  type="text"
                  value={photoHint}
                  onChange={(e) => setPhotoHint(e.target.value)}
                  placeholder={`e.g., ${trendKeywordParam ? `Family watching ${trendKeywordParam} on TV together` : 'Grandma and grandson at a baseball game'}`}
                  className="w-full px-4 py-3 bg-[#0f1419] border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                />
                <p className="text-xs text-gray-500 mt-1">
                  {trendKeywordParam 
                    ? `How would this family connect to "${trendKeywordParam}"? What would their camera roll photo look like?`
                    : 'What would this family\'s camera roll photo look like?'}
                </p>
              </div>
            )}
          </div>

          {/* Section: Hook Text */}
          <div className="bg-[#1a1f2e] rounded-2xl border border-gray-800/50 p-6">
            <div className="flex items-center gap-2 mb-4">
              <span className={`w-6 h-6 rounded-full ${isManualMode ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'} text-xs font-bold flex items-center justify-center`}>
                {isManualMode ? '4' : '3'}
              </span>
              <h2 className="text-lg font-semibold text-white">Hook Text (Slide 1)</h2>
            </div>

            {/* Style Toggle */}
            <div className="flex items-center gap-2 mb-4">
              <span className="text-sm text-gray-400">Style:</span>
              <div className="flex rounded-lg overflow-hidden border border-gray-600">
                <button
                  onClick={() => {
                    setTextStyle('snapchat')
                    setSelectedHookId(null)
                  }}
                  className={`px-4 py-1.5 text-sm font-medium transition-colors ${
                    textStyle === 'snapchat'
                      ? 'bg-pink-500 text-white'
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  }`}
                >
                  Snapchat
                </button>
                <button
                  onClick={() => {
                    setTextStyle('clean')
                    setSelectedHookId(null)
                  }}
                  className={`px-4 py-1.5 text-sm font-medium transition-colors ${
                    textStyle === 'clean'
                      ? 'bg-slate-500 text-white'
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  }`}
                >
                  Clean
                </button>
              </div>
            </div>

            {/* Quick Picks */}
            {filteredHooks.length > 0 && (
              <div className="mb-4">
                <p className="text-sm text-gray-400 mb-2">Quick picks:</p>
                <div className="flex flex-wrap gap-2">
                  {filteredHooks.map((hook) => (
                    <button
                      key={hook.id}
                      onClick={() => {
                        setSelectedHookId(hook.id)
                        setCustomHookText('')
                      }}
                      className={`px-3 py-1.5 rounded-full text-sm transition-all ${
                        selectedHookId === hook.id
                          ? `${isManualMode ? 'bg-emerald-500' : 'bg-amber-500'} text-white`
                          : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                      }`}
                    >
                      {hook.text}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Custom Input */}
            <div>
              <label className="block text-sm text-gray-400 mb-2">
                Or enter custom text:
              </label>
              <input
                type="text"
                value={customHookText}
                onChange={(e) => {
                  setCustomHookText(e.target.value)
                  if (e.target.value) setSelectedHookId(null)
                }}
                placeholder={isManualMode ? "she would've loved this 💔" : (trendAngleParam ? decodeURIComponent(trendAngleParam) : "she would've loved this 💔")}
                className="w-full px-4 py-3 bg-[#0f1419] border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
              />
            </div>
          </div>

          {/* Section: Slide 3 (Optional Media) */}
          <div className="bg-[#1a1f2e] rounded-2xl border border-gray-800/50 p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <span className={`w-6 h-6 rounded-full ${isManualMode ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'} text-xs font-bold flex items-center justify-center`}>
                  {isManualMode ? '5' : '4'}
                </span>
                <h2 className="text-lg font-semibold text-white">Slide 3 (Optional)</h2>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeSlide3}
                  onChange={(e) => setIncludeSlide3(e.target.checked)}
                  className={`w-4 h-4 rounded bg-gray-700 border-gray-600 ${isManualMode ? 'text-emerald-500 focus:ring-emerald-500' : 'text-amber-500 focus:ring-amber-500'} focus:ring-offset-gray-800`}
                />
                <span className="text-white text-sm">Include Slide 3</span>
              </label>
            </div>

            {includeSlide3 ? (
              <div className="space-y-4">
                <p className="text-gray-400 text-sm">
                  Add a third slide featuring album art, movie poster, or other media image.
                </p>

                {/* Slide 3 Type */}
                <div>
                  <label className="block text-sm text-gray-400 mb-2">Slide Type</label>
                  <div className="flex gap-3">
                    <button
                      onClick={() => setSlide3Type('album_art')}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                        slide3Type === 'album_art'
                          ? 'bg-purple-500 text-white'
                          : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                      }`}
                    >
                      🎵 Album Art
                    </button>
                    <button
                      onClick={() => setSlide3Type('movie_poster')}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                        slide3Type === 'movie_poster'
                          ? 'bg-purple-500 text-white'
                          : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                      }`}
                    >
                      🎬 Movie/TV Poster
                    </button>
                  </div>
                </div>

                {/* Media Image URL */}
                <div>
                  <label className="block text-sm text-gray-400 mb-2">Image URL *</label>
                  <input
                    type="text"
                    value={slide3ImageUrl}
                    onChange={(e) => setSlide3ImageUrl(e.target.value)}
                    placeholder="https://i.scdn.co/image/... or paste image URL"
                    className="w-full px-4 py-3 bg-[#0f1419] border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Paste album art from Spotify, movie poster, or any square image URL
                  </p>
                </div>

                {/* Title and Artist */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm text-gray-400 mb-2">
                      {slide3Type === 'album_art' ? 'Song/Album Title *' : 'Movie/Show Title *'}
                    </label>
                    <input
                      type="text"
                      value={slide3Title}
                      onChange={(e) => setSlide3Title(e.target.value)}
                      placeholder={slide3Type === 'album_art' ? 'e.g., Bohemian Rhapsody' : 'e.g., Home Alone'}
                      className="w-full px-4 py-3 bg-[#0f1419] border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-400 mb-2">
                      {slide3Type === 'album_art' ? 'Artist' : 'Year / Network'}
                    </label>
                    <input
                      type="text"
                      value={slide3Artist}
                      onChange={(e) => setSlide3Artist(e.target.value)}
                      placeholder={slide3Type === 'album_art' ? 'e.g., Queen' : 'e.g., 1990'}
                      className="w-full px-4 py-3 bg-[#0f1419] border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                    />
                  </div>
                </div>

                {/* Preview */}
                {slide3ImageUrl && (
                  <div className="mt-4 flex items-center gap-4">
                    <div className="w-20 h-20 rounded-lg overflow-hidden bg-gray-800 flex-shrink-0">
                      <img
                        src={slide3ImageUrl}
                        alt="Slide 3 preview"
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = ''
                          ;(e.target as HTMLImageElement).style.display = 'none'
                        }}
                      />
                    </div>
                    <div>
                      <p className="text-white font-medium">{slide3Title || 'Title'}</p>
                      <p className="text-gray-400 text-sm">{slide3Artist || 'Artist'}</p>
                      <p className="text-purple-400 text-xs mt-1">
                        {slide3Type === 'album_art' ? '🎵 Music slide' : '🎬 Movie/TV slide'}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-gray-500 text-sm">
                Enable to add a third slide with album art, movie poster, or other media.
              </p>
            )}
          </div>

          {/* Section: Generate */}
          <div className="bg-[#1a1f2e] rounded-2xl border border-gray-800/50 p-6">
            <div className="flex items-center gap-2 mb-4">
              <span className={`w-6 h-6 rounded-full ${isManualMode ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'} text-xs font-bold flex items-center justify-center`}>
                {isManualMode ? '6' : '5'}
              </span>
              <h2 className="text-lg font-semibold text-white">Generate Post</h2>
            </div>

            {/* Summary */}
            <div className="bg-[#0f1419] rounded-xl p-4 mb-6 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Topic:</span>
                <span className={`${isManualMode ? 'text-emerald-400' : 'text-amber-400'} font-medium`}>
                  {effectiveTopic || '—'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Selfie:</span>
                <span className="text-white">{selfieUrl ? 'Generated ✓' : '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Relationship:</span>
                <span className="text-white capitalize">{relationship || '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Hook:</span>
                <span className="text-white">{activeHookText ? (activeHookText.length > 30 ? activeHookText.slice(0, 30) + '...' : activeHookText) : '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Photo Era:</span>
                <span className="text-white">{timePeriod}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">People in Photo:</span>
                <span className="text-white">
                  {peopleOverride === 'solo' ? 'Solo (just deceased)' : peopleOverride === 'two' ? 'Two people' : 'Auto (two)'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Slides:</span>
                <span className="text-white">
                  {includeSlide3 ? '3 slides (+ media)' : '2 slides'}
                </span>
              </div>
              {isManualMode && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Mode:</span>
                  <span className="text-emerald-400 font-medium">Manual</span>
                </div>
              )}
            </div>

            {/* Platform Selection */}
            <div className="mb-6">
              <label className="block text-sm text-gray-400 mb-2">Platform</label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={platforms.tiktok}
                    onChange={(e) => setPlatforms(p => ({ ...p, tiktok: e.target.checked }))}
                    className={`w-4 h-4 rounded bg-gray-700 border-gray-600 ${isManualMode ? 'text-emerald-500 focus:ring-emerald-500' : 'text-amber-500 focus:ring-amber-500'} focus:ring-offset-gray-800`}
                  />
                  <span className="text-white text-sm">TikTok</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={platforms.instagram}
                    onChange={(e) => setPlatforms(p => ({ ...p, instagram: e.target.checked }))}
                    className={`w-4 h-4 rounded bg-gray-700 border-gray-600 ${isManualMode ? 'text-emerald-500 focus:ring-emerald-500' : 'text-amber-500 focus:ring-amber-500'} focus:ring-offset-gray-800`}
                  />
                  <span className="text-white text-sm">Instagram</span>
                </label>
              </div>
            </div>

            {/* Generate Button */}
            <button
              onClick={handleGenerate}
              disabled={!canGenerate || isGenerating}
              className={`w-full py-4 rounded-xl font-semibold text-lg transition-all ${
                canGenerate && !isGenerating
                  ? isManualMode
                    ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white hover:from-emerald-400 hover:to-teal-400 shadow-lg shadow-emerald-500/25'
                    : 'bg-gradient-to-r from-amber-500 to-orange-500 text-white hover:from-amber-400 hover:to-orange-400 shadow-lg shadow-amber-500/25'
                  : 'bg-gray-700 text-gray-500 cursor-not-allowed'
              }`}
            >
              {isGenerating ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Generating...
                </span>
              ) : isManualMode ? (
                '✏️ Generate Manual Post'
              ) : (
                '⚡ Generate Live Now Post'
              )}
            </button>

            {!canGenerate && (
              <p className={`text-center ${isManualMode ? 'text-emerald-400/70' : 'text-amber-400/70'} text-xs mt-3`}>
                {isManualMode 
                  ? 'Fill in: topic, caption, photo prompt, generate selfie, relationship, and hook text'
                  : 'Fill in: generate selfie, relationship, photo scene, and hook text'
                }
              </p>
            )}
          </div>
        </div>

        {/* Right Column - Preview */}
        <div className="w-[40%] sticky top-24 self-start">
          <div className="bg-[#1a1f2e] rounded-2xl border border-gray-800/50 p-6">
            <h2 className="text-lg font-semibold text-white mb-4">Preview</h2>

            {/* Phone Frame */}
            <div
              className="mx-auto bg-gray-950 rounded-[2rem] p-2 border border-gray-700 shadow-2xl"
              style={{ maxWidth: '280px' }}
            >
              {/* Screen */}
              <div
                className="relative bg-gray-900 rounded-[1.5rem] overflow-hidden"
                style={{ aspectRatio: '9/16' }}
              >
                {/* Slide Content */}
                {activeSlide === 0 ? (
                  /* Slide 1 */
                  <div className="relative w-full h-full">
                    {selfieUrl ? (
                      <img
                        src={selfieUrl}
                        alt="Generated Selfie"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-gray-800">
                        <p className="text-gray-500 text-sm text-center px-4">Generate a selfie to see preview</p>
                      </div>
                    )}

                    {/* Hook Text Overlay */}
                    {activeHookText && (
                      <div className="absolute inset-0 flex items-center justify-center p-4">
                        {textStyle === 'snapchat' ? (
                          <p
                            className="text-white text-xl font-bold text-center"
                            style={{
                              textShadow: '-2px -2px 0 #000, 2px -2px 0 #000, -2px 2px 0 #000, 2px 2px 0 #000',
                              transform: 'rotate(-3deg)',
                              fontFamily: 'Arial, sans-serif'
                            }}
                          >
                            {activeHookText}
                          </p>
                        ) : (
                          <div className="bg-black/50 px-4 py-2 rounded-lg">
                            <p className="text-white text-lg font-semibold text-center uppercase tracking-wider">
                              {activeHookText}
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ) : activeSlide === 1 ? (
                  /* Slide 2 - HeartChime Card */
                  <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-b from-gray-800 to-gray-900 p-2 overflow-hidden">
                    <div style={{ transform: 'scale(0.85)', transformOrigin: 'center' }}>
                      <HeartchimePreviewCard
                        photo={{ url: selfieUrl || '' }}
                        message={isManualMode && manualCaption 
                          ? manualCaption 
                          : `${nickname || relationship || 'They'} would have loved this moment. Their memory lives on with you.`
                        }
                        socialMode={true}
                      />
                    </div>
                  </div>
                ) : (
                  /* Slide 3 - Media */
                  <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-b from-purple-900/50 to-gray-900 p-4">
                    {slide3ImageUrl ? (
                      <div className="text-center">
                        <div className="w-32 h-32 mx-auto rounded-xl overflow-hidden shadow-xl mb-3">
                          <img
                            src={slide3ImageUrl}
                            alt="Media"
                            className="w-full h-full object-cover"
                          />
                        </div>
                        <p className="text-white font-medium text-sm">{slide3Title || 'Title'}</p>
                        <p className="text-gray-400 text-xs">{slide3Artist || 'Artist'}</p>
                        <p className="text-purple-400 text-[10px] mt-2">
                          {slide3Type === 'album_art' ? '🎵 Music' : '🎬 Movie/TV'}
                        </p>
                      </div>
                    ) : (
                      <div className="text-center text-gray-500">
                        <span className="text-3xl mb-2 block">{slide3Type === 'album_art' ? '🎵' : '🎬'}</span>
                        <p className="text-sm">Add media URL for preview</p>
                      </div>
                    )}
                  </div>
                )}

                {/* Carousel Dots */}
                <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-1.5">
                  {(includeSlide3 ? [0, 1, 2] : [0, 1]).map((idx) => (
                    <button
                      key={idx}
                      onClick={() => setActiveSlide(idx)}
                      className={`w-2 h-2 rounded-full transition-all ${
                        activeSlide === idx
                          ? 'bg-white w-4'
                          : 'bg-white/50 hover:bg-white/70'
                      }`}
                    />
                  ))}
                </div>
              </div>
            </div>

            {/* Slide Labels */}
            <div className="flex justify-center gap-3 mt-3 flex-wrap">
              <button
                onClick={() => setActiveSlide(0)}
                className={`text-xs ${activeSlide === 0 ? (isManualMode ? 'text-emerald-400' : 'text-amber-400') : 'text-gray-500'}`}
              >
                Slide 1: Selfie
              </button>
              <button
                onClick={() => setActiveSlide(1)}
                className={`text-xs ${activeSlide === 1 ? (isManualMode ? 'text-emerald-400' : 'text-amber-400') : 'text-gray-500'}`}
              >
                Slide 2: HeartChime
              </button>
              {includeSlide3 && (
                <button
                  onClick={() => setActiveSlide(2)}
                  className={`text-xs ${activeSlide === 2 ? 'text-purple-400' : 'text-gray-500'}`}
                >
                  Slide 3: Media
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ===========================================
// PAGE EXPORT (with Suspense boundary)
// ===========================================

export default function CreateLiveNowPostPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-900 p-6 flex items-center justify-center">
        <div className="text-gray-400">Loading...</div>
      </div>
    }>
      <CreateLiveNowPostContent />
    </Suspense>
  )
}
