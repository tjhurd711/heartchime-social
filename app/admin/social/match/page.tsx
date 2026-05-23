'use client'

import { FormEvent, useEffect, useState } from 'react'
import Image from 'next/image'

type Platform = 'tiktok' | 'instagram'

interface MatchPost {
  id: string
  created_at: string | null
  trend_name: string
  slide_1_thumbnail: string | null
  overlay_texts: { order?: number; overlay_text: string }[]
  published_url: string | null
  platform: string | null
  platform_post_id: string | null
  posted_at: string | null
}

export default function SocialMatchPage() {
  const [postId, setPostId] = useState('')
  const [platform, setPlatform] = useState<Platform>('tiktok')
  const [publishedUrl, setPublishedUrl] = useState('')
  const [foundPost, setFoundPost] = useState<MatchPost | null>(null)
  const [recentPosts, setRecentPosts] = useState<MatchPost[]>([])
  const [isFinding, setIsFinding] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [notFound, setNotFound] = useState(false)
  const [error, setError] = useState('')
  const [warnings, setWarnings] = useState<string[]>([])
  const [successPost, setSuccessPost] = useState<MatchPost | null>(null)
  const [existingMatchUrl, setExistingMatchUrl] = useState<string | null>(null)

  const loadRecent = async () => {
    const response = await fetch('/api/admin/social/match?recent=true')
    const data = await response.json()
    if (response.ok) {
      setRecentPosts(data.recent || [])
    }
  }

  useEffect(() => {
    loadRecent().catch((loadError) => {
      console.error('Failed to load recent matches:', loadError)
    })
  }, [])

  const handleFind = async (event: FormEvent) => {
    event.preventDefault()
    setIsFinding(true)
    setError('')
    setWarnings([])
    setSuccessPost(null)
    setNotFound(false)
    setFoundPost(null)
    setExistingMatchUrl(null)

    try {
      const response = await fetch(`/api/admin/social/match?postId=${encodeURIComponent(postId.trim())}`)
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to find post')
      }

      if (!data.post) {
        setNotFound(true)
        return
      }

      setFoundPost(data.post)
      setExistingMatchUrl(data.post.published_url || null)
      setPublishedUrl(data.post.published_url || '')
      if (data.post.platform === 'instagram' || data.post.platform === 'tiktok') {
        setPlatform(data.post.platform)
      }
    } catch (findError) {
      setError(findError instanceof Error ? findError.message : 'Failed to find post')
    } finally {
      setIsFinding(false)
    }
  }

  const saveMatch = async (overwrite = false) => {
    setIsSaving(true)
    setError('')
    setWarnings([])
    setSuccessPost(null)

    try {
      const response = await fetch('/api/admin/social/match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          postId: postId.trim(),
          platform,
          publishedUrl,
          overwrite,
        }),
      })

      const data = await response.json()

      if (response.status === 409 && data.error === 'already_matched') {
        const shouldOverwrite = window.confirm(data.message || `This post is already matched to ${data.existingUrl} — overwrite?`)
        if (shouldOverwrite) {
          await saveMatch(true)
        }
        return
      }

      if (!response.ok) {
        throw new Error(data.error || 'Failed to save match')
      }

      setFoundPost(data.post)
      setSuccessPost(data.post)
      setExistingMatchUrl(null)
      setWarnings(data.warnings || [])
      await loadRecent()
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to save match')
    } finally {
      setIsSaving(false)
    }
  }

  const handleSave = async (event: FormEvent) => {
    event.preventDefault()

    if (existingMatchUrl && existingMatchUrl !== publishedUrl) {
      const shouldOverwrite = window.confirm(`This post is already matched to ${existingMatchUrl} - overwrite?`)
      if (!shouldOverwrite) return
      await saveMatch(true)
      return
    }

    await saveMatch(false)
  }

  return (
    <div className="min-h-screen p-4 md:p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <div>
          <p className="text-sm uppercase tracking-[0.25em] text-amber-400 mb-2">Social publishing</p>
          <h1 className="text-3xl font-bold text-white">Match Published Post</h1>
          <p className="text-gray-400 mt-2 max-w-2xl">
            Paste the internal post ID from your phone note, confirm the generated creative, then attach the published TikTok or Instagram URL.
          </p>
        </div>

        {error && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            {error}
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
          <div className="space-y-6">
            <section className="bg-[#1a1f2e] rounded-2xl border border-gray-800/50 p-6">
              <h2 className="text-lg font-semibold text-white mb-4">Step A - Find Post</h2>
              <form onSubmit={handleFind} className="flex flex-col sm:flex-row gap-3">
                <input
                  type="text"
                  value={postId}
                  onChange={(event) => setPostId(event.target.value)}
                  placeholder="Post ID"
                  className="flex-1 px-4 py-3 bg-[#0f1419] border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                />
                <button
                  type="submit"
                  disabled={isFinding || !postId.trim()}
                  className="px-6 py-3 bg-amber-500 hover:bg-amber-400 disabled:bg-amber-900 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-colors"
                >
                  {isFinding ? 'Finding...' : 'Find'}
                </button>
              </form>
              {notFound && (
                <p className="text-sm text-gray-400 mt-4">No post with that ID.</p>
              )}
            </section>

            {foundPost && (
              <section className="bg-[#1a1f2e] rounded-2xl border border-gray-800/50 p-6">
                <h2 className="text-lg font-semibold text-white mb-4">Step B - Confirm Creative</h2>
                <div className="grid gap-5 md:grid-cols-[180px_1fr]">
                  <div className="aspect-[9/16] rounded-xl overflow-hidden bg-[#0f1419] border border-gray-800">
                    {foundPost.slide_1_thumbnail ? (
                      <Image
                        src={foundPost.slide_1_thumbnail}
                        alt="Slide 1 thumbnail"
                        width={180}
                        height={320}
                        unoptimized
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-sm text-gray-500">
                        No thumbnail
                      </div>
                    )}
                  </div>

                  <div className="space-y-4">
                    <div>
                      <p className="text-xs uppercase tracking-[0.2em] text-gray-500">Trend / Template</p>
                      <p className="text-xl font-semibold text-white mt-1">{foundPost.trend_name}</p>
                    </div>

                    <div>
                      <p className="text-xs uppercase tracking-[0.2em] text-gray-500">Generated</p>
                      <p className="text-gray-300 mt-1">
                        {foundPost.created_at ? new Date(foundPost.created_at).toLocaleString() : 'Unknown'}
                      </p>
                    </div>

                    <div>
                      <p className="text-xs uppercase tracking-[0.2em] text-gray-500 mb-2">Per-slide overlay text</p>
                      {foundPost.overlay_texts.length > 0 ? (
                        <div className="space-y-2">
                          {foundPost.overlay_texts.map((slide, index) => (
                            <div key={`${slide.order || index}-${slide.overlay_text}`} className="rounded-lg bg-[#0f1419] border border-gray-800 p-3">
                              <p className="text-xs text-amber-400 mb-1">Slide {slide.order || index + 1}</p>
                              <p className="text-sm text-gray-300">{slide.overlay_text}</p>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-gray-500">No overlay text saved for this post.</p>
                      )}
                    </div>
                  </div>
                </div>
              </section>
            )}

            {foundPost && (
              <section className="bg-[#1a1f2e] rounded-2xl border border-gray-800/50 p-6">
                <h2 className="text-lg font-semibold text-white mb-4">Step C - Attach URL</h2>

                {existingMatchUrl && !successPost && (
                  <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
                    This post is already matched to{' '}
                    <a href={existingMatchUrl} target="_blank" rel="noopener noreferrer" className="underline">
                      {existingMatchUrl}
                    </a>{' '}
                    - overwrite?
                  </div>
                )}

                <form onSubmit={handleSave} className="space-y-4">
                  <div>
                    <label className="block text-sm text-gray-400 mb-2">Platform</label>
                    <select
                      value={platform}
                      onChange={(event) => setPlatform(event.target.value as Platform)}
                      className="w-full px-4 py-3 bg-[#0f1419] border border-gray-700 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                    >
                      <option value="tiktok">TikTok</option>
                      <option value="instagram">Instagram</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm text-gray-400 mb-2">Published URL</label>
                    <input
                      type="text"
                      value={publishedUrl}
                      onChange={(event) => setPublishedUrl(event.target.value)}
                      placeholder="Full URL"
                      className="w-full px-4 py-3 bg-[#0f1419] border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isSaving || !publishedUrl.trim()}
                    className="w-full sm:w-auto px-6 py-3 bg-green-600 hover:bg-green-500 disabled:bg-green-900 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-colors"
                  >
                    {isSaving ? 'Saving...' : 'Save Match'}
                  </button>
                </form>

                {successPost && (
                  <div className="mt-5 rounded-xl border border-green-500/30 bg-green-500/10 px-4 py-3 text-sm text-green-200">
                    <p className="font-semibold">✓ Match saved</p>
                    <p className="mt-1">Platform ID: {successPost.platform_post_id || 'Not extracted'}</p>
                    <p>URL: {successPost.published_url}</p>
                  </div>
                )}

                {warnings.length > 0 && (
                  <div className="mt-4 rounded-xl border border-yellow-500/30 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-200">
                    {warnings.map((warning) => (
                      <p key={warning}>{warning}</p>
                    ))}
                  </div>
                )}
              </section>
            )}
          </div>

          <section className="bg-[#1a1f2e] rounded-2xl border border-gray-800/50 p-6 h-fit">
            <h2 className="text-lg font-semibold text-white mb-4">Recent Matches</h2>
            {recentPosts.length > 0 ? (
              <div className="space-y-3">
                {recentPosts.map((post) => (
                  <div key={post.id} className="rounded-xl bg-[#0f1419] border border-gray-800 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-white">{post.trend_name}</p>
                        <p className="text-xs text-gray-500 mt-1">
                          {post.platform || 'unknown'} - {post.posted_at ? new Date(post.posted_at).toLocaleString() : 'No date'}
                        </p>
                      </div>
                    </div>
                    {post.published_url && (
                      <a
                        href={post.published_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block text-xs text-amber-400 hover:text-amber-300 mt-2 break-all"
                      >
                        {post.published_url}
                      </a>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-500">No matched posts yet.</p>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}
