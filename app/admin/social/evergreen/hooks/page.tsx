'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

// ===========================================
// TYPES
// ===========================================

type HookCategory = 'sad' | 'presence' | 'unexpected' | 'time' | 'question'
type TextStyle = 'snapchat' | 'clean'

interface SocialHook {
  id: string
  text: string
  category: HookCategory
  text_style: TextStyle
  times_used: number
  total_views: number | null
  total_likes: number | null
  total_shares: number | null
  avg_engagement: number | null
  created_at: string
}

interface HookForm {
  text: string
  category: HookCategory
  text_style: TextStyle
}

const CATEGORIES: { value: HookCategory; label: string; color: string }[] = [
  { value: 'sad', label: 'Sad', color: 'bg-red-500/20 text-red-400' },
  { value: 'presence', label: 'Presence', color: 'bg-purple-500/20 text-purple-400' },
  { value: 'unexpected', label: 'Unexpected', color: 'bg-amber-500/20 text-amber-400' },
  { value: 'time', label: 'Time', color: 'bg-blue-500/20 text-blue-400' },
  { value: 'question', label: 'Question', color: 'bg-green-500/20 text-green-400' },
]

const TEXT_STYLES: { value: TextStyle; label: string; color: string }[] = [
  { value: 'snapchat', label: 'Snapchat', color: 'bg-pink-500/20 text-pink-400' },
  { value: 'clean', label: 'Clean', color: 'bg-slate-500/20 text-slate-300' },
]

// ===========================================
// HELPER FUNCTIONS
// ===========================================

function getCategoryColor(category: HookCategory): string {
  return CATEGORIES.find(c => c.value === category)?.color || 'bg-gray-500/20 text-gray-400'
}

function getCategoryLabel(category: HookCategory): string {
  return CATEGORIES.find(c => c.value === category)?.label || category
}

function getStyleColor(style: TextStyle): string {
  return TEXT_STYLES.find(s => s.value === style)?.color || 'bg-gray-500/20 text-gray-400'
}

function getStyleLabel(style: TextStyle): string {
  return TEXT_STYLES.find(s => s.value === style)?.label || style
}

function formatEngagement(value: number | null): string {
  if (!value || value === 0) return '—'
  return `${(value * 100).toFixed(1)}%`
}

// ===========================================
// HOOK PREVIEW COMPONENT
// ===========================================

