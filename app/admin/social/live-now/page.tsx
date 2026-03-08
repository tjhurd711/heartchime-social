'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import type { Trend } from '@/lib/aiUgcTypes'

// ===========================================
// TYPES
// ===========================================

type FilterTab = 'good' | 'maybe' | 'all'

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
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
  }
  if (diffDays >= 1) return `${diffDays}d ago`
  if (diffHours >= 1) return `${diffHours}h ago`
  if (diffMinutes >= 1) return `${diffMinutes}m ago`
  return 'Just now'
}

function getFitColor(fit: string | null): string {
  switch (fit?.toLowerCase()) {
    case 'good': return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
    case 'maybe': return 'bg-amber-500/20 text-amber-400 border-amber-500/30'
    case 'skip': return 'bg-gray-500/20 text-gray-400 border-gray-500/30'
    default: return 'bg-gray-500/20 text-gray-400 border-gray-500/30'
  }
}

function getFitLabel(fit: string | null): string {
  switch (fit?.toLowerCase()) {
    case 'good': return '✓ Good Fit'
    case 'maybe': return '? Maybe'
    case 'skip': return '✗ Skip'
    default: return 'Unknown'
  }
}

// ===========================================
// MAIN COMPONENT
// ===========================================

export default function LiveNowPage() {
  const router = useRouter()
  const [trends, setTrends] = useState<Trend[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<FilterTab>('all')
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [lastAnalysis, setLastAnalysis] = useState<string | null>(null)
  const [stats, setStats] = useState({
    good: 0,
    maybe: 0,
    skip: 0,
    total: 0,
  })
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)

  useEffect(() => {
    loadTrends()
  }, [])

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 4000)
  }

  const loadTrends = async () => {
    setLoading(true)
    try {
      let allTrends: Trend[] = []
      
      // First try the dashboard view (has fit_order for sorting)
      console.log('[Live Now] Fetching from trends_dashboard view...')
      const { data, error } = await supabase
        .from('trends_dashboard')
        .select('*')
        .order('trending_date', { ascending: false })
        .order('fit_order', { ascending: true })
        .limit(100)

      if (error) {
        console.log('[Live Now] Dashboard view error, falling back to trends table:', error.message)
        // Fallback to regular trends table
        const { data: fallbackData, error: fallbackError } = await supabase
          .from('trends')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(100)
        
        if (fallbackError) {
          console.error('[Live Now] Fallback also failed:', fallbackError)
          throw fallbackError
        }
        allTrends = (fallbackData || []) as any
        console.log('[Live Now] Fallback returned', allTrends.length, 'trends')
      } else {
        allTrends = (data || []) as any
        console.log('[Live Now] Dashboard view returned', allTrends.length, 'trends')
      }

      // Debug: log the fit values
      if (allTrends.length > 0) {
        console.log('[Live Now] Trend fit values:', allTrends.map(t => ({ keyword: t.keyword, fit: t.heartchime_fit })))
      }

      setTrends(allTrends)

      // Calculate stats from the actual loaded data
      setStats({
        good: allTrends.filter(t => t.heartchime_fit?.toLowerCase() === 'good').length,
        maybe: allTrends.filter(t => t.heartchime_fit?.toLowerCase() === 'maybe').length,
        skip: allTrends.filter(t => t.heartchime_fit?.toLowerCase() === 'skip').length,
        total: allTrends.length,
      })
      console.log('[Live Now] Stats:', {
        good: allTrends.filter(t => t.heartchime_fit?.toLowerCase() === 'good').length,
        maybe: allTrends.filter(t => t.heartchime_fit?.toLowerCase() === 'maybe').length,
        skip: allTrends.filter(t => t.heartchime_fit?.toLowerCase() === 'skip').length,
        total: allTrends.length,
      })

      // Get last analysis timestamp
      if (allTrends.length > 0) {
        const latestDate = allTrends[0]?.created_at || allTrends[0]?.trending_date
        setLastAnalysis(latestDate)
      }
    } catch (error) {
      console.error('[Live Now] Error loading trends:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleRunAnalysis = async () => {
    setIsAnalyzing(true)
    try {
      const response = await fetch('/api/admin/analyze-trends', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to run analysis')
      }

      const data = await response.json()
      showToast(`Analysis complete! Found ${data.trends?.length || 0} trends.`, 'success')
      
      // Reload trends after analysis
      await loadTrends()
    } catch (error) {
      console.error('Error running analysis:', error)
      showToast(error instanceof Error ? error.message : 'Failed to run analysis', 'error')
    } finally {
      setIsAnalyzing(false)
    }
  }

  const handleCreatePost = (trend: Trend) => {
    // Navigate to Live Now create page with trend data pre-filled via URL params
    const params = new URLSearchParams()
    params.set('keyword', trend.keyword)
    if (trend.suggested_angle) {
      params.set('angle', encodeURIComponent(trend.suggested_angle))
    }
    if (trend.why_trending) {
      params.set('why_trending', encodeURIComponent(trend.why_trending))
    }
    if (trend.id) {
      params.set('trend_id', trend.id)
    }
    
    router.push(`/admin/social/live-now/create?${params.toString()}`)
  }

  // Filter trends based on active tab
  const filteredTrends = trends.filter(trend => {
    if (activeTab === 'all') return true
    return trend.heartchime_fit?.toLowerCase() === activeTab
  })

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
      <div className="flex items-start justify-between">
        <div>
          <Link 
            href="/admin/social"
            className="text-gray-400 hover:text-white text-sm flex items-center gap-1 mb-2"
          >
            ← Back to Command Center
          </Link>
          <h1 className="text-3xl font-bold text-white">⚡ Live Now - Trend Radar</h1>
          <p className="text-gray-400 mt-1">
            Trending topics analyzed for HeartChime relevance
            {lastAnalysis && (
              <span className="text-gray-500"> • Last updated {formatRelativeTime(lastAnalysis)}</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/admin/social/live-now/create"
            className="px-5 py-2.5 rounded-xl font-semibold flex items-center gap-2 transition-all bg-emerald-600 text-white hover:bg-emerald-500 shadow-lg shadow-emerald-500/20"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Create Manual Post
          </Link>
          <button
            onClick={handleRunAnalysis}
            disabled={isAnalyzing}
            className={`px-5 py-2.5 rounded-xl font-semibold flex items-center gap-2 transition-all ${
              isAnalyzing
                ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
                : 'bg-gradient-to-r from-amber-500 to-orange-500 text-white hover:from-amber-400 hover:to-orange-400 shadow-lg shadow-amber-500/20'
            }`}
          >
            {isAnalyzing ? (
              <>
                <svg className="animate-spin w-5 h-5" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Analyzing...
              </>
            ) : (
              <>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Run Analysis Now
              </>
            )}
          </button>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-[#1a1f2e] rounded-xl p-4 border border-gray-800/50">
          <div className="flex items-center justify-between">
            <span className="text-gray-400 text-sm">Good Fit</span>
            <span className="text-2xl">✅</span>
          </div>
          <p className="text-3xl font-bold text-emerald-400 mt-2">{stats.good}</p>
        </div>
        <div className="bg-[#1a1f2e] rounded-xl p-4 border border-gray-800/50">
          <div className="flex items-center justify-between">
            <span className="text-gray-400 text-sm">Maybe</span>
            <span className="text-2xl">🤔</span>
          </div>
          <p className="text-3xl font-bold text-amber-400 mt-2">{stats.maybe}</p>
        </div>
        <div className="bg-[#1a1f2e] rounded-xl p-4 border border-gray-800/50">
          <div className="flex items-center justify-between">
            <span className="text-gray-400 text-sm">Skip</span>
            <span className="text-2xl">⏭️</span>
          </div>
          <p className="text-3xl font-bold text-gray-400 mt-2">{stats.skip}</p>
        </div>
        <div className="bg-[#1a1f2e] rounded-xl p-4 border border-gray-800/50">
          <div className="flex items-center justify-between">
            <span className="text-gray-400 text-sm">Total Trends</span>
            <span className="text-2xl">📊</span>
          </div>
          <p className="text-3xl font-bold text-white mt-2">{stats.total}</p>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2 border-b border-gray-800/50 pb-2">
        {[
          { key: 'good', label: 'Good', count: stats.good },
          { key: 'maybe', label: 'Maybe', count: stats.maybe },
          { key: 'all', label: 'All', count: stats.total },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key as FilterTab)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
              activeTab === tab.key
                ? 'bg-amber-500/20 text-amber-400'
                : 'text-gray-400 hover:text-white hover:bg-gray-800/50'
            }`}
          >
            {tab.label}
            <span className={`px-1.5 py-0.5 rounded text-xs ${
              activeTab === tab.key ? 'bg-amber-500/30' : 'bg-gray-700'
            }`}>
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      {/* Trends Grid */}
      {loading ? (
        <div className="bg-[#1a1f2e] rounded-2xl border border-gray-800/50 p-12 text-center text-gray-500">
          <svg className="animate-spin w-8 h-8 mx-auto mb-4" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Loading trends...
        </div>
      ) : filteredTrends.length === 0 ? (
        <div className="bg-[#1a1f2e] rounded-2xl border border-gray-800/50 p-12 text-center">
          <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-gradient-to-br from-amber-500/20 to-orange-500/20 flex items-center justify-center">
            <span className="text-4xl">⚡</span>
          </div>
          <h3 className="text-xl font-semibold text-white mb-2">
            {activeTab === 'all' ? 'No trends analyzed yet' : `No ${activeTab} trends`}
          </h3>
          <p className="text-gray-400 mb-6 max-w-md mx-auto">
            {activeTab === 'all' 
              ? 'Run an analysis to discover trending topics that could work for HeartChime content.'
              : `No trends have been marked as "${activeTab}" yet. Try checking the "All" tab or run a new analysis.`
            }
          </p>
          {activeTab === 'all' && (
            <button
              onClick={handleRunAnalysis}
              disabled={isAnalyzing}
              className="px-6 py-3 bg-gradient-to-r from-amber-500 to-orange-500 text-white font-semibold rounded-xl hover:from-amber-400 hover:to-orange-400 transition-all"
            >
              Run First Analysis
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filteredTrends.map(trend => (
            <div
              key={trend.id}
              className="bg-[#1a1f2e] rounded-2xl border border-gray-800/50 p-6 hover:border-amber-500/30 transition-all"
            >
              {/* Header */}
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="text-xl font-bold text-white truncate">
                      {trend.keyword}
                    </h3>
                    <span className={`px-2.5 py-1 rounded-full text-xs font-medium border ${getFitColor(trend.heartchime_fit)}`}>
                      {getFitLabel(trend.heartchime_fit)}
                    </span>
                  </div>
                  {trend.traffic_estimate && (
                    <span className="text-xs text-gray-500 bg-gray-800 px-2 py-1 rounded">
                      📈 {trend.traffic_estimate}
                    </span>
                  )}
                </div>
              </div>

              {/* Why Trending */}
              {trend.why_trending && (
                <div className="mb-4">
                  <p className="text-sm text-gray-400 mb-1">Why it's trending:</p>
                  <p className="text-gray-300 text-sm leading-relaxed">
                    {trend.why_trending}
                  </p>
                </div>
              )}

              {/* Fit Reasoning */}
              {trend.fit_reasoning && (
                <div className="mb-4 bg-[#0f1419] rounded-lg p-3">
                  <p className="text-xs text-gray-500 mb-1">HeartChime Analysis:</p>
                  <p className="text-gray-400 text-sm">
                    {trend.fit_reasoning}
                  </p>
                </div>
              )}

              {/* Suggested Angle */}
              {trend.suggested_angle && (
                <div className="mb-4 bg-amber-500/10 border border-amber-500/20 rounded-lg p-3">
                  <p className="text-xs text-amber-400/80 mb-1 flex items-center gap-1">
                    <span>💡</span> Suggested Angle:
                  </p>
                  <p className="text-amber-200 text-sm font-medium">
                    {trend.suggested_angle}
                  </p>
                </div>
              )}

              {/* Related Topics */}
              {trend.related_topics && trend.related_topics.length > 0 && (
                <div className="mb-4">
                  <p className="text-xs text-gray-500 mb-2">Related topics:</p>
                  <div className="flex flex-wrap gap-1.5">
                    {trend.related_topics.slice(0, 5).map((topic, idx) => (
                      <span key={idx} className="px-2 py-0.5 bg-gray-800 rounded text-xs text-gray-400">
                        {topic}
                      </span>
                    ))}
                    {trend.related_topics.length > 5 && (
                      <span className="px-2 py-0.5 text-xs text-gray-500">
                        +{trend.related_topics.length - 5} more
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Footer */}
              <div className="flex items-center justify-between pt-4 border-t border-gray-800/50">
                <div className="flex items-center gap-3 text-xs text-gray-500">
                  <span>{formatRelativeTime(trend.created_at ?? null)}</span>
                  {trend.google_trends_url && (
                    <a
                      href={trend.google_trends_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-gray-400 hover:text-white flex items-center gap-1"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                      View on Google Trends
                    </a>
                  )}
                </div>
                
                {(trend.heartchime_fit?.toLowerCase() === 'good' || trend.heartchime_fit?.toLowerCase() === 'maybe') && (
                  <button
                    onClick={() => handleCreatePost(trend)}
                    className="px-4 py-2 bg-gradient-to-r from-amber-500 to-orange-500 text-white text-sm font-semibold rounded-lg hover:from-amber-400 hover:to-orange-400 transition-all flex items-center gap-1.5"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    Create Post
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
