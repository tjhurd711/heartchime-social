'use client'

import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import type { AiUgcPersonaWithLovedOne, AssetType, ERA_OPTIONS } from '@/lib/aiUgcTypes'

// ═══════════════════════════════════════════════════════════════════════════
// PHOTO GENERATOR PAGE
// ═══════════════════════════════════════════════════════════════════════════

const PHOTO_TYPES: { value: AssetType; label: string; description: string; icon: string }[] = [
  { value: 'persona_solo', label: 'Persona Only', description: 'Just the AI persona', icon: '👤' },
  { value: 'loved_one_solo', label: 'Loved One Only', description: 'Just the deceased loved one', icon: '💔' },
  { value: 'together', label: 'Together', description: 'Both persona and loved one', icon: '👥' },
  { value: 'generic', label: 'Generic', description: 'No people (food, objects, scenes)', icon: '🖼️' },
]

const ERA_LIST = ['1950s', '1960s', '1970s', '1980s', '1990s', '2000s', '2010s', '2020s']

export default function PhotoGeneratorPage() {
  const searchParams = useSearchParams()
  const preselectedPersona = searchParams.get('persona')
  
  const [personas, setPersonas] = useState<AiUgcPersonaWithLovedOne[]>([])
  const [selectedPersonaId, setSelectedPersonaId] = useState<string>(preselectedPersona || '')
  const [photoType, setPhotoType] = useState<AssetType>('persona_solo')
  const [era, setEra] = useState<string>('')
  const [context, setContext] = useState<string>('')
  
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [generatedImage, setGeneratedImage] = useState<string | null>(null)
  const [generatedPrompt, setGeneratedPrompt] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchPersonas()
  }, [])

  const fetchPersonas = async () => {
    try {
      const res = await fetch('/api/admin/social/ai-ugc/personas')
      const data = await res.json()
      setPersonas(data.personas || [])
      
      // Set preselected persona
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

  const handleGenerate = async () => {
    if (!selectedPersonaId) {
      setError('Please select a persona')
      return
    }

    if ((photoType === 'loved_one_solo' || photoType === 'together') && !selectedLovedOne) {
      setError('This persona has no loved one. Please add one first.')
      return
    }

    setGenerating(true)
    setError(null)
    setGeneratedImage(null)

    try {
      const res = await fetch('/api/admin/social/ai-ugc/generate-photo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          personaId: selectedPersonaId,
          photoType,
          era: era || undefined,
          context: context || undefined,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to generate photo')
      }

      setGeneratedImage(data.url)
      setGeneratedPrompt(data.prompt)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setGenerating(false)
    }
  }

  const handleRegenerate = () => {
    handleGenerate()
  }

  const handleUseInPost = () => {
    // Navigate to post builder with this image pre-selected
    const params = new URLSearchParams({
      persona: selectedPersonaId,
      asset: generatedImage || '',
    })
    window.location.href = `/admin/social/ai-ugc/create-post?${params.toString()}`
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0d1117] p-8">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-2 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin" />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0d1117] p-8">
      <div className="max-w-5xl mx-auto">
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
              <span className="text-4xl">📷</span>
              Photo Generator
            </h1>
            <p className="text-gray-400 mt-1">
              Generate consistent AI photos with reference image matching
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Left Column - Form */}
          <div className="space-y-6">
            {/* Persona Selection */}
            <div className="bg-[#161b22] rounded-xl border border-gray-800 p-6">
              <h3 className="text-lg font-semibold text-white mb-4">1. Select Persona</h3>
              
              <select
                value={selectedPersonaId}
                onChange={(e) => setSelectedPersonaId(e.target.value)}
                className="w-full bg-[#0d1117] border border-gray-700 rounded-lg px-4 py-3 text-white focus:border-emerald-500 focus:outline-none"
              >
                <option value="">Choose a persona...</option>
                {personas.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.age}yo) - {p.loved_ones?.[0]?.name || 'No loved one'}
                  </option>
                ))}
              </select>

              {/* Show selected persona preview */}
              {selectedPersona && (
                <div className="mt-4 flex items-center gap-4 bg-[#0d1117] rounded-lg p-3">
                  <img
                    src={selectedPersona.master_photo_url}
                    alt={selectedPersona.name}
                    className="w-12 h-12 rounded-lg object-cover"
                  />
                  <div className="flex-1">
                    <p className="text-white font-medium">{selectedPersona.name}</p>
                    <p className="text-gray-400 text-sm">Born {selectedPersona.birth_year}</p>
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

            {/* Photo Type */}
            <div className="bg-[#161b22] rounded-xl border border-gray-800 p-6">
              <h3 className="text-lg font-semibold text-white mb-4">2. Photo Type</h3>
              
              <div className="grid grid-cols-2 gap-3">
                {PHOTO_TYPES.map((type) => (
                  <button
                    key={type.value}
                    onClick={() => setPhotoType(type.value)}
                    disabled={
                      (type.value === 'loved_one_solo' || type.value === 'together') && !selectedLovedOne
                    }
                    className={`p-4 rounded-xl border text-left transition-all ${
                      photoType === type.value
                        ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400'
                        : 'bg-[#0d1117] border-gray-700 text-gray-300 hover:border-gray-600'
                    } ${
                      ((type.value === 'loved_one_solo' || type.value === 'together') && !selectedLovedOne)
                        ? 'opacity-50 cursor-not-allowed'
                        : ''
                    }`}
                  >
                    <div className="text-2xl mb-2">{type.icon}</div>
                    <div className="font-medium">{type.label}</div>
                    <div className="text-xs text-gray-500 mt-1">{type.description}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Era Selection */}
            <div className="bg-[#161b22] rounded-xl border border-gray-800 p-6">
              <h3 className="text-lg font-semibold text-white mb-4">3. Era (Optional)</h3>
              
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setEra('')}
                  className={`px-4 py-2 rounded-lg text-sm transition-all ${
                    era === ''
                      ? 'bg-violet-500/20 border border-violet-500/50 text-violet-400'
                      : 'bg-[#0d1117] border border-gray-700 text-gray-400 hover:border-gray-600'
                  }`}
                >
                  Modern
                </button>
                {ERA_LIST.map((e) => (
                  <button
                    key={e}
                    onClick={() => setEra(e)}
                    className={`px-4 py-2 rounded-lg text-sm transition-all ${
                      era === e
                        ? 'bg-violet-500/20 border border-violet-500/50 text-violet-400'
                        : 'bg-[#0d1117] border border-gray-700 text-gray-400 hover:border-gray-600'
                    }`}
                  >
                    {e}
                  </button>
                ))}
              </div>
              
              {era && selectedPersona && (
                <div className="mt-4 text-sm text-gray-400 bg-[#0d1117] rounded-lg p-3">
                  <span className="text-violet-400">Age in {era}:</span>{' '}
                  {selectedPersona.name} would be {calculateAgeInEra(selectedPersona.birth_year, era)} years old
                  {selectedLovedOne && (
                    <>
                      , {selectedLovedOne.name} would be {calculateAgeInEra(selectedLovedOne.birth_year, era)} years old
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Context */}
            <div className="bg-[#161b22] rounded-xl border border-gray-800 p-6">
              <h3 className="text-lg font-semibold text-white mb-4">4. Context / Scene</h3>
              
              <input
                type="text"
                value={context}
                onChange={(e) => setContext(e.target.value)}
                placeholder="at a coffee shop, cooking in kitchen, on a golf course..."
                className="w-full bg-[#0d1117] border border-gray-700 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:border-emerald-500 focus:outline-none"
              />
              
              <div className="mt-3 flex flex-wrap gap-2">
                {['cooking in kitchen', 'at coffee shop', 'on couch watching TV', 'at park', 'at dinner table'].map((suggestion) => (
                  <button
                    key={suggestion}
                    onClick={() => setContext(suggestion)}
                    className="px-3 py-1 bg-[#0d1117] border border-gray-700 rounded-lg text-xs text-gray-400 hover:border-gray-500 hover:text-gray-300 transition-all"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>

            {/* Generate Button */}
            <button
              onClick={handleGenerate}
              disabled={generating || !selectedPersonaId}
              className={`w-full py-4 rounded-xl font-semibold text-lg transition-all flex items-center justify-center gap-3 ${
                generating || !selectedPersonaId
                  ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
                  : 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white hover:from-emerald-600 hover:to-teal-600 shadow-lg shadow-emerald-500/20'
              }`}
            >
              {generating ? (
                <>
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <span>✨</span>
                  Generate Photo
                </>
              )}
            </button>

            {error && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-red-400">
                {error}
              </div>
            )}
          </div>

          {/* Right Column - Preview */}
          <div className="bg-[#161b22] rounded-xl border border-gray-800 p-6 h-fit sticky top-8">
            <h3 className="text-lg font-semibold text-white mb-4">Preview</h3>
            
            {generatedImage ? (
              <div className="space-y-4">
                <div className="aspect-[9/16] rounded-xl overflow-hidden bg-[#0d1117]">
                  <img
                    src={generatedImage}
                    alt="Generated"
                    className="w-full h-full object-cover"
                  />
                </div>
                
                <div className="flex items-center gap-3">
                  <button
                    onClick={handleRegenerate}
                    disabled={generating}
                    className="flex-1 py-2.5 bg-gray-800 text-white rounded-lg font-medium hover:bg-gray-700 transition-colors disabled:opacity-50"
                  >
                    🔄 Regenerate
                  </button>
                  <button
                    onClick={handleUseInPost}
                    className="flex-1 py-2.5 bg-violet-500/20 text-violet-400 border border-violet-500/30 rounded-lg font-medium hover:bg-violet-500/30 transition-colors"
                  >
                    ✨ Use in Post
                  </button>
                </div>

                {/* Show prompt for debugging */}
                {generatedPrompt && (
                  <details className="text-xs">
                    <summary className="text-gray-500 cursor-pointer hover:text-gray-400">
                      View prompt used
                    </summary>
                    <pre className="mt-2 bg-[#0d1117] rounded-lg p-3 text-gray-400 overflow-auto max-h-48 whitespace-pre-wrap">
                      {generatedPrompt}
                    </pre>
                  </details>
                )}
              </div>
            ) : (
              <div className="aspect-[9/16] rounded-xl bg-[#0d1117] flex items-center justify-center">
                <div className="text-center px-8">
                  <div className="text-6xl mb-4 opacity-50">📷</div>
                  <p className="text-gray-500">
                    Generated photo will appear here
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// Helper function (also in aiUgcTypes but keeping here for component use)
function calculateAgeInEra(birthYear: number, era: string): number {
  const eraYear = parseInt(era.slice(0, 4)) + 5
  return eraYear - birthYear
}

