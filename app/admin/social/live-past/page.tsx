'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import ImageSearchModal from '@/app/admin/components/ImageSearchModal'

// ===========================================
// TYPES
// ===========================================

type Category = 'music' | 'movies_tv' | 'sports' | 'holidays' | 'people' | 'life'
type Slide3Type = 'album_art' | 'movie_poster' | 'none'

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
  last_used_at: string | null
  created_at: string
}

interface MomentForm {
  title: string
  date_occurred: string
  category: Category
  context_prompt: string
  suggested_hook: string
  media_title: string
  media_artist: string
  media_thumbnail_url: string
  slide_3_type: Slide3Type
  is_recurring: boolean
}

const CATEGORIES: { value: Category; label: string; color: string }[] = [
  { value: 'music', label: 'Music', color: 'bg-pink-500/20 text-pink-400' },
  { value: 'movies_tv', label: 'Movies & TV', color: 'bg-purple-500/20 text-purple-400' },
  { value: 'sports', label: 'Sports', color: 'bg-green-500/20 text-green-400' },
  { value: 'holidays', label: 'Holidays', color: 'bg-amber-500/20 text-amber-400' },
  { value: 'people', label: 'People', color: 'bg-blue-500/20 text-blue-400' },
  { value: 'life', label: 'Life', color: 'bg-cyan-500/20 text-cyan-400' },
]

const SLIDE_3_TYPES: { value: Slide3Type; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'album_art', label: 'Album Art' },
  { value: 'movie_poster', label: 'Movie Poster' },
]

// ===========================================
// HELPER FUNCTIONS
// ===========================================

function getCategoryColor(category: string): string {
  return CATEGORIES.find(c => c.value === category)?.color || 'bg-gray-500/20 text-gray-400'
}

