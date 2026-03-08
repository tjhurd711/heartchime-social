'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { createClient } from '@supabase/supabase-js'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'

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

interface CulturalMoment {
  id: string
  title: string
  date_occurred: string
  category: string
  context_prompt: string | null
  suggested_hook: string | null
  media_title: string | null
  media_artist: string | null
  media_thumbnail_url: string | null
  slide_3_type: string | null
  is_recurring: boolean
  times_used: number
}

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

const CATEGORY_COLORS: Record<string, string> = {
  music: 'bg-pink-500/20 text-pink-400',
  movies_tv: 'bg-purple-500/20 text-purple-400',
  sports: 'bg-green-500/20 text-green-400',
  holidays: 'bg-amber-500/20 text-amber-400',
  people: 'bg-blue-500/20 text-blue-400',
  life: 'bg-cyan-500/20 text-cyan-400',
}

const CATEGORY_LABELS: Record<string, string> = {
  music: 'Music',
  movies_tv: 'Movies & TV',
  sports: 'Sports',
  holidays: 'Holidays',
  people: 'People',
  life: 'Life',
}

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
// HELPER FUNCTIONS
// ===========================================

function formatDate(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00')
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function truncate(str: string | null, length: number): string {
  if (!str) return ''
  if (str.length <= length) return str
  return str.slice(0, length) + '...'
}

// ===========================================
// MAIN COMPONENT
// ===========================================

export default function CreateLivePastPostPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const preselectedMomentId = searchParams.get('momentId')
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Data
  const [hooks, setHooks] = useState<Hook[]>([])
  const [moments, setMoments] = useState<CulturalMoment[]>([])
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

  // Cultural moment selection
  const [momentSearch, setMomentSearch] = useState('')
  const [selectedMoment, setSelectedMoment] = useState<CulturalMoment | null>(null)
  const [showMomentDropdown, setShowMomentDropdown] = useState(false)

  // Deceased details
  const [relationship, setRelationship] = useState('')
  const [nickname, setNickname] = useState('')
  const [photoHint, setPhotoHint] = useState('')
  const [timePeriod, setTimePeriod] = useState('')
  const [peopleOverride, setPeopleOverride] = useState('')

  // Hook
  const [textStyle, setTextStyle] = useState<'snapchat' | 'clean'>('snapchat')
  const [selectedHookId, setSelectedHookId] = useState<string | null>(null)
  const [customHookText, setCustomHookText] = useState('')

  // Platform
  const [platforms, setPlatforms] = useState({ tiktok: true, instagram: true })

  // Generation
  const [isGenerating, setIsGenerating] = useState(false)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)

  // ===========================================
  // DATA FETCHING
  // ===========================================

  useEffect(() => {
    fetchData()
  }, [])

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowMomentDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Auto-select moment from query param
  useEffect(() => {
    if (preselectedMomentId && moments.length > 0 && !selectedMoment) {
      const found = moments.find(m => m.id === preselectedMomentId)
      if (found) setSelectedMoment(found)
    }
  }, [moments, preselectedMomentId, selectedMoment])

  const fetchData = async () => {
    setLoading(true)
    try {
      const [hooksRes, momentsRes] = await Promise.all([
        supabase
          .from('social_hooks')
          .select('*')
          .order('times_used', { ascending: true }),
        supabase
          .from('social_cultural_moments')
          .select('*')
          .order('date_occurred', { ascending: false })
      ])

      if (hooksRes.data) setHooks(hooksRes.data)
      if (momentsRes.data) setMoments(momentsRes.data)
    } catch (error) {
      console.error('Error fetching data:', error)
    } finally {
      setLoading(false)
    }
  }

  // ===========================================
  // COMPUTED VALUES
  // ===========================================

  const filteredMoments = useMemo(() => {
    if (!momentSearch.trim()) return moments.slice(0, 10)
    const searchLower = momentSearch.toLowerCase()
    return moments
      .filter(m =>
        m.title.toLowerCase().includes(searchLower) ||
        m.media_title?.toLowerCase().includes(searchLower) ||
        m.media_artist?.toLowerCase().includes(searchLower)
      )
      .slice(0, 10)
  }, [moments, momentSearch])

  const filteredHooks = useMemo(() => {
    return hooks.filter(h => h.text_style === textStyle).slice(0, 6)
  }, [hooks, textStyle])

  const activeHookText = useMemo(() => {
    if (customHookText.trim()) return customHookText
    const selectedHook = hooks.find(h => h.id === selectedHookId)
    return selectedHook?.text || ''
  }, [customHookText, selectedHookId, hooks])

  const canGenerate = useMemo(() => {
    return selectedMoment && selfieUrl && relationship && activeHookText && photoHint.trim() && timePeriod
  }, [selectedMoment, selfieUrl, relationship, activeHookText, photoHint, timePeriod])

  // ===========================================
  // HANDLERS
  // ===========================================

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3000)
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

  const handleSelectMoment = (moment: CulturalMoment) => {
    setSelectedMoment(moment)
    setMomentSearch('')
    setShowMomentDropdown(false)
  }

  const handleClearMoment = () => {
    setSelectedMoment(null)
    setMomentSearch('')
  }

  const handleUseSuggestedHook = () => {
    if (selectedMoment?.suggested_hook) {
      setCustomHookText(selectedMoment.suggested_hook)
      setSelectedHookId(null)
    }
  }

  const handleGenerate = async () => {
    if (!canGenerate || !selectedMoment || !selfieUrl) return

    setIsGenerating(true)
    try {
      const platformValue = platforms.tiktok && platforms.instagram
        ? 'both'
        : platforms.tiktok
          ? 'tiktok'
          : 'instagram'

      const response = await fetch('/api/admin/social/generate-live-past-post', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          selfieUrl,
          culturalMomentId: selectedMoment.id,
          relationship,
          nickname: nickname || relationship,
          hookText: activeHookText,
          hookStyle: textStyle,
          platform: platformValue,
          photoHint,
          timePeriod,
          ...(peopleOverride && { peopleOverride }),
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

      // Update hook usage count if using a preset hook
      if (selectedHookId) {
        const selectedHook = hooks.find(h => h.id === selectedHookId)
        if (selectedHook) {
          await supabase
            .from('social_hooks')
            .update({ times_used: (selectedHook.times_used || 0) + 1 })
            .eq('id', selectedHookId)
        }
      }

      showToast('Post generated! Redirecting...', 'success')

      setTimeout(() => {
        router.push(`/admin/social/live-past/${data.post.id}`)
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
    <div className="p-6 lg:p-8 space-y-8">
      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg ${
          toast.type === 'success' ? 'bg-green-600' : 'bg-red-600'
        } text-white font-medium`}>
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
          <Link href="/admin/social/live-past" className="text-gray-400 hover:text-white text-sm">
            Live Past
          </Link>
          <span className="text-gray-600">/</span>
          <span className="text-gray-300 text-sm">Create Post</span>
        </div>
        <h1 className="text-3xl font-bold text-white">🎬 Create Live Past Post</h1>
        <p className="text-gray-400 mt-1">Create a post tied to a cultural moment</p>
      </div>

      {/* Section 1: Cultural Moment Selection */}
      <div className="bg-[#1a1f2e] rounded-2xl border border-gray-800/50 p-6">
        <h2 className="text-lg font-semibold text-white mb-4">1. Select Cultural Moment</h2>

        {!selectedMoment ? (
          <div className="relative" ref={dropdownRef}>
            {/* Search Input */}
            <div className="relative">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                value={momentSearch}
                onChange={(e) => {
                  setMomentSearch(e.target.value)
                  setShowMomentDropdown(true)
                }}
                onFocus={() => setShowMomentDropdown(true)}
                placeholder="Search by title, song, or artist..."
                className="w-full pl-10 pr-4 py-3 bg-[#0f1419] border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-pink-500/50"
              />
            </div>

            {/* Dropdown */}
            {showMomentDropdown && (
              <div className="absolute z-20 w-full mt-2 bg-[#0f1419] border border-gray-700 rounded-xl shadow-2xl max-h-80 overflow-y-auto">
                {filteredMoments.length === 0 ? (
                  <div className="p-4 text-gray-500 text-center">
                    {moments.length === 0 ? 'No cultural moments yet' : 'No matches found'}
                  </div>
                ) : (
                  filteredMoments.map((moment) => (
                    <button
                      key={moment.id}
                      onClick={() => handleSelectMoment(moment)}
                      className="w-full px-4 py-3 text-left hover:bg-gray-800/50 transition-colors border-b border-gray-800/50 last:border-b-0"
                    >
                      <div className="flex items-start gap-3">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${CATEGORY_COLORS[moment.category] || 'bg-gray-500/20 text-gray-400'}`}>
                          {CATEGORY_LABELS[moment.category] || moment.category}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-white font-medium truncate">{moment.title}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-gray-500 text-sm">{formatDate(moment.date_occurred)}</span>
                            {moment.media_title && (
                              <span className="text-gray-400 text-sm truncate">
                                • {moment.media_title} {moment.media_artist && `by ${moment.media_artist}`}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </button>
                  ))
                )}
              </div>
            )}

            {moments.length === 0 && (
              <p className="mt-3 text-gray-500 text-sm">
                No cultural moments found.{' '}
                <Link href="/admin/social/live-past" className="text-pink-400 hover:text-pink-300">
                  Add some first →
                </Link>
              </p>
            )}
          </div>
        ) : (
          /* Selected Moment Card */
          <div className="bg-[#0f1419] rounded-xl p-4 border border-pink-500/30">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${CATEGORY_COLORS[selectedMoment.category] || 'bg-gray-500/20 text-gray-400'}`}>
                    {CATEGORY_LABELS[selectedMoment.category] || selectedMoment.category}
                  </span>
                  <span className="text-gray-500 text-sm">{formatDate(selectedMoment.date_occurred)}</span>
                  {selectedMoment.slide_3_type && selectedMoment.slide_3_type !== 'none' && (
                    <span className="px-2 py-0.5 rounded text-xs bg-purple-500/20 text-purple-400">
                      + Slide 3
                    </span>
                  )}
                </div>
                <h3 className="text-white font-semibold text-lg">{selectedMoment.title}</h3>
                {selectedMoment.media_title && (
                  <p className="text-gray-400 mt-1">
                    🎵 {selectedMoment.media_title} {selectedMoment.media_artist && `by ${selectedMoment.media_artist}`}
                  </p>
                )}
                {selectedMoment.context_prompt && (
                  <p className="text-gray-500 text-sm mt-2 line-clamp-2">
                    {truncate(selectedMoment.context_prompt, 150)}
                  </p>
                )}
              </div>
              <button
                onClick={handleClearMoment}
                className="ml-4 px-3 py-1.5 text-sm text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition-colors"
              >
                Change
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Section 2: Generate Selfie */}
      <div className="bg-[#1a1f2e] rounded-2xl border border-gray-800/50 p-6">
        <h2 className="text-lg font-semibold text-white mb-4">2. Generate Selfie (Slide 1)</h2>

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
              className="w-full px-4 py-3 bg-[#0f1419] border border-gray-700 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-pink-500/50"
            />
          </div>

          {/* Gender */}
          <div>
            <label className="block text-sm text-gray-400 mb-2">Gender</label>
            <select
              value={selfieGender}
              onChange={(e) => setSelfieGender(e.target.value as SelfieGender)}
              className="w-full px-4 py-3 bg-[#0f1419] border border-gray-700 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-pink-500/50"
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
              className="w-full px-4 py-3 bg-[#0f1419] border border-gray-700 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-pink-500/50"
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
              className="w-full px-4 py-3 bg-[#0f1419] border border-gray-700 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-pink-500/50"
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
              className="w-full px-4 py-3 bg-[#0f1419] border border-gray-700 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-pink-500/50"
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
              className="w-full px-4 py-3 bg-[#0f1419] border border-gray-700 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-pink-500/50"
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
              className="w-full px-4 py-3 bg-[#0f1419] border border-gray-700 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-pink-500/50"
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

      {/* Section 3: Deceased Details */}
      <div className="bg-[#1a1f2e] rounded-2xl border border-gray-800/50 p-6">
        <h2 className="text-lg font-semibold text-white mb-4">3. Deceased Details</h2>

        {/* Relationship, Photo Era, People in Photo & Nickname */}
        <div className="grid grid-cols-4 gap-4">
          <div>
            <label className="block text-sm text-gray-400 mb-2">Relationship *</label>
            <select
              value={relationship}
              onChange={(e) => setRelationship(e.target.value)}
              className="w-full px-4 py-3 bg-[#0f1419] border border-gray-700 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-pink-500/50"
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
            <label className="block text-sm text-gray-400 mb-2">Photo Era *</label>
            <select
              value={timePeriod}
              onChange={(e) => setTimePeriod(e.target.value)}
              className="w-full px-4 py-3 bg-[#0f1419] border border-gray-700 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-pink-500/50"
            >
              <option value="">Select time period</option>
              {TIME_PERIODS.map(tp => (
                <option key={tp} value={tp}>{tp}</option>
              ))}
            </select>
            <p className="text-xs text-gray-500 mt-1">
              What decade would this family photo be from?
            </p>
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-2">People in Photo</label>
            <select
              value={peopleOverride}
              onChange={(e) => setPeopleOverride(e.target.value)}
              className="w-full px-4 py-3 bg-[#0f1419] border border-gray-700 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-pink-500/50"
            >
              <option value="">Auto (based on era)</option>
              <option value="solo">Solo — just the deceased</option>
              <option value="two">Two people — deceased + recipient</option>
            </select>
            <p className="text-xs text-gray-500 mt-1">
              Override who appears in the vintage photo
            </p>
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-2">Nickname</label>
            <input
              type="text"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="e.g., Nanny, Pop, Mama"
              className="w-full px-4 py-3 bg-[#0f1419] border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-pink-500/50"
            />
          </div>
        </div>

        {/* Photo Hint */}
        <div className="mt-4">
          <label className="block text-sm font-medium text-gray-400 mb-2">
            Describe the photo *
          </label>
          <input
            type="text"
            value={photoHint}
            onChange={(e) => setPhotoHint(e.target.value)}
            placeholder="e.g., Dad and son on the couch in Cowboys jerseys watching football"
            className="w-full px-4 py-3 bg-[#0f1419] border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-pink-500/50"
          />
          <p className="text-xs text-gray-500 mt-1">
            What would this family's camera roll photo look like? One sentence.
          </p>
        </div>
      </div>

      {/* Section 4: Hook Text */}
      <div className="bg-[#1a1f2e] rounded-2xl border border-gray-800/50 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">4. Hook Text</h2>
          <Link href="/admin/social/evergreen/hooks" className="text-sm text-pink-400 hover:text-pink-300">
            Manage Hooks →
          </Link>
        </div>

        {/* Suggested Hook Banner */}
        {selectedMoment?.suggested_hook && (
          <button
            onClick={handleUseSuggestedHook}
            className="w-full mb-4 px-4 py-3 bg-pink-500/10 border border-pink-500/30 rounded-xl text-left hover:bg-pink-500/20 transition-colors"
          >
            <span className="text-pink-400 text-sm">💡 Suggested: </span>
            <span className="text-white">{selectedMoment.suggested_hook}</span>
          </button>
        )}

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

        {/* Hook Presets */}
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
                      ? 'bg-pink-500 text-white'
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
          <label className="block text-sm text-gray-400 mb-2">Or enter custom text:</label>
          <input
            type="text"
            value={customHookText}
            onChange={(e) => {
              setCustomHookText(e.target.value)
              if (e.target.value) setSelectedHookId(null)
            }}
            placeholder="she showed up today 💔"
            className="w-full px-4 py-3 bg-[#0f1419] border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-pink-500/50"
          />
        </div>
      </div>

      {/* Section 5: Generate */}
      <div className="bg-[#1a1f2e] rounded-2xl border border-gray-800/50 p-6">
        <h2 className="text-lg font-semibold text-white mb-4">5. Generate Post</h2>

        {/* Summary */}
        <div className="bg-[#0f1419] rounded-xl p-4 mb-6 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-gray-500 text-sm">Cultural Moment:</span>
            <span className="text-white text-sm">
              {selectedMoment ? `${selectedMoment.title} (${formatDate(selectedMoment.date_occurred)})` : '—'}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-gray-500 text-sm">Selfie:</span>
            <div className="flex items-center gap-2">
              {selfieUrl && (
                <img src={selfieUrl} alt="" className="w-6 h-6 rounded object-cover" />
              )}
              <span className="text-white text-sm">{selfieUrl ? 'Generated ✓' : '—'}</span>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-gray-500 text-sm">Relationship:</span>
            <span className="text-white text-sm capitalize">{relationship || '—'}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-gray-500 text-sm">Hook:</span>
            <span className="text-white text-sm">{truncate(activeHookText, 40) || '—'}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-gray-500 text-sm">Text Style:</span>
            <span className={`px-2 py-0.5 rounded text-xs ${textStyle === 'snapchat' ? 'bg-pink-500/20 text-pink-400' : 'bg-slate-500/20 text-slate-300'}`}>
              {textStyle}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-gray-500 text-sm">Photo Era:</span>
            <span className="text-white text-sm">{timePeriod || '—'}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-gray-500 text-sm">People in photo:</span>
            <span className="text-white text-sm">
              {peopleOverride === 'solo' ? 'Solo (just deceased)' : peopleOverride === 'two' ? 'Two people' : 'Auto'}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-gray-500 text-sm">Photo scene:</span>
            <span className="text-white text-sm">{photoHint || '—'}</span>
          </div>
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
                className="w-4 h-4 rounded bg-gray-700 border-gray-600 text-pink-500 focus:ring-pink-500 focus:ring-offset-gray-800"
              />
              <span className="text-white text-sm">TikTok</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={platforms.instagram}
                onChange={(e) => setPlatforms(p => ({ ...p, instagram: e.target.checked }))}
                className="w-4 h-4 rounded bg-gray-700 border-gray-600 text-pink-500 focus:ring-pink-500 focus:ring-offset-gray-800"
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
              ? 'bg-gradient-to-r from-pink-500 to-purple-600 text-white hover:from-pink-400 hover:to-purple-500 shadow-lg shadow-pink-500/25'
              : 'bg-gray-700 text-gray-500 cursor-not-allowed opacity-50'
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
          ) : (
            '✨ Generate Live Past Post'
          )}
        </button>

        <p className="text-center text-gray-500 text-sm mt-3">
          This will generate a vintage photo + HeartChime card{selectedMoment?.slide_3_type && selectedMoment.slide_3_type !== 'none' ? ' + media slide' : ''}
        </p>

        {!canGenerate && (
          <p className="text-center text-pink-400/70 text-xs mt-2">
            Fill in: cultural moment, generate selfie, relationship, photo scene, photo era, and hook text
          </p>
        )}
      </div>
    </div>
  )
}
