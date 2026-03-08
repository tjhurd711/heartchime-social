'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

// ===========================================
// TYPES
// ===========================================

interface SocialPost {
  id: string
  status: string
  scheduled_time: string | null
  posted_at: string | null
  platform: string
  post_type: string
  hook_text: string | null
  pipeline: string | null
  created_at: string
}

interface PipelineStats {
  total: number
  drafts: number
  scheduled: number
  posted: number
}

// ===========================================
// HELPER FUNCTIONS
// ===========================================

function formatRelativeTime(dateStr: string | null): string {
  if (!dateStr) return '—'
  
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
  const diffMinutes = Math.floor(diffMs / (1000 * 60))
  
  if (diffDays > 7) {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }
  if (diffDays >= 1) return `${diffDays}d ago`
  if (diffHours >= 1) return `${diffHours}h ago`
  if (diffMinutes >= 1) return `${diffMinutes}m ago`
  return 'Just now'
}

function getStatusColor(status: string): string {
  switch (status) {
    case 'draft': return 'bg-gray-500/20 text-gray-400'
    case 'pending': return 'bg-amber-500/20 text-amber-400'
    case 'notified': return 'bg-blue-500/20 text-blue-400'
    case 'posted': return 'bg-emerald-500/20 text-emerald-400'
    case 'failed': return 'bg-red-500/20 text-red-400'
    default: return 'bg-gray-500/20 text-gray-400'
  }
}

function getStatusLabel(status: string): string {
  switch (status) {
    case 'draft': return 'Draft'
    case 'pending': return 'Scheduled'
    case 'notified': return 'Ready'
    case 'posted': return 'Posted'
    case 'failed': return 'Failed'
    default: return status
  }
}

function getPostTypeEmoji(type: string): string {
  switch (type) {
    case 'birthday': return '🎂'
    case 'passing_anniversary': return '🕯️'
    case 'generic': return '💭'
    case 'trending': return '📈'
    case 'cultural': return '📅'
    default: return '📱'
  }
}

function getPipelineLabel(pipeline: string | null): string {
  switch (pipeline) {
    case 'evergreen': return 'Evergreen'
    case 'live_now': return 'Live Now'
    case 'live_past': return 'Live Past'
    default: return 'Evergreen'
  }
}

function getPipelineColor(pipeline: string | null): string {
  switch (pipeline) {
    case 'evergreen': return 'text-emerald-400'
    case 'live_now': return 'text-amber-400'
    case 'live_past': return 'text-blue-400'
    default: return 'text-emerald-400'
  }
}

// ===========================================
// MAIN COMPONENT
// ===========================================

