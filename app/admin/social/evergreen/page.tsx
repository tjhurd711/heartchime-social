'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

// ===========================================
// TYPES
// ===========================================

type PostStatus = 'draft' | 'pending' | 'notified' | 'posted' | 'failed'
type Platform = 'tiktok' | 'instagram' | 'both'
type PostType = 'birthday' | 'passing_anniversary' | 'wedding_anniversary' | 'user_birthday' | 'generic'

interface SocialPost {
  id: string
  status: PostStatus
  scheduled_time: string | null
  notified_at: string | null
  posted_at: string | null
  platform: Platform
  post_type: PostType
  slide_1_url: string | null
  slide_2_url: string | null
  hook_text: string | null
  deceased_nickname: string | null
  deceased_relationship: string | null
  caption: string | null
  views: number | null
  likes: number | null
  comments: number | null
  shares: number | null
  created_at: string
}

type FilterTab = 'all' | 'draft' | 'pending' | 'notified' | 'posted'

// ===========================================
// HELPER FUNCTIONS
// ===========================================

function getPostTypeEmoji(type: PostType): string {
  switch (type) {
    case 'birthday': return '🎂'
    case 'passing_anniversary': return '🕯️'
    case 'wedding_anniversary': return '💍'
    case 'user_birthday': return '🎁'
    case 'generic': return '💭'
    default: return '📱'
  }
}

function getPostTypeLabel(type: PostType): string {
  switch (type) {
    case 'birthday': return 'Birthday'
    case 'passing_anniversary': return 'Anniversary'
    case 'wedding_anniversary': return 'Wedding Anniversary'
    case 'user_birthday': return 'User Birthday'
    case 'generic': return 'Generic'
    default: return type
  }
}

function getStatusColor(status: PostStatus): string {
  switch (status) {
    case 'draft': return 'bg-gray-500/20 text-gray-400'
    case 'pending': return 'bg-amber-500/20 text-amber-400'
    case 'notified': return 'bg-blue-500/20 text-blue-400'
    case 'posted': return 'bg-emerald-500/20 text-emerald-400'
    case 'failed': return 'bg-red-500/20 text-red-400'
    default: return 'bg-gray-500/20 text-gray-400'
  }
}

function getStatusLabel(status: PostStatus): string {
  switch (status) {
    case 'draft': return 'Draft'
    case 'pending': return 'Scheduled'
    case 'notified': return 'Ready'
    case 'posted': return 'Posted'
    case 'failed': return 'Failed'
    default: return status
  }
}

function formatRelativeTime(dateStr: string | null): string {
  if (!dateStr) return '—'
  
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = date.getTime() - now.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
  const diffMinutes = Math.floor(diffMs / (1000 * 60))
  
  // Past dates
  if (diffMs < 0) {
    const absDays = Math.abs(diffDays)
    const absHours = Math.abs(diffHours)
    const absMinutes = Math.abs(diffMinutes)
    
    if (absDays > 7) {
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    }
    if (absDays >= 1) return `${absDays}d ago`
    if (absHours >= 1) return `${absHours}h ago`
    if (absMinutes >= 1) return `${absMinutes}m ago`
    return 'Just now'
  }
  
  // Future dates
  if (diffDays > 7) {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }
  if (diffDays >= 1) return `in ${diffDays}d`
  if (diffHours >= 1) return `in ${diffHours}h`
  if (diffMinutes >= 1) return `in ${diffMinutes}m`
  return 'Now'
}

function truncate(str: string | null, length: number): string {
  if (!str) return '—'
  if (str.length <= length) return str
  return str.slice(0, length) + '...'
}

// ===========================================
// PLATFORM ICONS
// ===========================================

function TikTokIcon({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z"/>
    </svg>
  )
}

function InstagramIcon({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
    </svg>
  )
}

function PlatformBadge({ platform }: { platform: Platform }) {
  return (
    <div className="flex items-center gap-1.5">
      {(platform === 'tiktok' || platform === 'both') && (
        <TikTokIcon className="w-4 h-4 text-gray-400" />
      )}
      {(platform === 'instagram' || platform === 'both') && (
        <InstagramIcon className="w-4 h-4 text-gray-400" />
      )}
    </div>
  )
}

// ===========================================
// MAIN COMPONENT
// ===========================================

