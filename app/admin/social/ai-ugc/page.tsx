'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import type { AiUgcPersonaWithLovedOne } from '@/lib/aiUgcTypes'

// ═══════════════════════════════════════════════════════════════════════════
// AI UGC PERSONA LIST PAGE
// ═══════════════════════════════════════════════════════════════════════════

export default function AiUgcPage() {
  const [personas, setPersonas] = useState<AiUgcPersonaWithLovedOne[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showAddModal, setShowAddModal] = useState(false)

  useEffect(() => {
    fetchPersonas()
  }, [])

  const fetchPersonas = async () => {
    try {
      setLoading(true)
      const res = await fetch('/api/admin/social/ai-ugc/personas')
      const data = await res.json()
      
      if (!res.ok) {
        throw new Error(data.error || 'Failed to fetch personas')
      }
      
      setPersonas(data.personas || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0d1117] p-8">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-2 border-violet-500/30 border-t-violet-500 rounded-full animate-spin" />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0d1117] p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <Link 
                href="/admin/social"
                className="text-gray-500 hover:text-gray-300 transition-colors"
              >
                ← Social
              </Link>
            </div>
            <h1 className="text-3xl font-bold text-white flex items-center gap-3">
              <span className="text-4xl">🤖</span>
              AI UGC Personas
            </h1>
            <p className="text-gray-400 mt-1">
              Manage AI-generated influencer personas and their content
            </p>
          </div>
          
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowAddModal(true)}
              className="px-4 py-2.5 bg-violet-500 text-white rounded-xl font-medium hover:bg-violet-600 transition-all flex items-center gap-2"
            >
              <span>+</span>
              Add Persona
            </button>
            <Link
              href="/admin/social/ai-ugc/generate"
              className="px-4 py-2.5 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-xl font-medium hover:bg-emerald-500/30 transition-all flex items-center gap-2"
            >
              <span>📷</span>
              Generate Photo
            </Link>
            <Link
              href="/admin/social/ai-ugc/create-post"
              className="px-4 py-2.5 bg-violet-500/20 text-violet-400 border border-violet-500/30 rounded-xl font-medium hover:bg-violet-500/30 transition-all flex items-center gap-2"
            >
              <span>✨</span>
              Create Post
            </Link>
          </div>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 mb-6 text-red-400">
            {error}
          </div>
        )}

        {/* Persona Cards Grid */}
        {personas.length === 0 ? (
          <div className="bg-[#161b22] rounded-2xl border border-gray-800 p-12 text-center">
            <div className="text-6xl mb-4">🤖</div>
            <h3 className="text-xl font-semibold text-white mb-2">No Personas Yet</h3>
            <p className="text-gray-400 mb-6">
              Create your first AI persona to start generating content.
            </p>
            <button 
              onClick={() => setShowAddModal(true)}
              className="px-6 py-3 bg-violet-500 text-white rounded-xl font-medium hover:bg-violet-600 transition-colors"
            >
              + Add Persona
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {personas.map((persona) => (
              <PersonaCard 
                key={persona.id} 
                persona={persona} 
                onRefresh={fetchPersonas}
              />
            ))}
          </div>
        )}
      </div>

      {/* Add Persona Modal */}
      {showAddModal && (
        <AddPersonaModal
          onClose={() => setShowAddModal(false)}
          onSaved={() => {
            setShowAddModal(false)
            fetchPersonas()
          }}
        />
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// PERSONA CARD COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

function PersonaCard({ 
  persona, 
  onRefresh 
}: { 
  persona: AiUgcPersonaWithLovedOne
  onRefresh: () => void 
}) {
  const lovedOne = persona.loved_ones?.[0]

  return (
    <div className="bg-[#161b22] rounded-2xl border border-gray-800 overflow-hidden hover:border-gray-700 transition-all group">
      {/* Persona Photo Header */}
      <div className="relative h-48 bg-gradient-to-br from-violet-900/30 to-fuchsia-900/30">
        <img
          src={persona.master_photo_url}
          alt={persona.name}
          className="w-full h-full object-cover"
          onError={(e) => {
            e.currentTarget.style.display = 'none'
          }}
        />
        {/* Overlay gradient */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#161b22] to-transparent" />
        
        {/* Loved one mini photo */}
        {lovedOne && (
          <div className="absolute bottom-4 right-4 w-16 h-16 rounded-xl overflow-hidden border-2 border-[#161b22] shadow-lg">
            <img
              src={lovedOne.master_photo_url}
              alt={lovedOne.name}
              className="w-full h-full object-cover"
              onError={(e) => {
                e.currentTarget.style.display = 'none'
              }}
            />
          </div>
        )}
      </div>

      {/* Persona Info */}
      <div className="p-5">
        <div className="flex items-start justify-between mb-3">
          <div>
            <h3 className="text-xl font-bold text-white">{persona.name}</h3>
            <p className="text-gray-400 text-sm">
              {persona.age} years old • {persona.location || 'Location not set'}
            </p>
          </div>
          {persona.instagram_handle && (
            <span className="text-xs text-pink-400 bg-pink-500/10 px-2 py-1 rounded-lg">
              @{persona.instagram_handle}
            </span>
          )}
        </div>

        {/* Job & Vibe */}
        {(persona.job || persona.vibe) && (
          <div className="mb-4">
            {persona.job && (
              <p className="text-gray-300 text-sm">💼 {persona.job}</p>
            )}
            {persona.vibe && (
              <p className="text-gray-400 text-sm mt-1 line-clamp-2">✨ {persona.vibe}</p>
            )}
          </div>
        )}

        {/* Loved One Info */}
        {lovedOne && (
          <div className="bg-[#0d1117] rounded-xl p-3 mb-4">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-rose-400 text-sm">❤️</span>
              <span className="text-white font-medium">{lovedOne.name}</span>
              <span className="text-gray-500 text-sm">({lovedOne.relationship})</span>
            </div>
            <p className="text-gray-400 text-xs">
              {lovedOne.birth_year} - {lovedOne.death_year} • Passed at {lovedOne.age_at_death}
            </p>
            {lovedOne.keywords && lovedOne.keywords.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {lovedOne.keywords.slice(0, 4).map((keyword, i) => (
                  <span key={i} className="text-xs bg-gray-800 text-gray-400 px-2 py-0.5 rounded">
                    {keyword}
                  </span>
                ))}
                {lovedOne.keywords.length > 4 && (
                  <span className="text-xs text-gray-500">+{lovedOne.keywords.length - 4}</span>
                )}
              </div>
            )}
          </div>
        )}

        {/* Stats */}
        <div className="flex items-center gap-4 mb-4 text-sm">
          <div className="flex items-center gap-1.5">
            <span className="text-emerald-400">📷</span>
            <span className="text-gray-400">{persona.asset_count || 0} assets</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-violet-400">📱</span>
            <span className="text-gray-400">{persona.post_count || 0} posts</span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          <Link
            href={`/admin/social/ai-ugc/${persona.id}`}
            className="flex-1 px-3 py-2 bg-gray-800 text-white text-sm rounded-lg text-center hover:bg-gray-700 transition-colors"
          >
            View/Edit
          </Link>
          <Link
            href={`/admin/social/ai-ugc/generate?persona=${persona.id}`}
            className="px-3 py-2 bg-emerald-500/20 text-emerald-400 text-sm rounded-lg hover:bg-emerald-500/30 transition-colors"
          >
            📷
          </Link>
          <Link
            href={`/admin/social/ai-ugc/create-post?persona=${persona.id}`}
            className="px-3 py-2 bg-violet-500/20 text-violet-400 text-sm rounded-lg hover:bg-violet-500/30 transition-colors"
          >
            ✨
          </Link>
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// ADD PERSONA MODAL
// ═══════════════════════════════════════════════════════════════════════════

function AddPersonaModal({
  onClose,
  onSaved,
}: {
  onClose: () => void
  onSaved: () => void
}) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [step, setStep] = useState<'persona' | 'loved_one'>('persona')
  const [personaId, setPersonaId] = useState<string | null>(null)
  
  // Persona fields
  const [name, setName] = useState('')
  const [age, setAge] = useState('')
  const [birthYear, setBirthYear] = useState('')
  const [gender, setGender] = useState('female')
  const [ethnicity, setEthnicity] = useState('')
  const [location, setLocation] = useState('')
  const [job, setJob] = useState('')
  const [vibe, setVibe] = useState('')
  const [masterPhotoUrl, setMasterPhotoUrl] = useState('')
  const [instagramHandle, setInstagramHandle] = useState('')
  const [tiktokHandle, setTiktokHandle] = useState('')

  // Loved one fields
  const [loName, setLoName] = useState('')
  const [loRelationship, setLoRelationship] = useState('mother')
  const [loGender, setLoGender] = useState('female')
  const [loAgeAtDeath, setLoAgeAtDeath] = useState('')
  const [loBirthYear, setLoBirthYear] = useState('')
  const [loDeathYear, setLoDeathYear] = useState('')
  const [loMasterPhotoUrl, setLoMasterPhotoUrl] = useState('')
  const [loKeywords, setLoKeywords] = useState('')

  const handleSavePersona = async () => {
    if (!name || !age || !birthYear || !masterPhotoUrl) {
      setError('Please fill in required fields: Name, Age, Birth Year, Master Photo URL')
      return
    }

    setSaving(true)
    setError(null)

    try {
      const res = await fetch('/api/admin/social/ai-ugc/personas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          age: parseInt(age),
          birth_year: parseInt(birthYear),
          gender,
          ethnicity: ethnicity || null,
          location: location || null,
          job: job || null,
          vibe: vibe || null,
          master_photo_url: masterPhotoUrl,
          instagram_handle: instagramHandle || null,
          tiktok_handle: tiktokHandle || null,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to create persona')
      }

      setPersonaId(data.persona.id)
      setStep('loved_one')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setSaving(false)
    }
  }

  const handleSaveLovedOne = async () => {
    if (!loName || !loRelationship || !loAgeAtDeath || !loBirthYear || !loDeathYear || !loMasterPhotoUrl) {
      setError('Please fill in all required fields')
      return
    }

    setSaving(true)
    setError(null)

    try {
      const res = await fetch('/api/admin/social/ai-ugc/loved-ones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          persona_id: personaId,
          name: loName,
          relationship: loRelationship,
          gender: loGender,
          age_at_death: parseInt(loAgeAtDeath),
          birth_year: parseInt(loBirthYear),
          death_year: parseInt(loDeathYear),
          master_photo_url: loMasterPhotoUrl,
          keywords: loKeywords ? loKeywords.split(',').map(k => k.trim()) : [],
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to create loved one')
      }

      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setSaving(false)
    }
  }

  const handleSkipLovedOne = () => {
    onSaved()
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-[#161b22] rounded-2xl border border-gray-800 w-full max-w-2xl max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-800">
          <div>
            <h2 className="text-xl font-bold text-white">
              {step === 'persona' ? '👤 Add Persona' : '❤️ Add Loved One'}
            </h2>
            <p className="text-gray-400 text-sm mt-1">
              {step === 'persona' 
                ? 'Create a new AI influencer persona' 
                : `Add a deceased loved one for ${name}`}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto max-h-[60vh]">
          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 mb-6 text-red-400">
              {error}
            </div>
          )}

          {step === 'persona' ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Name *</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Linda Martinez"
                    className="w-full bg-[#0d1117] border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:border-violet-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Age *</label>
                  <input
                    type="number"
                    value={age}
                    onChange={(e) => setAge(e.target.value)}
                    placeholder="34"
                    className="w-full bg-[#0d1117] border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:border-violet-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Birth Year *</label>
                  <input
                    type="number"
                    value={birthYear}
                    onChange={(e) => setBirthYear(e.target.value)}
                    placeholder="1992"
                    className="w-full bg-[#0d1117] border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:border-violet-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Gender</label>
                  <select
                    value={gender}
                    onChange={(e) => setGender(e.target.value)}
                    className="w-full bg-[#0d1117] border border-gray-700 rounded-lg px-3 py-2 text-white focus:border-violet-500 focus:outline-none"
                  >
                    <option value="female">Female</option>
                    <option value="male">Male</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Ethnicity</label>
                  <input
                    type="text"
                    value={ethnicity}
                    onChange={(e) => setEthnicity(e.target.value)}
                    placeholder="Latina, Asian, etc."
                    className="w-full bg-[#0d1117] border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:border-violet-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Location</label>
                  <input
                    type="text"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    placeholder="Austin, TX"
                    className="w-full bg-[#0d1117] border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:border-violet-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-1">Job</label>
                <input
                  type="text"
                  value={job}
                  onChange={(e) => setJob(e.target.value)}
                  placeholder="Marketing Manager"
                  className="w-full bg-[#0d1117] border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:border-violet-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-1">Vibe / Personality</label>
                <textarea
                  value={vibe}
                  onChange={(e) => setVibe(e.target.value)}
                  placeholder="Warm, relatable millennial who shares cooking content and memories of her late mother..."
                  rows={2}
                  className="w-full bg-[#0d1117] border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:border-violet-500 focus:outline-none resize-none"
                />
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-1">Master Photo URL * (S3)</label>
                <input
                  type="text"
                  value={masterPhotoUrl}
                  onChange={(e) => setMasterPhotoUrl(e.target.value)}
                  placeholder="https://heartbeat-photos-prod.s3.amazonaws.com/..."
                  className="w-full bg-[#0d1117] border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:border-violet-500 focus:outline-none text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Instagram Handle</label>
                  <input
                    type="text"
                    value={instagramHandle}
                    onChange={(e) => setInstagramHandle(e.target.value)}
                    placeholder="lindacooks"
                    className="w-full bg-[#0d1117] border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:border-violet-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">TikTok Handle</label>
                  <input
                    type="text"
                    value={tiktokHandle}
                    onChange={(e) => setTiktokHandle(e.target.value)}
                    placeholder="lindacooks"
                    className="w-full bg-[#0d1117] border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:border-violet-500 focus:outline-none"
                  />
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Name *</label>
                  <input
                    type="text"
                    value={loName}
                    onChange={(e) => setLoName(e.target.value)}
                    placeholder="Maria Martinez"
                    className="w-full bg-[#0d1117] border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:border-violet-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Relationship *</label>
                  <select
                    value={loRelationship}
                    onChange={(e) => setLoRelationship(e.target.value)}
                    className="w-full bg-[#0d1117] border border-gray-700 rounded-lg px-3 py-2 text-white focus:border-violet-500 focus:outline-none"
                  >
                    <option value="mother">Mother</option>
                    <option value="father">Father</option>
                    <option value="grandmother">Grandmother</option>
                    <option value="grandfather">Grandfather</option>
                    <option value="sister">Sister</option>
                    <option value="brother">Brother</option>
                    <option value="spouse">Spouse</option>
                    <option value="friend">Friend</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Gender</label>
                  <select
                    value={loGender}
                    onChange={(e) => setLoGender(e.target.value)}
                    className="w-full bg-[#0d1117] border border-gray-700 rounded-lg px-3 py-2 text-white focus:border-violet-500 focus:outline-none"
                  >
                    <option value="female">Female</option>
                    <option value="male">Male</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Age at Death *</label>
                  <input
                    type="number"
                    value={loAgeAtDeath}
                    onChange={(e) => setLoAgeAtDeath(e.target.value)}
                    placeholder="62"
                    className="w-full bg-[#0d1117] border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:border-violet-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Birth Year *</label>
                  <input
                    type="number"
                    value={loBirthYear}
                    onChange={(e) => setLoBirthYear(e.target.value)}
                    placeholder="1958"
                    className="w-full bg-[#0d1117] border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:border-violet-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Death Year *</label>
                  <input
                    type="number"
                    value={loDeathYear}
                    onChange={(e) => setLoDeathYear(e.target.value)}
                    placeholder="2020"
                    className="w-full bg-[#0d1117] border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:border-violet-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-1">Master Photo URL * (S3)</label>
                <input
                  type="text"
                  value={loMasterPhotoUrl}
                  onChange={(e) => setLoMasterPhotoUrl(e.target.value)}
                  placeholder="https://heartbeat-photos-prod.s3.amazonaws.com/..."
                  className="w-full bg-[#0d1117] border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:border-violet-500 focus:outline-none text-sm"
                />
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-1">Keywords (comma separated)</label>
                <input
                  type="text"
                  value={loKeywords}
                  onChange={(e) => setLoKeywords(e.target.value)}
                  placeholder="cooking, gardening, Eagles fan, church"
                  className="w-full bg-[#0d1117] border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:border-violet-500 focus:outline-none"
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-6 border-t border-gray-800">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-400 hover:text-white transition-colors"
          >
            Cancel
          </button>
          
          <div className="flex items-center gap-3">
            {step === 'loved_one' && (
              <button
                onClick={handleSkipLovedOne}
                className="px-4 py-2 text-gray-400 hover:text-white transition-colors"
              >
                Skip for now
              </button>
            )}
            <button
              onClick={step === 'persona' ? handleSavePersona : handleSaveLovedOne}
              disabled={saving}
              className="px-6 py-2 bg-violet-500 text-white rounded-lg font-medium hover:bg-violet-600 transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {saving ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Saving...
                </>
              ) : step === 'persona' ? (
                'Next: Add Loved One →'
              ) : (
                'Save & Finish'
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