export default function SocialMediaCommandCenter() {
  const [posts, setPosts] = useState<SocialPost[]>([])
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({
    evergreen: { total: 0, drafts: 0, scheduled: 0, posted: 0 } as PipelineStats,
    liveNow: { total: 0, drafts: 0, scheduled: 0, posted: 0 } as PipelineStats,
    livePast: { total: 0, drafts: 0, scheduled: 0, posted: 0 } as PipelineStats,
    totalPosts: 0,
    postedThisWeek: 0,
    scheduled: 0,
    avgEngagement: 0,
  })

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setLoading(true)
    try {
      // Fetch all posts
      const { data: postsData, error } = await supabase
        .from('social_posts')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50)

      if (error) {
        console.error('Error fetching posts:', error)
        setPosts([])
      } else {
        const allPosts = (postsData || []) as any[]
        setPosts(allPosts.slice(0, 10) as any) // Recent 10 for activity table
        
        // Calculate stats
        const sevenDaysAgo = new Date()
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

        // Evergreen posts (default pipeline)
        const evergreenPosts = allPosts.filter(p => !p.pipeline || p.pipeline === 'evergreen')
        const liveNowPosts = allPosts.filter(p => p.pipeline === 'live_now')
        const livePastPosts = allPosts.filter(p => p.pipeline === 'live_past')

        const calculatePipelineStats = (posts: SocialPost[]): PipelineStats => ({
          total: posts.length,
          drafts: posts.filter(p => p.status === 'draft').length,
          scheduled: posts.filter(p => p.status === 'pending').length,
          posted: posts.filter(p => p.status === 'posted').length,
        })

        // Calculate engagement from posted posts
        const postedPosts = allPosts.filter(p => p.status === 'posted')
        let totalEngagement = 0
        let postsWithEngagement = 0
        postedPosts.forEach((p: any) => {
          if (p.views && p.views > 0) {
            const engagement = ((p.likes || 0) + (p.comments || 0) + (p.shares || 0)) / p.views
            totalEngagement += engagement
            postsWithEngagement++
          }
        })

        setStats({
          evergreen: calculatePipelineStats(evergreenPosts),
          liveNow: calculatePipelineStats(liveNowPosts),
          livePast: calculatePipelineStats(livePastPosts),
          totalPosts: allPosts.length,
          postedThisWeek: allPosts.filter(p => 
            p.status === 'posted' && 
            p.posted_at && 
            new Date(p.posted_at) > sevenDaysAgo
          ).length,
          scheduled: allPosts.filter(p => p.status === 'pending').length,
          avgEngagement: postsWithEngagement > 0 
            ? (totalEngagement / postsWithEngagement) * 100 
            : 0,
        })
      }
    } catch (error) {
      console.error('Error loading data:', error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-6 lg:p-8 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-white">📱 Social Media Command Center</h1>
        <p className="text-gray-400 mt-1">Manage all TikTok & Instagram content pipelines</p>
      </div>

      {/* Pipeline Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Evergreen */}
        <Link 
          href="/admin/social/evergreen"
          className="bg-[#1a1f2e] rounded-2xl p-6 border border-gray-800/50 hover:border-emerald-500/50 transition-all group"
        >
          <div className="flex items-start justify-between mb-4">
            <div>
              <span className="text-4xl">🌲</span>
              <h2 className="text-xl font-bold text-white mt-2">Evergreen</h2>
              <p className="text-gray-400 text-sm mt-1">Birthday, anniversary, generic posts</p>
            </div>
            <div className="text-right">
              <p className="text-3xl font-bold text-emerald-400">{stats.evergreen.total}</p>
              <p className="text-xs text-gray-500">total posts</p>
            </div>
          </div>
          <div className="flex gap-4 text-sm">
            <span className="text-gray-400">
              <span className="text-white font-medium">{stats.evergreen.drafts}</span> drafts
            </span>
            <span className="text-gray-400">
              <span className="text-amber-400 font-medium">{stats.evergreen.scheduled}</span> scheduled
            </span>
            <span className="text-gray-400">
              <span className="text-emerald-400 font-medium">{stats.evergreen.posted}</span> posted
            </span>
          </div>
          <div className="mt-4 flex items-center text-emerald-400 text-sm font-medium group-hover:translate-x-1 transition-transform">
            Manage Evergreen →
          </div>
        </Link>

        {/* Live Now */}
        <Link 
          href="/admin/social/live-now"
          className="bg-[#1a1f2e] rounded-2xl p-6 border border-gray-800/50 hover:border-amber-500/50 transition-all group"
        >
          <div className="flex items-start justify-between mb-4">
            <div>
              <span className="text-4xl">⚡</span>
              <h2 className="text-xl font-bold text-white mt-2">Live Now</h2>
              <p className="text-gray-400 text-sm mt-1">Breaking news, trending moments</p>
            </div>
            <div className="text-right">
              <p className="text-3xl font-bold text-amber-400">{stats.liveNow.total}</p>
              <p className="text-xs text-gray-500">total posts</p>
            </div>
          </div>
          <div className="flex gap-4 text-sm">
            <span className="text-gray-400">
              <span className="text-white font-medium">{stats.liveNow.drafts}</span> drafts
            </span>
            <span className="text-gray-400">
              <span className="text-amber-400 font-medium">{stats.liveNow.scheduled}</span> scheduled
            </span>
            <span className="text-gray-400">
              <span className="text-emerald-400 font-medium">{stats.liveNow.posted}</span> posted
            </span>
          </div>
          <div className="mt-4 flex items-center text-amber-400 text-sm font-medium group-hover:translate-x-1 transition-transform">
            Manage Live Now →
          </div>
        </Link>

        {/* Live Past */}
        <Link 
          href="/admin/social/live-past"
          className="bg-[#1a1f2e] rounded-2xl p-6 border border-gray-800/50 hover:border-blue-500/50 transition-all group"
        >
          <div className="flex items-start justify-between mb-4">
            <div>
              <span className="text-4xl">📅</span>
              <h2 className="text-xl font-bold text-white mt-2">Live Past</h2>
              <p className="text-gray-400 text-sm mt-1">Cultural calendar, anniversaries</p>
            </div>
            <div className="text-right">
              <p className="text-3xl font-bold text-blue-400">{stats.livePast.total}</p>
              <p className="text-xs text-gray-500">total posts</p>
            </div>
          </div>
          <div className="flex gap-4 text-sm">
            <span className="text-gray-400">
              <span className="text-white font-medium">{stats.livePast.drafts}</span> drafts
            </span>
            <span className="text-gray-400">
              <span className="text-amber-400 font-medium">{stats.livePast.scheduled}</span> scheduled
            </span>
            <span className="text-gray-400">
              <span className="text-emerald-400 font-medium">{stats.livePast.posted}</span> posted
            </span>
          </div>
          <div className="mt-4 flex items-center text-blue-400 text-sm font-medium group-hover:translate-x-1 transition-transform">
            Manage Live Past →
          </div>
        </Link>
      </div>

      {/* Quick Stats Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-[#1a1f2e] rounded-xl p-4 border border-gray-800/50">
          <div className="flex items-center justify-between">
            <span className="text-gray-400 text-sm">Total Posts</span>
            <span className="text-2xl">📊</span>
          </div>
          <p className="text-3xl font-bold text-white mt-2">{stats.totalPosts}</p>
        </div>
        <div className="bg-[#1a1f2e] rounded-xl p-4 border border-gray-800/50">
          <div className="flex items-center justify-between">
            <span className="text-gray-400 text-sm">Posted This Week</span>
            <span className="text-2xl">✅</span>
          </div>
          <p className="text-3xl font-bold text-emerald-400 mt-2">{stats.postedThisWeek}</p>
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
            <span className="text-gray-400 text-sm">Avg Engagement</span>
            <span className="text-2xl">💖</span>
          </div>
          <p className="text-3xl font-bold text-pink-400 mt-2">
            {stats.avgEngagement > 0 ? `${stats.avgEngagement.toFixed(1)}%` : '—'}
          </p>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="bg-[#1a1f2e] rounded-2xl border border-gray-800/50 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-800/50">
          <h2 className="text-lg font-semibold text-white">Recent Activity</h2>
          <p className="text-sm text-gray-400">Latest posts across all pipelines</p>
        </div>
        
        {loading ? (
          <div className="p-12 text-center text-gray-500">Loading...</div>
        ) : posts.length === 0 ? (
          <div className="p-12 text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gray-800 flex items-center justify-center">
              <span className="text-3xl">📱</span>
            </div>
            <h3 className="text-lg font-semibold text-white mb-2">No posts yet</h3>
            <p className="text-gray-400 mb-4">Start creating content in one of the pipelines</p>
            <Link
              href="/admin/social/evergreen/create"
              className="inline-flex px-4 py-2 bg-gradient-to-r from-pink-500 to-purple-600 text-white font-semibold rounded-xl hover:from-pink-400 hover:to-purple-500 transition-all"
            >
              Create First Post
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-800/50">
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-4 py-3">Type</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-4 py-3">Pipeline</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-4 py-3">Hook</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-4 py-3">Status</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-4 py-3">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800/50">
                {posts.map(post => (
                  <tr 
                    key={post.id}
                    className="hover:bg-gray-800/30 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <span className="text-white">
                        {getPostTypeEmoji(post.post_type)} {post.post_type || 'generic'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-sm font-medium ${getPipelineColor(post.pipeline)}`}>
                        {getPipelineLabel(post.pipeline)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-gray-300 text-sm">
                        {post.hook_text ? (post.hook_text.length > 30 ? post.hook_text.slice(0, 30) + '...' : post.hook_text) : '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${getStatusColor(post.status)}`}>
                        {getStatusLabel(post.status)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-gray-400 text-sm">
                        {formatRelativeTime(post.created_at)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