export default function EvergreenDashboard() {
  const router = useRouter()
  const [posts, setPosts] = useState<SocialPost[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<FilterTab>('all')
  const [stats, setStats] = useState({
    drafts: 0,
    scheduled: 0,
    ready: 0,
    postedThisWeek: 0,
  })

  // Load posts and stats
  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setLoading(true)
    try {
      // Fetch all posts
      const { data: postsData, error: postsError } = await supabase
        .from('social_posts')
        .select('*')
        .order('created_at', { ascending: false })

      if (postsError) {
        console.error('Error fetching posts:', postsError)
        setPosts([])
      } else {
        setPosts((postsData || []) as any)
      }

      // Calculate stats
      const allPosts = postsData || []
      const sevenDaysAgo = new Date()
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

      setStats({
        drafts: allPosts.filter(p => p.status === 'draft').length,
        scheduled: allPosts.filter(p => p.status === 'pending').length,
        ready: allPosts.filter(p => p.status === 'notified').length,
        postedThisWeek: allPosts.filter(p => 
          p.status === 'posted' && 
          p.posted_at && 
          new Date(p.posted_at) > sevenDaysAgo
        ).length,
      })
    } catch (error) {
      console.error('Error loading data:', error)
    } finally {
      setLoading(false)
    }
  }

  // Filter posts based on active tab
  const filteredPosts = posts.filter(post => {
    if (activeTab === 'all') return true
    if (activeTab === 'draft') return post.status === 'draft'
    if (activeTab === 'pending') return post.status === 'pending'
    if (activeTab === 'notified') return post.status === 'notified'
    if (activeTab === 'posted') return post.status === 'posted'
    return true
  })

  // Delete post
  const handleDelete = async (e: React.MouseEvent, postId: string) => {
    e.stopPropagation()
    if (!confirm('Are you sure you want to delete this post?')) return

    const { error } = await supabase
      .from('social_posts')
      .delete()
      .eq('id', postId)

    if (error) {
      console.error('Error deleting post:', error)
      alert('Failed to delete post')
    } else {
      loadData()
    }
  }

  // Navigate to post detail
  const handleRowClick = (postId: string) => {
    router.push(`/admin/social/evergreen/${postId}`)
  }

  // Navigate to create
  const handleCreateClick = () => {
    router.push('/admin/social/evergreen/create')
  }

  return (
    <div className="p-6 lg:p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">🌲 Evergreen Content</h1>
          <p className="text-gray-400 mt-1">Birthday, anniversary, and generic posts</p>
        </div>
        <button
          onClick={handleCreateClick}
          className="px-4 py-2 bg-gradient-to-r from-pink-500 to-purple-600 text-white font-semibold rounded-xl hover:from-pink-400 hover:to-purple-500 transition-all shadow-lg shadow-pink-500/20 flex items-center gap-2"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Create Post
        </button>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-[#1a1f2e] rounded-xl p-4 border border-gray-800/50">
          <div className="flex items-center justify-between">
            <span className="text-gray-400 text-sm">Drafts</span>
            <span className="text-2xl">📝</span>
          </div>
          <p className="text-3xl font-bold text-white mt-2">{stats.drafts}</p>
        </div>
        <div className="bg-[#1a1f2e] rounded-xl p-4 border border-gray-800/50">
          <div className="flex items-center justify-between">
            <span className="text-gray-400 text-sm">Scheduled</span>
            <span className="text-2xl">📅</span>
          </div>
          <p className="text-3xl font-bold text-amber-400 mt-2">{stats.scheduled}</p>
        </div>
        <div className="bg-[#1a1f2e] rounded-xl p-4 border border-gray-800/50">
          <div className="flex items-center justify-between">
            <span className="text-gray-400 text-sm">Ready to Post</span>
            <span className="text-2xl">🚀</span>
          </div>
          <p className="text-3xl font-bold text-blue-400 mt-2">{stats.ready}</p>
        </div>
        <div className="bg-[#1a1f2e] rounded-xl p-4 border border-gray-800/50">
          <div className="flex items-center justify-between">
            <span className="text-gray-400 text-sm">Posted This Week</span>
            <span className="text-2xl">✅</span>
          </div>
          <p className="text-3xl font-bold text-emerald-400 mt-2">{stats.postedThisWeek}</p>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2 border-b border-gray-800/50 pb-2">
        {[
          { key: 'all', label: 'All' },
          { key: 'draft', label: 'Drafts' },
          { key: 'pending', label: 'Scheduled' },
          { key: 'notified', label: 'Ready' },
          { key: 'posted', label: 'Posted' },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key as FilterTab)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === tab.key
                ? 'bg-pink-500/20 text-pink-400'
                : 'text-gray-400 hover:text-white hover:bg-gray-800/50'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Posts Table / Content */}
      <div className="bg-[#1a1f2e] rounded-2xl border border-gray-800/50 overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-gray-500">
            Loading posts...
          </div>
        ) : filteredPosts.length === 0 ? (
          // Empty State
          <div className="p-12 text-center">
            <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-gray-800 flex items-center justify-center">
              <span className="text-4xl">🌲</span>
            </div>
            <h3 className="text-xl font-semibold text-white mb-2">
              {activeTab === 'all' ? 'No evergreen posts yet' : `No ${activeTab} posts`}
            </h3>
            <p className="text-gray-400 mb-6">
              {activeTab === 'all' 
                ? 'Create your first evergreen social media post'
                : 'No posts match this filter'
              }
            </p>
            {activeTab === 'all' && (
              <button
                onClick={handleCreateClick}
                className="px-6 py-3 bg-gradient-to-r from-pink-500 to-purple-600 text-white font-semibold rounded-xl hover:from-pink-400 hover:to-purple-500 transition-all"
              >
                Create First Post
              </button>
            )}
          </div>
        ) : (
          // Posts Table
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-800/50">
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-4 py-3">Preview</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-4 py-3">Type</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-4 py-3">Hook</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-4 py-3">Platform</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-4 py-3">Scheduled</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-4 py-3">Status</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800/50">
                {filteredPosts.map(post => (
                  <tr 
                    key={post.id}
                    onClick={() => handleRowClick(post.id)}
                    className="hover:bg-gray-800/30 transition-colors cursor-pointer"
                  >
                    {/* Preview Thumbnail */}
                    <td className="px-4 py-3">
                      <div 
                        className="w-10 h-[71px] rounded-lg overflow-hidden bg-gray-800 flex-shrink-0"
                        style={{ aspectRatio: '9/16' }}
                      >
                        {post.slide_1_url ? (
                          <img 
                            src={post.slide_1_url} 
                            alt="Preview" 
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-gray-600">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                          </div>
                        )}
                      </div>
                    </td>

                    {/* Type */}
                    <td className="px-4 py-3">
                      <span className="text-white">
                        {getPostTypeEmoji(post.post_type)} {getPostTypeLabel(post.post_type)}
                      </span>
                    </td>

                    {/* Hook */}
                    <td className="px-4 py-3">
                      <span className="text-gray-300 text-sm">
                        {truncate(post.hook_text, 30)}
                      </span>
                    </td>

                    {/* Platform */}
                    <td className="px-4 py-3">
                      <PlatformBadge platform={post.platform} />
                    </td>

                    {/* Scheduled */}
                    <td className="px-4 py-3">
                      <span className="text-gray-400 text-sm">
                        {formatRelativeTime(post.scheduled_time)}
                      </span>
                    </td>

                    {/* Status */}
                    <td className="px-4 py-3">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${getStatusColor(post.status)}`}>
                        {getStatusLabel(post.status)}
                      </span>
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            router.push(`/admin/social/evergreen/${post.id}`)
                          }}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-700 transition-colors"
                          title="View"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                          </svg>
                        </button>
                        <button
                          onClick={(e) => handleDelete(e, post.id)}
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

      {/* Quick Stats for Posted */}
      {filteredPosts.some(p => p.status === 'posted' && (p.views || p.likes || p.comments)) && (
        <div className="bg-[#1a1f2e] rounded-xl p-4 border border-gray-800/50">
          <h3 className="text-sm font-medium text-gray-400 mb-3">Performance Overview</h3>
          <div className="grid grid-cols-4 gap-4 text-center">
            <div>
              <p className="text-2xl font-bold text-white">
                {filteredPosts.reduce((sum, p) => sum + (p.views || 0), 0).toLocaleString()}
              </p>
              <p className="text-xs text-gray-500">Total Views</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-pink-400">
                {filteredPosts.reduce((sum, p) => sum + (p.likes || 0), 0).toLocaleString()}
              </p>
              <p className="text-xs text-gray-500">Total Likes</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-blue-400">
                {filteredPosts.reduce((sum, p) => sum + (p.comments || 0), 0).toLocaleString()}
              </p>
              <p className="text-xs text-gray-500">Total Comments</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-purple-400">
                {filteredPosts.reduce((sum, p) => sum + (p.shares || 0), 0).toLocaleString()}
              </p>
              <p className="text-xs text-gray-500">Total Shares</p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