function HookPreview({ text, style }: { text: string; style: TextStyle }) {
  if (!text) {
    return (
      <div className="w-full aspect-[9/16] bg-gray-700 rounded-lg flex items-center justify-center">
        <span className="text-gray-500 text-sm">Enter text to preview</span>
      </div>
    )
  }

  return (
    <div className="w-full aspect-[9/16] bg-gray-700 rounded-lg flex items-center justify-center overflow-hidden relative">
      {/* Simulated phone content background */}
      <div className="absolute inset-0 bg-gradient-to-b from-gray-600 to-gray-800" />
      
      {style === 'snapchat' ? (
        // Snapchat style: rotated, white text with black stroke
        <div 
          className="relative z-10 px-4 text-center"
          style={{ transform: 'rotate(-3deg)' }}
        >
          <span 
            className="text-xl font-semibold text-white"
            style={{
              textShadow: '-2px -2px 0 #000, 2px -2px 0 #000, -2px 2px 0 #000, 2px 2px 0 #000, 0 0 8px rgba(0,0,0,0.5)',
              fontFamily: 'system-ui, -apple-system, sans-serif',
            }}
          >
            {text}
          </span>
        </div>
      ) : (
        // Clean style: centered, uppercase, with background pill
        <div className="relative z-10 px-4">
          <div className="bg-black/50 backdrop-blur-sm px-4 py-2 rounded-lg">
            <span 
              className="text-lg font-bold text-white uppercase tracking-wide"
              style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}
            >
              {text}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

// ===========================================
// MAIN COMPONENT
// ===========================================

export default function HooksPage() {
  const [hooks, setHooks] = useState<SocialHook[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  
  // Filters
  const [categoryFilter, setCategoryFilter] = useState<HookCategory | 'all'>('all')
  const [styleFilter, setStyleFilter] = useState<TextStyle | 'all'>('all')
  
  // Modal state
  const [showModal, setShowModal] = useState(false)
  const [editingHook, setEditingHook] = useState<SocialHook | null>(null)
  const [showDeleteModal, setShowDeleteModal] = useState<string | null>(null)
  
  // Form state
  const [form, setForm] = useState<HookForm>({
    text: '',
    category: 'sad',
    text_style: 'snapchat',
  })

  // Load hooks
  useEffect(() => {
    loadHooks()
  }, [])

  const loadHooks = async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('social_hooks')
        .select('*')
        .order('times_used', { ascending: true }) // Least used first

      if (error) {
        console.error('Error fetching hooks:', error)
        setHooks([])
      } else {
        setHooks((data || []) as any)
      }
    } catch (error) {
      console.error('Error loading hooks:', error)
    } finally {
      setLoading(false)
    }
  }

  // Filter hooks
  const filteredHooks = hooks.filter(hook => {
    if (categoryFilter !== 'all' && hook.category !== categoryFilter) return false
    if (styleFilter !== 'all' && hook.text_style !== styleFilter) return false
    return true
  })

  // Open add modal
  const handleOpenAdd = () => {
    setEditingHook(null)
    setForm({
      text: '',
      category: 'sad',
      text_style: 'snapchat',
    })
    setShowModal(true)
  }

  // Open edit modal
  const handleOpenEdit = (hook: SocialHook) => {
    setEditingHook(hook)
    setForm({
      text: hook.text,
      category: hook.category,
      text_style: hook.text_style,
    })
    setShowModal(true)
  }

  // Save hook (add or update)
  const handleSave = async () => {
    if (!form.text.trim()) {
      alert('Please enter hook text')
      return
    }

    setSaving(true)
    try {
      if (editingHook) {
        // Update existing
        const { error } = await supabase
          .from('social_hooks')
          .update({
            text: form.text.trim(),
            category: form.category,
            text_style: form.text_style,
          })
          .eq('id', editingHook.id)

        if (error) throw error
      } else {
        // Insert new
        const { error } = await supabase
          .from('social_hooks')
          .insert({
            text: form.text.trim(),
            category: form.category,
            text_style: form.text_style,
            times_used: 0,
          })

        if (error) throw error
      }

      setShowModal(false)
      setEditingHook(null)
      loadHooks()
    } catch (error) {
      console.error('Error saving hook:', error)
      alert('Failed to save hook')
    } finally {
      setSaving(false)
    }
  }

  // Delete hook
  const handleDelete = async () => {
    if (!showDeleteModal) return

    setSaving(true)
    try {
      const { error } = await supabase
        .from('social_hooks')
        .delete()
        .eq('id', showDeleteModal)

      if (error) throw error

      setShowDeleteModal(null)
      loadHooks()
    } catch (error) {
      console.error('Error deleting hook:', error)
      alert('Failed to delete hook')
    } finally {
      setSaving(false)
    }
  }

  // Get hook being deleted
  const hookToDelete = showDeleteModal
    ? hooks.find(h => h.id === showDeleteModal)
    : null

  return (
    <div className="p-6 lg:p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">Hooks</h1>
          <p className="text-gray-400 mt-1">Manage text overlays for Slide 1</p>
        </div>
        <button
          onClick={handleOpenAdd}
          className="px-4 py-2 bg-gradient-to-r from-pink-500 to-purple-600 text-white font-semibold rounded-xl hover:from-pink-400 hover:to-purple-500 transition-all shadow-lg shadow-pink-500/20 flex items-center gap-2"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Hook
        </button>
      </div>

      {/* Filter Row */}
      <div className="flex flex-wrap gap-4">
        {/* Category Filter */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500">Category:</span>
          <div className="flex gap-1">
            <button
              onClick={() => setCategoryFilter('all')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                categoryFilter === 'all'
                  ? 'bg-gray-700 text-white'
                  : 'text-gray-400 hover:text-white hover:bg-gray-800'
              }`}
            >
              All
            </button>
            {CATEGORIES.map(cat => (
              <button
                key={cat.value}
                onClick={() => setCategoryFilter(cat.value)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                  categoryFilter === cat.value
                    ? cat.color
                    : 'text-gray-400 hover:text-white hover:bg-gray-800'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>

        {/* Style Filter */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500">Style:</span>
          <div className="flex gap-1">
            <button
              onClick={() => setStyleFilter('all')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                styleFilter === 'all'
                  ? 'bg-gray-700 text-white'
                  : 'text-gray-400 hover:text-white hover:bg-gray-800'
              }`}
            >
              All
            </button>
            {TEXT_STYLES.map(style => (
              <button
                key={style.value}
                onClick={() => setStyleFilter(style.value)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                  styleFilter === style.value
                    ? style.color
                    : 'text-gray-400 hover:text-white hover:bg-gray-800'
                }`}
              >
                {style.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-[#1a1f2e] rounded-2xl border border-gray-800/50 overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-gray-500">Loading hooks...</div>
        ) : filteredHooks.length === 0 ? (
          // Empty State
          <div className="p-12 text-center">
            <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-gray-800 flex items-center justify-center">
              <span className="text-4xl">💬</span>
            </div>
            <h3 className="text-xl font-semibold text-white mb-2">
              {hooks.length === 0 ? 'No hooks yet' : 'No hooks match filters'}
            </h3>
            <p className="text-gray-400 mb-6">
              {hooks.length === 0
                ? 'Add text overlays for your social media content'
                : 'Try adjusting your filters'
              }
            </p>
            {hooks.length === 0 && (
              <button
                onClick={handleOpenAdd}
                className="px-6 py-3 bg-gradient-to-r from-pink-500 to-purple-600 text-white font-semibold rounded-xl hover:from-pink-400 hover:to-purple-500 transition-all"
              >
                Add First Hook
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-800/50">
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-4 py-3">Text</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-4 py-3">Category</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-4 py-3">Style</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-4 py-3">Used</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-4 py-3">Engagement</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800/50">
                {filteredHooks.map(hook => (
                  <tr 
                    key={hook.id}
                    className="hover:bg-gray-800/30 transition-colors"
                  >
                    {/* Text */}
                    <td className="px-4 py-3">
                      <span className="text-white font-medium">{hook.text}</span>
                    </td>

                    {/* Category */}
                    <td className="px-4 py-3">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${getCategoryColor(hook.category)}`}>
                        {getCategoryLabel(hook.category)}
                      </span>
                    </td>

                    {/* Style */}
                    <td className="px-4 py-3">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${getStyleColor(hook.text_style)}`}>
                        {getStyleLabel(hook.text_style)}
                      </span>
                    </td>

                    {/* Used */}
                    <td className="px-4 py-3">
                      <span className="text-gray-400">{hook.times_used}</span>
                    </td>

                    {/* Engagement */}
                    <td className="px-4 py-3">
                      <span className={hook.avg_engagement ? 'text-emerald-400' : 'text-gray-500'}>
                        {formatEngagement(hook.avg_engagement)}
                      </span>
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleOpenEdit(hook)}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-700 transition-colors"
                          title="Edit"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                        <button
                          onClick={() => setShowDeleteModal(hook.id)}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                          title="Delete"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#1a1f2e] rounded-2xl border border-gray-800/50 w-full max-w-2xl">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-gray-800/50 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-white">
                {editingHook ? 'Edit Hook' : 'Add Hook'}
              </h3>
              <button
                onClick={() => setShowModal(false)}
                className="text-gray-400 hover:text-white transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Form Side */}
                <div className="space-y-4">
                  {/* Text */}
                  <div>
                    <label className="block text-sm text-gray-400 mb-2">Hook Text *</label>
                    <div className="relative">
                      <textarea
                        value={form.text}
                        onChange={(e) => setForm(prev => ({ ...prev, text: e.target.value }))}
                        placeholder="miss u 💔"
                        rows={2}
                        className="w-full px-4 py-3 pr-10 bg-[#0f1419] border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-pink-500/50 resize-none"
                      />
                      <div className="absolute right-2 top-3">
                        <details className="relative">
                          <summary className="cursor-pointer list-none p-1 hover:bg-gray-700 rounded transition-colors" title="Add emoji">
                            <span className="text-lg">😊</span>
                          </summary>
                          <div className="absolute right-0 top-full mt-1 bg-gray-800 border border-gray-600 rounded-lg p-2 shadow-xl z-10 w-64">
                            <p className="text-xs text-gray-400 mb-2">Click to add:</p>
                            <div className="flex flex-wrap gap-1">
                              {['💔', '😢', '🥺', '🥲', '💕', '🙏', '✨', '💫', '🕊️', '🌹', '💐', '🦋', '⭐', '💛', '🧡', '❤️', '💜', '🤍', '😭', '🥹', '💗', '🌸', '🌺', '🕯️', '👼', '😊', '🥰', '😍', '🤗', '😇', '🫶', '💖', '💝', '🌟', '🌈', '☀️', '🎉', '💃', '🙌', '👏', '😌', '🤩', '💯'].map(emoji => (
                                <button
                                  key={emoji}
                                  type="button"
                                  onClick={() => setForm(prev => ({ ...prev, text: prev.text + emoji }))}
                                  className="text-xl p-1 hover:bg-gray-700 rounded transition-colors"
                                >
                                  {emoji}
                                </button>
                              ))}
                            </div>
                          </div>
                        </details>
                      </div>
                    </div>
                  </div>

                  {/* Category */}
                  <div>
                    <label className="block text-sm text-gray-400 mb-2">Category *</label>
                    <select
                      value={form.category}
                      onChange={(e) => setForm(prev => ({ ...prev, category: e.target.value as HookCategory }))}
                      className="w-full px-4 py-3 bg-[#0f1419] border border-gray-700 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-pink-500/50"
                    >
                      {CATEGORIES.map(cat => (
                        <option key={cat.value} value={cat.value}>{cat.label}</option>
                      ))}
                    </select>
                  </div>

                  {/* Text Style */}
                  <div>
                    <label className="block text-sm text-gray-400 mb-2">Style *</label>
                    <div className="flex gap-2">
                      {TEXT_STYLES.map(style => (
                        <button
                          key={style.value}
                          onClick={() => setForm(prev => ({ ...prev, text_style: style.value }))}
                          className={`flex-1 px-4 py-3 rounded-xl font-medium transition-all border-2 ${
                            form.text_style === style.value
                              ? 'border-pink-500 bg-pink-500/10 text-white'
                              : 'border-gray-700 bg-[#0f1419] text-gray-400 hover:border-gray-600'
                          }`}
                        >
                          {style.label}
                        </button>
                      ))}
                    </div>
                    <p className="text-xs text-gray-500 mt-2">
                      {form.text_style === 'snapchat' 
                        ? 'Casual, rotated text with black stroke - great for younger demographics'
                        : 'Clean, centered uppercase text with background - more professional look'
                      }
                    </p>
                  </div>
                </div>

                {/* Preview Side */}
                <div>
                  <label className="block text-sm text-gray-400 mb-2">Live Preview</label>
                  <div className="w-48 mx-auto">
                    <HookPreview text={form.text} style={form.text_style} />
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 border-t border-gray-800/50 flex justify-end gap-3">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 text-gray-400 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !form.text.trim()}
                className="px-6 py-2 bg-gradient-to-r from-pink-500 to-purple-600 text-white font-semibold rounded-xl hover:from-pink-400 hover:to-purple-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? 'Saving...' : editingHook ? 'Update Hook' : 'Add Hook'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && hookToDelete && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#1a1f2e] rounded-2xl border border-gray-800/50 w-full max-w-md p-6">
            <div className="text-center">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-500/10 flex items-center justify-center">
                <svg className="w-8 h-8 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </div>

              <h3 className="text-xl font-semibold text-white mb-2">Delete Hook?</h3>
              
              <div className="bg-gray-800 rounded-lg p-3 my-4">
                <p className="text-white font-medium">{hookToDelete.text}</p>
              </div>

              <p className="text-gray-400 mb-4">
                This action cannot be undone.
              </p>

              {hookToDelete.times_used > 0 && (
                <p className="text-amber-400 text-sm mb-4">
                  ⚠️ This hook has been used {hookToDelete.times_used} time{hookToDelete.times_used !== 1 ? 's' : ''}.
                </p>
              )}

              <div className="flex gap-3">
                <button
                  onClick={() => setShowDeleteModal(null)}
                  className="flex-1 px-4 py-2.5 bg-gray-800 text-gray-300 font-medium rounded-xl hover:bg-gray-700 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDelete}
                  disabled={saving}
                  className="flex-1 px-4 py-2.5 bg-red-500 text-white font-medium rounded-xl hover:bg-red-400 transition-colors disabled:opacity-50"
                >
                  {saving ? 'Deleting...' : 'Delete'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