function getCategoryLabel(category: string): string {
  return CATEGORIES.find(c => c.value === category)?.label || category
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00')
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function truncate(str: string | null, length: number): string {
  if (!str) return '—'
  if (str.length <= length) return str
  return str.slice(0, length) + '...'
}

function buildImageSearchQuery(
  category: string,
  mediaTitle?: string | null,
  mediaArtist?: string | null,
  title?: string
): string {
  switch (category) {
    case 'music':
      if (mediaArtist && mediaTitle) return `${mediaArtist} ${mediaTitle} album cover`
      if (mediaArtist) return `${mediaArtist} artist photo`
      return `${title || 'music'} album cover`
    case 'movies_tv':
      if (mediaTitle) return `${mediaTitle} movie poster`
      return `${title || 'movie'} poster`
    case 'people':
      if (mediaArtist) return `${mediaArtist} portrait photo`
      return `${title || 'celebrity'} photo`
    case 'sports':
      return `${title || 'sports moment'} photo`
    default:
      return title || 'image'
  }
}

// ===========================================
// MAIN COMPONENT
// ===========================================

export default function LivePastPage() {
  const [moments, setMoments] = useState<CulturalMoment[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // Filters
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<Category | 'all'>('all')

  // Modal state
  const [showModal, setShowModal] = useState(false)
  const [editingMoment, setEditingMoment] = useState<CulturalMoment | null>(null)
  const [showDeleteModal, setShowDeleteModal] = useState<string | null>(null)

  // Image search modal state
  const [showImageSearch, setShowImageSearch] = useState(false)
  const [imageSearchQuery, setImageSearchQuery] = useState('')

  // Form state
  const [form, setForm] = useState<MomentForm>({
    title: '',
    date_occurred: '',
    category: 'music',
    context_prompt: '',
    suggested_hook: '',
    media_title: '',
    media_artist: '',
    media_thumbnail_url: '',
    slide_3_type: 'none',
    is_recurring: true,
  })

  // Load moments
  useEffect(() => {
    loadMoments()
  }, [])

  const loadMoments = async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('social_cultural_moments')
        .select('*')
        .order('date_occurred', { ascending: false })

      if (error) {
        console.error('Error fetching moments:', error)
        setMoments([])
      } else {
        setMoments((data || []) as any)
      }
    } catch (error) {
      console.error('Error loading moments:', error)
    } finally {
      setLoading(false)
    }
  }

  // Filter moments
  const filteredMoments = useMemo(() => {
    return moments.filter(moment => {
      // Category filter
      if (categoryFilter !== 'all' && moment.category !== categoryFilter) return false

      // Search filter
      if (search.trim()) {
        const searchLower = search.toLowerCase()
        const matchesTitle = moment.title.toLowerCase().includes(searchLower)
        const matchesMediaTitle = moment.media_title?.toLowerCase().includes(searchLower)
        const matchesMediaArtist = moment.media_artist?.toLowerCase().includes(searchLower)
        if (!matchesTitle && !matchesMediaTitle && !matchesMediaArtist) return false
      }

      return true
    })
  }, [moments, categoryFilter, search])

  // Open add modal
  const handleOpenAdd = () => {
    setEditingMoment(null)
    setForm({
      title: '',
      date_occurred: '',
      category: 'music',
      context_prompt: '',
      suggested_hook: '',
      media_title: '',
      media_artist: '',
      media_thumbnail_url: '',
      slide_3_type: 'none',
      is_recurring: true,
    })
    setShowModal(true)
  }

  // Open edit modal
  const handleOpenEdit = (moment: CulturalMoment) => {
    setEditingMoment(moment)
    setForm({
      title: moment.title,
      date_occurred: moment.date_occurred,
      category: moment.category as Category,
      context_prompt: moment.context_prompt || '',
      suggested_hook: moment.suggested_hook || '',
      media_title: moment.media_title || '',
      media_artist: moment.media_artist || '',
      media_thumbnail_url: moment.media_thumbnail_url || '',
      slide_3_type: (moment.slide_3_type as Slide3Type) || 'none',
      is_recurring: moment.is_recurring,
    })
    setShowModal(true)
  }

  // Save moment (add or update)
  const handleSave = async () => {
    if (!form.title.trim() || !form.date_occurred) {
      alert('Please fill in title and date')
      return
    }

    setSaving(true)
    try {
      if (editingMoment) {
        // Update existing
        const { error } = await supabase
          .from('social_cultural_moments')
          .update({
            title: form.title.trim(),
            date_occurred: form.date_occurred,
            category: form.category,
            context_prompt: form.context_prompt.trim() || null,
            suggested_hook: form.suggested_hook.trim() || null,
            media_title: form.media_title.trim() || null,
            media_artist: form.media_artist.trim() || null,
            media_thumbnail_url: form.media_thumbnail_url.trim() || null,
            slide_3_type: form.slide_3_type,
            is_recurring: form.is_recurring,
          })
          .eq('id', editingMoment.id)

        if (error) throw error
      } else {
        // Insert new
        const { error } = await supabase
          .from('social_cultural_moments')
          .insert({
            title: form.title.trim(),
            date_occurred: form.date_occurred,
            category: form.category,
            context_prompt: form.context_prompt.trim() || null,
            suggested_hook: form.suggested_hook.trim() || null,
            media_title: form.media_title.trim() || null,
            media_artist: form.media_artist.trim() || null,
            media_thumbnail_url: form.media_thumbnail_url.trim() || null,
            slide_3_type: form.slide_3_type,
            is_recurring: form.is_recurring,
            times_used: 0,
          })

        if (error) throw error
      }

      setShowModal(false)
      setEditingMoment(null)
      loadMoments()
    } catch (error) {
      console.error('Error saving moment:', error)
      alert('Failed to save moment')
    } finally {
      setSaving(false)
    }
  }

  // Delete moment
  const handleDelete = async () => {
    if (!showDeleteModal) return

    setSaving(true)
    try {
      const { error } = await supabase
        .from('social_cultural_moments')
        .delete()
        .eq('id', showDeleteModal)

      if (error) throw error

      setShowDeleteModal(null)
      loadMoments()
    } catch (error) {
      console.error('Error deleting moment:', error)
      alert('Failed to delete moment')
    } finally {
      setSaving(false)
    }
  }

  // Get moment being deleted
  const momentToDelete = showDeleteModal
    ? moments.find(m => m.id === showDeleteModal)
    : null

  return (
    <div className="p-6 lg:p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link 
              href="/admin/social"
              className="text-gray-400 hover:text-white text-sm"
            >
              Social Command Center
            </Link>
            <span className="text-gray-600">/</span>
            <span className="text-gray-300 text-sm">Live Past</span>
          </div>
          <h1 className="text-3xl font-bold text-white">📅 Cultural Moments</h1>
          <p className="text-gray-400 mt-1">Manage cultural moments for Live Past pipeline</p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/admin/social/live-past/create"
            className="px-5 py-2.5 bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-semibold rounded-xl hover:opacity-90 transition-opacity flex items-center gap-2"
          >
            <span>🎬</span> Create Post
          </Link>
          <button
            onClick={handleOpenAdd}
            className="px-4 py-2 bg-gradient-to-r from-pink-500 to-purple-600 text-white font-semibold rounded-xl hover:from-pink-400 hover:to-purple-500 transition-all shadow-lg shadow-pink-500/20 flex items-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Moment
          </button>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="flex flex-wrap items-center gap-4">
        {/* Search Input */}
        <div className="flex-1 min-w-[250px] max-w-md">
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search title, media, artist..."
              className="w-full pl-10 pr-4 py-2.5 bg-[#0f1419] border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-pink-500/50"
            />
          </div>
        </div>

        {/* Category Filter */}
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value as Category | 'all')}
          className="px-4 py-2.5 bg-[#0f1419] border border-gray-700 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-pink-500/50"
        >
          <option value="all">All Categories</option>
          {CATEGORIES.map(cat => (
            <option key={cat.value} value={cat.value}>{cat.label}</option>
          ))}
        </select>

        {/* Count Badge */}
        <span className="px-3 py-1.5 bg-[#1a1f2e] rounded-full text-sm text-gray-400 border border-gray-800">
          Showing {filteredMoments.length} of {moments.length} moments
        </span>
      </div>

      {/* Table */}
      <div className="bg-[#1a1f2e] rounded-2xl border border-gray-800/50 overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-gray-500">Loading moments...</div>
        ) : filteredMoments.length === 0 ? (
          // Empty State
          <div className="p-12 text-center">
            <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-gray-800 flex items-center justify-center">
              <span className="text-4xl">📅</span>
            </div>
            <h3 className="text-xl font-semibold text-white mb-2">
              {moments.length === 0 ? 'No cultural moments yet' : 'No moments match filters'}
            </h3>
            <p className="text-gray-400 mb-6">
              {moments.length === 0
                ? 'Add your first cultural moment to get started'
                : 'Try adjusting your search or filters'
              }
            </p>
            {moments.length === 0 && (
              <button
                onClick={handleOpenAdd}
                className="px-6 py-3 bg-gradient-to-r from-pink-500 to-purple-600 text-white font-semibold rounded-xl hover:from-pink-400 hover:to-purple-500 transition-all"
              >
                Add First Moment
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-800/50">
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-4 py-3">Title</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-4 py-3">Date</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-4 py-3">Category</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-4 py-3">Media</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-4 py-3">Slide 3</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-4 py-3">Recurring</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-4 py-3">Used</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-4 py-3">Actions</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800/50">
                {filteredMoments.map(moment => (
                  <tr 
                    key={moment.id}
                    className="hover:bg-gray-800/30 transition-colors"
                  >
                    {/* Title */}
                    <td className="px-4 py-3">
                      <span className="text-white font-medium">{truncate(moment.title, 40)}</span>
                    </td>

                    {/* Date */}
                    <td className="px-4 py-3">
                      <span className="text-gray-300 text-sm">{formatDate(moment.date_occurred)}</span>
                    </td>

                    {/* Category */}
                    <td className="px-4 py-3">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${getCategoryColor(moment.category)}`}>
                        {getCategoryLabel(moment.category)}
                      </span>
                    </td>

                    {/* Media */}
                    <td className="px-4 py-3">
                      {moment.media_title || moment.media_artist ? (
                        <span className="text-gray-300 text-sm">
                          {moment.media_title && <span>{truncate(moment.media_title, 20)}</span>}
                          {moment.media_title && moment.media_artist && <span className="text-gray-500"> by </span>}
                          {moment.media_artist && <span className="text-gray-400">{truncate(moment.media_artist, 15)}</span>}
                        </span>
                      ) : (
                        <span className="text-gray-500 text-sm">—</span>
                      )}
                    </td>

                    {/* Slide 3 Type */}
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded text-xs ${
                        moment.slide_3_type === 'album_art' ? 'bg-blue-500/20 text-blue-400' :
                        moment.slide_3_type === 'movie_poster' ? 'bg-purple-500/20 text-purple-400' :
                        'bg-gray-500/20 text-gray-400'
                      }`}>
                        {moment.slide_3_type || 'none'}
                      </span>
                    </td>

                    {/* Recurring */}
                    <td className="px-4 py-3">
                      <span className={moment.is_recurring ? 'text-emerald-400' : 'text-gray-500'}>
                        {moment.is_recurring ? '✓' : '—'}
                      </span>
                    </td>

                    {/* Used */}
                    <td className="px-4 py-3">
                      <span className="text-gray-400">{moment.times_used}</span>
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleOpenEdit(moment)}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-700 transition-colors"
                          title="Edit"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                        <button
                          onClick={() => setShowDeleteModal(moment.id)}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                          title="Delete"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </td>

                    {/* Create Post */}
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/social/live-past/create?momentId=${moment.id}`}
                        className="px-3 py-1.5 bg-gradient-to-r from-pink-500 to-purple-600 text-white text-xs font-semibold rounded-lg hover:opacity-90 transition-opacity"
                      >
                        Create Post
                      </Link>
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
          <div className="bg-[#1a1f2e] rounded-2xl border border-gray-800/50 w-full max-w-3xl max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-gray-800/50 flex items-center justify-between sticky top-0 bg-[#1a1f2e] z-10">
              <h3 className="text-lg font-semibold text-white">
                {editingMoment ? 'Edit Cultural Moment' : 'Add Cultural Moment'}
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
            <div className="p-6 space-y-4">
              {/* Row 1: Title + Date */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-2">Title *</label>
                  <input
                    type="text"
                    value={form.title}
                    onChange={(e) => setForm(prev => ({ ...prev, title: e.target.value }))}
                    placeholder="e.g., Whitney Houston passes away"
                    className="w-full px-4 py-3 bg-[#0f1419] border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-pink-500/50"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-2">Date Occurred *</label>
                  <input
                    type="date"
                    value={form.date_occurred}
                    onChange={(e) => setForm(prev => ({ ...prev, date_occurred: e.target.value }))}
                    className="w-full px-4 py-3 bg-[#0f1419] border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-pink-500/50"
                  />
                </div>
              </div>

              {/* Row 2: Category + Slide 3 Type */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-2">Category *</label>
                  <select
                    value={form.category}
                    onChange={(e) => setForm(prev => ({ ...prev, category: e.target.value as Category }))}
                    className="w-full px-4 py-3 bg-[#0f1419] border border-gray-700 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-pink-500/50"
                  >
                    {CATEGORIES.map(cat => (
                      <option key={cat.value} value={cat.value}>{cat.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-2">Slide 3 Type</label>
                  <select
                    value={form.slide_3_type}
                    onChange={(e) => setForm(prev => ({ ...prev, slide_3_type: e.target.value as Slide3Type }))}
                    className="w-full px-4 py-3 bg-[#0f1419] border border-gray-700 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-pink-500/50"
                  >
                    {SLIDE_3_TYPES.map(type => (
                      <option key={type.value} value={type.value}>{type.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Row 3: Media Title + Media Artist */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-2">Media Title</label>
                  <input
                    type="text"
                    value={form.media_title}
                    onChange={(e) => setForm(prev => ({ ...prev, media_title: e.target.value }))}
                    placeholder="e.g., I Will Always Love You"
                    className="w-full px-4 py-3 bg-[#0f1419] border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-pink-500/50"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-2">Media Artist</label>
                  <input
                    type="text"
                    value={form.media_artist}
                    onChange={(e) => setForm(prev => ({ ...prev, media_artist: e.target.value }))}
                    placeholder="e.g., Whitney Houston"
                    className="w-full px-4 py-3 bg-[#0f1419] border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-pink-500/50"
                  />
                </div>
              </div>

              {/* Context Prompt (full width) */}
              <div>
                <label className="block text-sm text-gray-400 mb-2">Context Prompt</label>
                <textarea
                  value={form.context_prompt}
                  onChange={(e) => setForm(prev => ({ ...prev, context_prompt: e.target.value }))}
                  placeholder="Context for AI to generate captions..."
                  rows={3}
                  className="w-full px-4 py-3 bg-[#0f1419] border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-pink-500/50 resize-none"
                />
              </div>

              {/* Suggested Hook (full width) */}
              <div>
                <label className="block text-sm text-gray-400 mb-2">Suggested Hook</label>
                <input
                  type="text"
                  value={form.suggested_hook}
                  onChange={(e) => setForm(prev => ({ ...prev, suggested_hook: e.target.value }))}
                  placeholder="e.g., she showed up today 💔"
                  className="w-full px-4 py-3 bg-[#0f1419] border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-pink-500/50"
                />
              </div>

              {/* Media Thumbnail URL (full width) */}
              <div>
                <label className="block text-sm text-gray-400 mb-2">Media Thumbnail URL</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={form.media_thumbnail_url}
                    onChange={(e) => setForm(prev => ({ ...prev, media_thumbnail_url: e.target.value }))}
                    placeholder="Paste image URL"
                    className="flex-1 px-4 py-3 bg-[#0f1419] border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-pink-500/50"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const query = buildImageSearchQuery(form.category, form.media_title, form.media_artist, form.title)
                      setImageSearchQuery(query)
                      setShowImageSearch(true)
                    }}
                    className="px-4 py-3 bg-[#1a1f2e] border border-gray-700 rounded-xl text-amber-400 hover:bg-[#252b3b] transition-colors whitespace-nowrap"
                  >
                    🔍 Find Image
                  </button>
                </div>
                {form.media_thumbnail_url && (
                  <img
                    src={form.media_thumbnail_url}
                    alt="Preview"
                    className="mt-2 h-20 rounded-lg object-cover"
                  />
                )}
              </div>

              {/* Is Recurring Toggle */}
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setForm(prev => ({ ...prev, is_recurring: !prev.is_recurring }))}
                  className={`relative w-12 h-6 rounded-full transition-colors ${
                    form.is_recurring ? 'bg-pink-500' : 'bg-gray-600'
                  }`}
                >
                  <span 
                    className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${
                      form.is_recurring ? 'left-7' : 'left-1'
                    }`}
                  />
                </button>
                <label className="text-sm text-gray-300">
                  Recurring annually
                </label>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 border-t border-gray-800/50 flex justify-end gap-3 sticky bottom-0 bg-[#1a1f2e]">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 text-gray-400 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !form.title.trim() || !form.date_occurred}
                className="px-6 py-2 bg-gradient-to-r from-pink-500 to-purple-600 text-white font-semibold rounded-xl hover:from-pink-400 hover:to-purple-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? 'Saving...' : editingMoment ? 'Update Moment' : 'Add Moment'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && momentToDelete && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#1a1f2e] rounded-2xl border border-gray-800/50 w-full max-w-md p-6">
            <div className="text-center">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-500/10 flex items-center justify-center">
                <svg className="w-8 h-8 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </div>

              <h3 className="text-xl font-semibold text-white mb-2">Delete Moment?</h3>
              
              <div className="bg-gray-800 rounded-lg p-3 my-4">
                <p className="text-white font-medium">{momentToDelete.title}</p>
                <p className="text-gray-400 text-sm mt-1">{formatDate(momentToDelete.date_occurred)}</p>
              </div>

              <p className="text-gray-400 mb-4">
                This action cannot be undone.
              </p>

              {momentToDelete.times_used > 0 && (
                <p className="text-amber-400 text-sm mb-4">
                  ⚠️ This moment has been used {momentToDelete.times_used} time{momentToDelete.times_used !== 1 ? 's' : ''}.
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

      {/* Image Search Modal */}
      <ImageSearchModal
        isOpen={showImageSearch}
        onClose={() => setShowImageSearch(false)}
        onSelect={(url: string) => {
          setForm(prev => ({ ...prev, media_thumbnail_url: url }))
          setShowImageSearch(false)
        }}
        initialQuery={imageSearchQuery}
      />
    </div>
  )
}
