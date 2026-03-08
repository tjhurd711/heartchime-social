'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import type { 
  AiUgcPersona, 
  AiUgcLovedOne, 
  AiUgcAsset, 
  AiUgcPost,
  ERA_OPTIONS,
  ASSET_TYPE_LABELS,
  POST_STATUS_LABELS 
} from '@/lib/aiUgcTypes'

// ═══════════════════════════════════════════════════════════════════════════
// PERSONA DETAIL PAGE
// ═══════════════════════════════════════════════════════════════════════════

type Tab = 'profile' | 'assets' | 'posts'

export default function PersonaDetailPage() {
  const params = useParams()
  const personaId = params.personaId as string
  
  const [activeTab, setActiveTab] = useState<Tab>('profile')
  const [persona, setPersona] = useState<AiUgcPersona | null>(null)
  const [lovedOnes, setLovedOnes] = useState<AiUgcLovedOne[]>([])
  const [assets, setAssets] = useState<AiUgcAsset[]>([])
  const [posts, setPosts] = useState<AiUgcPost[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    try {
      setLoading(true)
      
      // Fetch persona with loved ones
      const personaRes = await fetch('/api/admin/social/ai-ugc/personas')
      const personaData = await personaRes.json()
      
      const foundPersona = personaData.personas?.find((p: any) => p.id === personaId)
      if (!foundPersona) {
        throw new Error('Persona not found')
      }
      
      setPersona(foundPersona)
      setLovedOnes(foundPersona.loved_ones || [])

      // Fetch assets
      const assetsRes = await fetch(`/api/admin/social/ai-ugc/assets?persona_id=${personaId}`)
      const assetsData = await assetsRes.json()
      setAssets(assetsData.assets || [])

      // Fetch posts
      const postsRes = await fetch(`/api/admin/social/ai-ugc/posts?persona_id=${personaId}`)
      const postsData = await postsRes.json()
      setPosts(postsData.posts || [])

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }, [personaId])

  useEffect(() => {
    fetchData()
  }, [fetchData])

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

  if (error || !persona) {
    return (
      <div className="min-h-screen bg-[#0d1117] p-8">
        <div className="max-w-6xl mx-auto">
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-6 text-red-400">
            <h3 className="font-semibold mb-2">Error Loading Persona</h3>
            <p>{error || 'Persona not found'}</p>
            <Link href="/admin/social/ai-ugc" className="text-red-300 hover:underline mt-4 inline-block">
              ← Back to Personas
            </Link>
          </div>
        </div>
      </div>
    )
  }

  const lovedOne = lovedOnes[0]

  return (
    <div className="min-h-screen bg-[#0d1117] p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <Link 
            href="/admin/social/ai-ugc"
            className="text-gray-500 hover:text-gray-300 transition-colors"
          >
            ← AI UGC
          </Link>
        </div>

        {/* Persona Header Card */}
        <div className="bg-[#161b22] rounded-2xl border border-gray-800 overflow-hidden mb-6">
          <div className="flex items-start gap-6 p-6">
            {/* Persona Photo */}
            <div className="w-32 h-32 rounded-xl overflow-hidden flex-shrink-0 bg-gradient-to-br from-violet-900/30 to-fuchsia-900/30">
              <img
                src={persona.master_photo_url}
                alt={persona.name}
                className="w-full h-full object-cover"
              />
            </div>

            {/* Info */}
            <div className="flex-1">
              <div className="flex items-start justify-between">
                <div>
                  <h1 className="text-2xl font-bold text-white">{persona.name}</h1>
                  <p className="text-gray-400">
                    {persona.age} years old • Born {persona.birth_year}
                    {persona.location && ` • ${persona.location}`}
                  </p>
                  {persona.job && (
                    <p className="text-gray-300 mt-1">💼 {persona.job}</p>
                  )}
                  {persona.vibe && (
                    <p className="text-gray-400 mt-1 text-sm">✨ {persona.vibe}</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {persona.instagram_handle && (
                    <span className="text-xs text-pink-400 bg-pink-500/10 px-2 py-1 rounded-lg">
                      @{persona.instagram_handle}
                    </span>
                  )}
                  {persona.tiktok_handle && (
                    <span className="text-xs text-cyan-400 bg-cyan-500/10 px-2 py-1 rounded-lg">
                      @{persona.tiktok_handle}
                    </span>
                  )}
                </div>
              </div>

              {/* Loved One Mini Card */}
              {lovedOne && (
                <div className="mt-4 flex items-center gap-4 bg-[#0d1117] rounded-xl p-3">
                  <div className="w-12 h-12 rounded-lg overflow-hidden">
                    <img
                      src={lovedOne.master_photo_url}
                      alt={lovedOne.name}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-rose-400">❤️</span>
                      <span className="text-white font-medium">{lovedOne.name}</span>
                      <span className="text-gray-500 text-sm">({lovedOne.relationship})</span>
                    </div>
                    <p className="text-gray-400 text-xs">
                      {lovedOne.birth_year} - {lovedOne.death_year}
                    </p>
                  </div>
                  {lovedOne.keywords && lovedOne.keywords.length > 0 && (
                    <div className="flex flex-wrap gap-1 ml-auto">
                      {lovedOne.keywords.slice(0, 3).map((kw, i) => (
                        <span key={i} className="text-xs bg-gray-800 text-gray-400 px-2 py-0.5 rounded">
                          {kw}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Action Bar */}
          <div className="flex items-center gap-3 px-6 py-4 border-t border-gray-800 bg-[#0d1117]/50">
            <Link
              href={`/admin/social/ai-ugc/generate?persona=${personaId}`}
              className="px-4 py-2 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-lg font-medium hover:bg-emerald-500/30 transition-all flex items-center gap-2"
            >
              <span>📷</span>
              Generate Photo
            </Link>
            <Link
              href={`/admin/social/ai-ugc/create-post?persona=${personaId}`}
              className="px-4 py-2 bg-violet-500/20 text-violet-400 border border-violet-500/30 rounded-lg font-medium hover:bg-violet-500/30 transition-all flex items-center gap-2"
            >
              <span>✨</span>
              Create Post
            </Link>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 mb-6 bg-[#161b22] rounded-xl p-1 w-fit border border-gray-800">
          {(['profile', 'assets', 'posts'] as Tab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 rounded-lg font-medium transition-all ${
                activeTab === tab
                  ? 'bg-violet-500 text-white'
                  : 'text-gray-400 hover:text-white hover:bg-gray-800'
              }`}
            >
              {tab === 'profile' && '👤 Profile'}
              {tab === 'assets' && `📷 Assets (${assets.length})`}
              {tab === 'posts' && `📱 Posts (${posts.length})`}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        {activeTab === 'profile' && (
          <ProfileTab persona={persona} lovedOne={lovedOne} onRefresh={fetchData} />
        )}
        {activeTab === 'assets' && (
          <AssetsTab assets={assets} onRefresh={fetchData} />
        )}
        {activeTab === 'posts' && (
          <PostsTab posts={posts} onRefresh={fetchData} />
        )}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// PROFILE TAB
// ═══════════════════════════════════════════════════════════════════════════

function ProfileTab({ 
  persona, 
  lovedOne, 
  onRefresh 
}: { 
  persona: AiUgcPersona
  lovedOne?: AiUgcLovedOne
  onRefresh: () => void 
}) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Persona Details */}
      <div className="bg-[#161b22] rounded-xl border border-gray-800 p-6">
        <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <span>👤</span> Persona Details
        </h3>
        
        <div className="space-y-4">
          <Field label="Name" value={persona.name} />
          <Field label="Age" value={`${persona.age} years old`} />
          <Field label="Birth Year" value={String(persona.birth_year)} />
          <Field label="Gender" value={persona.gender || 'Not set'} />
          <Field label="Ethnicity" value={persona.ethnicity || 'Not set'} />
          <Field label="Location" value={persona.location || 'Not set'} />
          <Field label="Job" value={persona.job || 'Not set'} />
          <Field label="Vibe" value={persona.vibe || 'Not set'} />
          <Field label="Instagram" value={persona.instagram_handle ? `@${persona.instagram_handle}` : 'Not set'} />
          <Field label="TikTok" value={persona.tiktok_handle ? `@${persona.tiktok_handle}` : 'Not set'} />
          <Field label="Voice ID" value={persona.elevenlabs_voice_id || 'Not set'} />
        </div>

        <div className="mt-6 pt-4 border-t border-gray-800">
          <label className="text-sm text-gray-400 mb-2 block">Master Photo URL</label>
          <input
            type="text"
            value={persona.master_photo_url}
            readOnly
            className="w-full bg-[#0d1117] border border-gray-700 rounded-lg px-3 py-2 text-gray-300 text-sm"
          />
        </div>
      </div>

      {/* Loved One Details */}
      <div className="bg-[#161b22] rounded-xl border border-gray-800 p-6">
        <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <span>❤️</span> Loved One Details
        </h3>
        
        {lovedOne ? (
          <div className="space-y-4">
            <Field label="Name" value={lovedOne.name} />
            <Field label="Relationship" value={lovedOne.relationship} />
            <Field label="Gender" value={lovedOne.gender || 'Not set'} />
            <Field label="Birth Year" value={String(lovedOne.birth_year)} />
            <Field label="Death Year" value={String(lovedOne.death_year)} />
            <Field label="Age at Death" value={`${lovedOne.age_at_death} years old`} />
            
            {lovedOne.keywords && lovedOne.keywords.length > 0 && (
              <div>
                <label className="text-sm text-gray-400 mb-2 block">Keywords</label>
                <div className="flex flex-wrap gap-2">
                  {lovedOne.keywords.map((kw, i) => (
                    <span key={i} className="text-sm bg-violet-500/20 text-violet-300 px-3 py-1 rounded-lg">
                      {kw}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {lovedOne.personality_traits && lovedOne.personality_traits.length > 0 && (
              <div>
                <label className="text-sm text-gray-400 mb-2 block">Personality Traits</label>
                <div className="flex flex-wrap gap-2">
                  {lovedOne.personality_traits.map((trait, i) => (
                    <span key={i} className="text-sm bg-rose-500/20 text-rose-300 px-3 py-1 rounded-lg">
                      {trait}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="pt-4 border-t border-gray-800">
              <label className="text-sm text-gray-400 mb-2 block">Master Photo URL</label>
              <input
                type="text"
                value={lovedOne.master_photo_url}
                readOnly
                className="w-full bg-[#0d1117] border border-gray-700 rounded-lg px-3 py-2 text-gray-300 text-sm"
              />
            </div>
          </div>
        ) : (
          <div className="text-center py-8">
            <div className="text-4xl mb-3">💔</div>
            <p className="text-gray-400">No loved one associated with this persona</p>
            <button className="mt-4 px-4 py-2 bg-violet-500/20 text-violet-400 rounded-lg hover:bg-violet-500/30 transition-colors">
              + Add Loved One
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-gray-400 text-sm">{label}</span>
      <span className="text-white">{value}</span>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// ASSETS TAB
// ═══════════════════════════════════════════════════════════════════════════

function AssetsTab({ 
  assets, 
  onRefresh 
}: { 
  assets: AiUgcAsset[]
  onRefresh: () => void 
}) {
  const [filter, setFilter] = useState<string>('all')
  const [eraFilter, setEraFilter] = useState<string>('all')

  const filteredAssets = assets.filter(asset => {
    if (filter !== 'all' && asset.asset_type !== filter) return false
    if (eraFilter !== 'all' && asset.era !== eraFilter) return false
    return true
  })

  const uniqueEras = Array.from(new Set(assets.map(a => a.era).filter(Boolean))) as string[]

  return (
    <div>
      {/* Filters */}
      <div className="flex items-center gap-4 mb-6">
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="bg-[#161b22] border border-gray-700 rounded-lg px-3 py-2 text-white"
        >
          <option value="all">All Types</option>
          <option value="persona_solo">Persona Only</option>
          <option value="loved_one_solo">Loved One Only</option>
          <option value="together">Together</option>
          <option value="generic">Generic</option>
        </select>

        <select
          value={eraFilter}
          onChange={(e) => setEraFilter(e.target.value)}
          className="bg-[#161b22] border border-gray-700 rounded-lg px-3 py-2 text-white"
        >
          <option value="all">All Eras</option>
          {uniqueEras.map(era => (
            <option key={era} value={era}>{era}</option>
          ))}
        </select>

        <span className="text-gray-400 text-sm ml-auto">
          {filteredAssets.length} of {assets.length} assets
        </span>
      </div>

      {/* Asset Grid */}
      {filteredAssets.length === 0 ? (
        <div className="bg-[#161b22] rounded-xl border border-gray-800 p-12 text-center">
          <div className="text-5xl mb-4">📷</div>
          <h3 className="text-lg font-semibold text-white mb-2">No Assets Yet</h3>
          <p className="text-gray-400 mb-4">Generate your first photo asset for this persona.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {filteredAssets.map((asset) => (
            <div
              key={asset.id}
              className="bg-[#161b22] rounded-xl border border-gray-800 overflow-hidden group hover:border-gray-600 transition-all"
            >
              <div className="aspect-[4/3] relative">
                <img
                  src={asset.s3_url}
                  alt={asset.context || 'Asset'}
                  className="w-full h-full object-cover"
                />
                {/* Overlay on hover */}
                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                  <button className="p-2 bg-white/20 rounded-lg hover:bg-white/30 transition-colors">
                    <span>👁️</span>
                  </button>
                  <button className="p-2 bg-white/20 rounded-lg hover:bg-white/30 transition-colors">
                    <span>⬇️</span>
                  </button>
                </div>
              </div>
              <div className="p-3">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-xs px-2 py-0.5 rounded ${
                    asset.asset_type === 'together' ? 'bg-rose-500/20 text-rose-400' :
                    asset.asset_type === 'persona_solo' ? 'bg-violet-500/20 text-violet-400' :
                    asset.asset_type === 'loved_one_solo' ? 'bg-amber-500/20 text-amber-400' :
                    'bg-gray-500/20 text-gray-400'
                  }`}>
                    {asset.asset_type.replace('_', ' ')}
                  </span>
                  {asset.era && (
                    <span className="text-xs text-gray-500">{asset.era}</span>
                  )}
                </div>
                {asset.context && (
                  <p className="text-gray-400 text-xs line-clamp-2">{asset.context}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// POSTS TAB
// ═══════════════════════════════════════════════════════════════════════════

function PostsTab({ 
  posts, 
  onRefresh 
}: { 
  posts: AiUgcPost[]
  onRefresh: () => void 
}) {
  const [statusFilter, setStatusFilter] = useState<string>('all')

  const filteredPosts = posts.filter(post => {
    if (statusFilter !== 'all' && post.status !== statusFilter) return false
    return true
  })

  const statusColors: Record<string, string> = {
    draft: 'bg-gray-500/20 text-gray-400',
    ready: 'bg-emerald-500/20 text-emerald-400',
    posted: 'bg-violet-500/20 text-violet-400',
  }

  return (
    <div>
      {/* Filter */}
      <div className="flex items-center gap-4 mb-6">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="bg-[#161b22] border border-gray-700 rounded-lg px-3 py-2 text-white"
        >
          <option value="all">All Status</option>
          <option value="draft">Draft</option>
          <option value="ready">Ready</option>
          <option value="posted">Posted</option>
        </select>
        <span className="text-gray-400 text-sm ml-auto">
          {filteredPosts.length} of {posts.length} posts
        </span>
      </div>

      {/* Posts List */}
      {filteredPosts.length === 0 ? (
        <div className="bg-[#161b22] rounded-xl border border-gray-800 p-12 text-center">
          <div className="text-5xl mb-4">📱</div>
          <h3 className="text-lg font-semibold text-white mb-2">No Posts Yet</h3>
          <p className="text-gray-400 mb-4">Create your first post for this persona.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredPosts.map((post) => (
            <div
              key={post.id}
              className="bg-[#161b22] rounded-xl border border-gray-800 p-4 hover:border-gray-600 transition-all"
            >
              <div className="flex items-start gap-4">
                {/* First slide preview */}
                {post.slides && post.slides.length > 0 && post.slides[0].generatedUrl && (
                  <div className="w-24 h-24 rounded-lg overflow-hidden flex-shrink-0">
                    <img
                      src={post.slides[0].generatedUrl}
                      alt="Post preview"
                      className="w-full h-full object-cover"
                    />
                  </div>
                )}
                
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`text-xs px-2 py-0.5 rounded ${statusColors[post.status] || statusColors.draft}`}>
                      {post.status}
                    </span>
                    <span className="text-xs text-gray-500">{post.platform || 'No platform'}</span>
                    <span className="text-xs text-gray-500">{post.post_type || 'No type'}</span>
                    {post.slides && (
                      <span className="text-xs text-gray-500">{post.slides.length} slides</span>
                    )}
                  </div>
                  
                  {post.caption && (
                    <p className="text-gray-300 text-sm line-clamp-2 mb-2">{post.caption}</p>
                  )}
                  
                  <div className="text-xs text-gray-500">
                    Created {new Date(post.created_at).toLocaleDateString()}
                    {post.scheduled_for && ` • Scheduled for ${new Date(post.scheduled_for).toLocaleDateString()}`}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button className="px-3 py-1.5 bg-gray-800 text-white text-sm rounded-lg hover:bg-gray-700 transition-colors">
                    Edit
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

