'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@supabase/supabase-js'
import Link from 'next/link'
import { useRouter, useParams } from 'next/navigation'
import ImageSearchModal from '@/app/admin/components/ImageSearchModal'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// ===========================================
// TYPES
// ===========================================

interface Recipient {
  id: string
  name: string
  age_range: string
  image_clean_url: string
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

interface SocialPost {
  id: string
  status: 'draft' | 'pending' | 'notified' | 'posted' | 'failed'
  platform: string
  post_type: string
  pipeline: string
  slide_1_url: string | null
  slide_2_url: string | null
  slide_3_url: string | null
  hook_text: string
  text_style: string
  deceased_nickname: string
  deceased_relationship: string
  caption: string
  card_message: string | null
  generated_photo_url: string | null
  time_period: string | null
  scheduled_time: string | null
  posted_at: string | null
  notified_at: string | null
  recipient_id: string | null
  cultural_moment_id: string | null
  views: number | null
  likes: number | null
  comments: number | null
  shares: number | null
  saves: number | null
  created_at: string
  recipient?: Recipient
}

// ===========================================
// CONSTANTS
// ===========================================

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

const STATUS_STYLES: Record<string, string> = {
  draft: 'bg-gray-500/20 text-gray-400',
  pending: 'bg-yellow-500/20 text-yellow-400',
  notified: 'bg-blue-500/20 text-blue-400',
  posted: 'bg-green-500/20 text-green-400',
  failed: 'bg-red-500/20 text-red-400',
}

// ===========================================
// HELPER FUNCTIONS
// ===========================================

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function formatFullDate(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00')
  return date.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

function getDecadeFromDate(dateStr: string): string {
  const year = new Date(dateStr).getFullYear()
  return `${Math.floor(year / 10) * 10}s`
}

// ===========================================
// MAIN COMPONENT
// ===========================================

export default function LivePastPostDetailPage() {
  const router = useRouter()
  const params = useParams()
  const postId = params.id as string

  // Data state
  const [post, setPost] = useState<SocialPost | null>(null)
  const [culturalMoment, setCulturalMoment] = useState<CulturalMoment | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  // Editing state
  const [caption, setCaption] = useState('')
  const [originalCaption, setOriginalCaption] = useState('')
  const [editedCardMessage, setEditedCardMessage] = useState('')
  const [isSavingCardMessage, setIsSavingCardMessage] = useState(false)
  const [platforms, setPlatforms] = useState({ tiktok: false, instagram: false })
  const [scheduledTime, setScheduledTime] = useState('')
  const [stats, setStats] = useState({
    views: '',
    likes: '',
    comments: '',
    shares: '',
    saves: '',
  })

  // UI state
  const [activeSlide, setActiveSlide] = useState(0)
  const [isSaving, setIsSaving] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [showDangerZone, setShowDangerZone] = useState(false)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)

  // Regenerate state
  const [regeneratingPhoto, setRegeneratingPhoto] = useState(false)
  const [regeneratingCaption, setRegeneratingCaption] = useState(false)

  // Slide 3 modal state
  const [showSlide3Modal, setShowSlide3Modal] = useState(false)
  const [slide3Type, setSlide3Type] = useState<'music' | 'celebrity' | 'movie' | 'other' | null>(null)
  const [slide3ImageUrl, setSlide3ImageUrl] = useState('')
  const [slide3Title, setSlide3Title] = useState('')
  const [slide3Artist, setSlide3Artist] = useState('')
  const [isGeneratingSlide3, setIsGeneratingSlide3] = useState(false)
  const [showSlide3ImageSearch, setShowSlide3ImageSearch] = useState(false)
  const [slide3ImageSearchQuery, setSlide3ImageSearchQuery] = useState('')

  // ===========================================
  // DATA FETCHING
  // ===========================================

  useEffect(() => {
    fetchPost()
  }, [postId])

  const fetchPost = async () => {
    setLoading(true)
    try {
      // Fetch post
      const { data: postData, error: postError } = await supabase
        .from('social_posts')
        .select('*')
        .eq('id', postId)
        .single()

      if (postError || !postData) {
        setNotFound(true)
        return
      }

      // Fetch recipient if exists
      let recipient: Recipient | undefined
      if (postData.recipient_id) {
        const { data: recipientData } = await supabase
          .from('social_recipients')
          .select('id, name, age_range, image_clean_url')
          .eq('id', postData.recipient_id)
          .single()
        if (recipientData) recipient = recipientData
      }

      // Fetch cultural moment if exists
      if (postData.cultural_moment_id) {
        const { data: momentData } = await supabase
          .from('social_cultural_moments')
          .select('*')
          .eq('id', postData.cultural_moment_id)
          .single()
        if (momentData) setCulturalMoment(momentData)
      }

      const fullPost = { ...postData, recipient } as SocialPost
      setPost(fullPost)
      setCaption(fullPost.caption || '')
      setOriginalCaption(fullPost.caption || '')
      setEditedCardMessage(fullPost.card_message || '')

      // Set platforms
      setPlatforms({
        tiktok: fullPost.platform === 'tiktok' || fullPost.platform === 'both',
        instagram: fullPost.platform === 'instagram' || fullPost.platform === 'both',
      })

      // Set scheduled time
      if (fullPost.scheduled_time) {
        const dt = new Date(fullPost.scheduled_time)
        setScheduledTime(dt.toISOString().slice(0, 16))
      }

      // Set stats
      setStats({
        views: fullPost.views?.toString() || '',
        likes: fullPost.likes?.toString() || '',
        comments: fullPost.comments?.toString() || '',
        shares: fullPost.shares?.toString() || '',
        saves: fullPost.saves?.toString() || '',
      })
    } catch (error) {
      console.error('Error fetching post:', error)
      setNotFound(true)
    } finally {
      setLoading(false)
    }
  }

  // ===========================================
  // HANDLERS
  // ===========================================

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3000)
  }

  const handleSaveCaption = async () => {
    if (!post) return
    setIsSaving(true)
    try {
      const { error } = await supabase
        .from('social_posts')
        .update({ caption })
        .eq('id', post.id)

      if (error) throw error

      setOriginalCaption(caption)
      showToast('Caption saved!', 'success')
    } catch (error) {
      console.error('Error saving caption:', error)
      showToast('Failed to save caption', 'error')
    } finally {
      setIsSaving(false)
    }
  }

  const handleSaveCardMessage = async () => {
    if (!post) return
    setIsSavingCardMessage(true)
    try {
      // Re-render Slide 2 with the new message
      showToast('Re-rendering Slide 2...', 'success')
      const renderRes = await fetch('/api/admin/social/render-card', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          photoUrl: post.generated_photo_url || '',
          message: editedCardMessage,
          uploadToS3: true,
        }),
      })

      const renderData = await renderRes.json()
      if (!renderRes.ok) throw new Error(renderData.error || 'Failed to render card')

      // Update the post with new card message and slide 2 URL
      const updates: Record<string, unknown> = { 
        card_message: editedCardMessage,
        slide_2_url: renderData.url
      }

      // Also re-render Slide 3 if it exists (to update the message)
      // Use stored slide3 details from state, OR fall back to cultural moment data
      const slide3MediaUrl = slide3ImageUrl || culturalMoment?.media_thumbnail_url
      if (post.slide_3_url && slide3MediaUrl) {
        const slide3Res = await fetch('/api/admin/social/render-slide3', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mediaImageUrl: slide3MediaUrl,
            mediaTitle: slide3Title || culturalMoment?.media_title || culturalMoment?.title || '',
            mediaArtist: slide3Artist || culturalMoment?.media_artist || '',
            year: culturalMoment?.date_occurred
              ? new Date(culturalMoment.date_occurred).getFullYear().toString()
              : '',
            category: slide3Type === 'music' ? 'music' : (culturalMoment?.category || 'movies_tv'),
            message: editedCardMessage,
          }),
        })
        const slide3Data = await slide3Res.json()
        if (slide3Res.ok && slide3Data.url) {
          updates.slide_3_url = slide3Data.url
        }
      }

      const { error } = await supabase
        .from('social_posts')
        .update(updates)
        .eq('id', post.id)

      if (error) throw error

      setPost({ 
        ...post, 
        card_message: editedCardMessage,
        slide_2_url: renderData.url,
        slide_3_url: (updates.slide_3_url as string) || post.slide_3_url
      })
      showToast('Card message and slides updated!', 'success')
    } catch (error) {
      console.error('Error saving card message:', error)
      showToast('Failed to save card message', 'error')
    } finally {
      setIsSavingCardMessage(false)
    }
  }

  const handleSchedule = async () => {
    if (!post || !scheduledTime) return
    setIsSaving(true)
    try {
      const platformValue = platforms.tiktok && platforms.instagram
        ? 'both'
        : platforms.tiktok
          ? 'tiktok'
          : 'instagram'

      const { error } = await supabase
        .from('social_posts')
        .update({
          platform: platformValue,
          scheduled_time: scheduledTime,
          status: 'pending',
        })
        .eq('id', post.id)

      if (error) throw error

      showToast('Post scheduled!', 'success')
      fetchPost()
    } catch (error) {
      console.error('Error scheduling post:', error)
      showToast('Failed to schedule post', 'error')
    } finally {
      setIsSaving(false)
    }
  }

  const handleCancelSchedule = async () => {
    if (!post) return
    setIsSaving(true)
    try {
      const { error } = await supabase
        .from('social_posts')
        .update({
          scheduled_time: null,
          status: 'draft',
        })
        .eq('id', post.id)

      if (error) throw error

      showToast('Schedule cancelled', 'success')
      fetchPost()
    } catch (error) {
      console.error('Error cancelling schedule:', error)
      showToast('Failed to cancel schedule', 'error')
    } finally {
      setIsSaving(false)
    }
  }

  const handleMarkAsPosted = async () => {
    if (!post) return
    setIsSaving(true)
    try {
      const platformValue = platforms.tiktok && platforms.instagram
        ? 'both'
        : platforms.tiktok
          ? 'tiktok'
          : 'instagram'

      const { error } = await supabase
        .from('social_posts')
        .update({
          status: 'posted',
          posted_at: new Date().toISOString(),
          platform: platformValue,
        })
        .eq('id', post.id)

      if (error) throw error

      showToast('Marked as posted!', 'success')
      fetchPost()
    } catch (error) {
      console.error('Error marking as posted:', error)
      showToast('Failed to mark as posted', 'error')
    } finally {
      setIsSaving(false)
    }
  }

  const handleSaveStats = async () => {
    if (!post) return
    setIsSaving(true)
    try {
      const { error } = await supabase
        .from('social_posts')
        .update({
          views: stats.views ? parseInt(stats.views) : null,
          likes: stats.likes ? parseInt(stats.likes) : null,
          comments: stats.comments ? parseInt(stats.comments) : null,
          shares: stats.shares ? parseInt(stats.shares) : null,
          saves: stats.saves ? parseInt(stats.saves) : null,
        })
        .eq('id', post.id)

      if (error) throw error

      showToast('Stats saved!', 'success')
      fetchPost()
    } catch (error) {
      console.error('Error saving stats:', error)
      showToast('Failed to save stats', 'error')
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!post) return
    setIsDeleting(true)
    try {
      const { error } = await supabase
        .from('social_posts')
        .delete()
        .eq('id', post.id)

      if (error) throw error

      showToast('Post deleted!', 'success')
      setTimeout(() => router.push('/admin/social/live-past'), 1000)
    } catch (error) {
      console.error('Error deleting post:', error)
      showToast('Failed to delete post', 'error')
      setIsDeleting(false)
    }
  }

  // Regenerate functions
  const regeneratePhoto = async () => {
    if (!post) return
    setRegeneratingPhoto(true)
    try {
      const res = await fetch('/api/admin/social/regenerate-slide2', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postId: post.id, regenerateType: 'photo' }),
      })
      const data = await res.json()
      if (data.success) {
        showToast('Photo regenerated!', 'success')
        window.location.reload()
      } else {
        showToast(data.error || 'Failed to regenerate photo', 'error')
      }
    } catch (error) {
      console.error('Failed to regenerate photo:', error)
      showToast('Failed to regenerate photo', 'error')
    }
    setRegeneratingPhoto(false)
  }

  const regenerateCaption = async () => {
    if (!post) return
    setRegeneratingCaption(true)
    try {
      const res = await fetch('/api/admin/social/regenerate-slide2', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postId: post.id, regenerateType: 'caption' }),
      })
      const data = await res.json()
      if (data.success) {
        showToast('Caption regenerated!', 'success')
        window.location.reload()
      } else {
        showToast(data.error || 'Failed to regenerate caption', 'error')
      }
    } catch (error) {
      console.error('Failed to regenerate caption:', error)
      showToast('Failed to regenerate caption', 'error')
    }
    setRegeneratingCaption(false)
  }

  // Slide 3 handlers
  const handleGenerateSlide3 = async () => {
    if (!post || !slide3ImageUrl || !slide3Title) return
    setIsGeneratingSlide3(true)
    try {
      // Determine category for template selection
      const category = slide3Type === 'music' ? 'music' : 'movies_tv'  // celebrity and movie both use video preview template

      // Use editedCardMessage (current textarea value) so if user edited but didn't save yet,
      // Slide 3 still gets the latest message
      const messageToUse = editedCardMessage || post.card_message || ''
      
      const res = await fetch('/api/admin/social/render-slide3', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mediaImageUrl: slide3ImageUrl,
          mediaTitle: slide3Title,
          mediaArtist: slide3Artist || '',
          year: culturalMoment?.date_occurred
            ? new Date(culturalMoment.date_occurred).getFullYear().toString()
            : '',
          slide3Type: slide3Type === 'music' ? 'album_art' : 'movie_poster',
          category,
          message: messageToUse,
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to render slide 3')

      // Save slide 3 URL to the post (and also save the card message if it was edited)
      const updates: Record<string, unknown> = { slide_3_url: data.url }
      if (editedCardMessage !== post.card_message) {
        updates.card_message = editedCardMessage
      }
      
      const { error } = await supabase
        .from('social_posts')
        .update(updates)
        .eq('id', post.id)

      if (error) throw error

      setPost({ 
        ...post, 
        slide_3_url: data.url,
        card_message: editedCardMessage || post.card_message
      })
      setShowSlide3Modal(false)
      // DON'T reset slide3 details - we need them for re-rendering when caption changes
      // setSlide3Type(null)
      // setSlide3ImageUrl('')
      // setSlide3Title('')
      // setSlide3Artist('')
      showToast('Slide 3 generated!', 'success')
    } catch (error) {
      console.error('Error generating slide 3:', error)
      showToast('Failed to generate slide 3', 'error')
    } finally {
      setIsGeneratingSlide3(false)
    }
  }

  const handleRemoveSlide3 = async () => {
    if (!post) return
    if (!confirm('Remove Slide 3 from this post?')) return
    try {
      const { error } = await supabase
        .from('social_posts')
        .update({ slide_3_url: null })
        .eq('id', post.id)

      if (error) throw error

      setPost({ ...post, slide_3_url: null })
      setActiveSlide(0) // Reset to first slide
      showToast('Slide 3 removed', 'success')
    } catch (error) {
      console.error('Error removing slide 3:', error)
      showToast('Failed to remove slide 3', 'error')
    }
  }

  const calculateEngagement = () => {
    const v = parseInt(stats.views) || 0
    if (v === 0) return null
    const l = parseInt(stats.likes) || 0
    const c = parseInt(stats.comments) || 0
    const sh = parseInt(stats.shares) || 0
    const sa = parseInt(stats.saves) || 0
    const engagement = ((l + c + sh + sa) / v) * 100
    return engagement.toFixed(2)
  }

  // ===========================================
  // COMPUTED
  // ===========================================

  const slideCount = post?.slide_3_url ? 3 : 2
  const captionChanged = caption !== originalCaption

  const getSlideUrl = (index: number): string | null => {
    if (!post) return null
    if (index === 0) return post.slide_1_url
    if (index === 1) return post.slide_2_url
    if (index === 2) return post.slide_3_url
    return null
  }

  const getSlideLabel = (index: number): string => {
    if (index === 0) return 'Recipient + Hook'
    if (index === 1) return 'HeartChime Card'
    if (index === 2) return 'Media Slide'
    return ''
  }

  // Navigate slides
  const goToSlide = (direction: 'prev' | 'next') => {
    if (direction === 'prev') {
      setActiveSlide((prev) => (prev === 0 ? slideCount - 1 : prev - 1))
    } else {
      setActiveSlide((prev) => (prev === slideCount - 1 ? 0 : prev + 1))
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

  if (notFound || !post) {
    return (
      <div className="min-h-screen bg-gray-900 p-6 flex flex-col items-center justify-center">
        <div className="text-6xl mb-4">😕</div>
        <h1 className="text-2xl font-bold text-white mb-2">Post Not Found</h1>
        <p className="text-gray-400 mb-6">This post doesn't exist or has been deleted.</p>
        <Link
          href="/admin/social/live-past"
          className="px-4 py-2 bg-gradient-to-r from-pink-500 to-purple-600 text-white rounded-lg hover:from-pink-400 hover:to-purple-500 transition-colors"
        >
          Back to Live Past
        </Link>
      </div>
    )
  }

  return (
    <div className="p-6 lg:p-8">
      {/* Toast */}
      {toast && (
        <div
          className={`fixed bottom-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg ${
            toast.type === 'success' ? 'bg-green-600' : 'bg-red-600'
          } text-white font-medium`}
        >
          {toast.message}
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[#1a1f2e] rounded-2xl border border-gray-800/50 p-6 max-w-md w-full">
            <h3 className="text-lg font-semibold text-white mb-2">Delete Post?</h3>
            <p className="text-gray-400 mb-6">
              This action cannot be undone. The post and all its data will be permanently deleted.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 py-2 px-4 rounded-xl bg-gray-700 text-white hover:bg-gray-600 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={isDeleting}
                className="flex-1 py-2 px-4 rounded-xl bg-red-600 text-white hover:bg-red-700 transition-colors disabled:opacity-50"
              >
                {isDeleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Left Column */}
        <div className="lg:col-span-3 space-y-6">
          {/* Header */}
          <div className="bg-[#1a1f2e] rounded-2xl border border-gray-800/50 p-6">
            {/* Breadcrumb */}
            <div className="flex items-center gap-2 mb-4 text-sm">
              <Link href="/admin/social" className="text-gray-400 hover:text-white">
                Social Command Center
              </Link>
              <span className="text-gray-600">/</span>
              <Link href="/admin/social/live-past" className="text-gray-400 hover:text-white">
                Live Past
              </Link>
              <span className="text-gray-600">/</span>
              <span className="text-gray-300">Post Details</span>
            </div>

            <div className="flex items-center gap-3 mb-2">
              <span className="text-2xl">🎬</span>
              <h1 className="text-xl font-bold text-white">Live Past Post</h1>
              <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-cyan-500/20 text-cyan-400">
                live_past
              </span>
              <span
                className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                  STATUS_STYLES[post.status] || STATUS_STYLES.draft
                }`}
              >
                {post.status.charAt(0).toUpperCase() + post.status.slice(1)}
              </span>
            </div>
            <p className="text-gray-400 text-sm">Created {formatDateTime(post.created_at)}</p>
          </div>

          {/* Cultural Moment Info */}
          <div className="bg-[#1a1f2e] rounded-2xl border border-gray-800/50 p-6">
            <h2 className="text-lg font-semibold text-white mb-4">Cultural Moment</h2>

            {culturalMoment ? (
              <div className="space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-white font-semibold text-lg">{culturalMoment.title}</h3>
                    <p className="text-gray-400 text-sm mt-1">
                      {formatFullDate(culturalMoment.date_occurred)}
                    </p>
                  </div>
                  <span
                    className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                      CATEGORY_COLORS[culturalMoment.category] || 'bg-gray-500/20 text-gray-400'
                    }`}
                  >
                    {CATEGORY_LABELS[culturalMoment.category] || culturalMoment.category}
                  </span>
                </div>

                {culturalMoment.media_title && (
                  <p className="text-gray-300">
                    🎵 {culturalMoment.media_title}
                    {culturalMoment.media_artist && ` by ${culturalMoment.media_artist}`}
                  </p>
                )}

                {culturalMoment.context_prompt && (
                  <p className="text-gray-500 text-sm">{culturalMoment.context_prompt}</p>
                )}

                <p className="text-gray-400 text-sm">
                  Era: <span className="text-white">{getDecadeFromDate(culturalMoment.date_occurred)}</span>
                </p>
              </div>
            ) : (
              <p className="text-gray-500 italic">No cultural moment linked</p>
            )}
          </div>

          {/* Post Details */}
          <div className="bg-[#1a1f2e] rounded-2xl border border-gray-800/50 p-6">
            <h2 className="text-lg font-semibold text-white mb-4">Post Details</h2>

            <div className="space-y-4">
              {/* Recipient */}
              <div className="flex items-center gap-3">
                <span className="text-gray-400 text-sm w-24">Recipient:</span>
                {post.recipient ? (
                  <div className="flex items-center gap-2">
                    {post.recipient.image_clean_url && (
                      <img
                        src={post.recipient.image_clean_url}
                        alt={post.recipient.name}
                        className="w-10 h-10 rounded-lg object-cover"
                      />
                    )}
                    <div>
                      <p className="text-white text-sm font-medium">{post.recipient.name}</p>
                      <p className="text-gray-500 text-xs">{post.recipient.age_range}</p>
                    </div>
                  </div>
                ) : (
                  <span className="text-gray-500 text-sm">Not selected</span>
                )}
              </div>

              {/* Relationship */}
              <div className="flex items-center gap-3">
                <span className="text-gray-400 text-sm w-24">Relationship:</span>
                <span className="text-white text-sm capitalize">
                  {post.deceased_relationship}
                  {post.deceased_nickname && post.deceased_nickname !== post.deceased_relationship && (
                    <span className="text-gray-400"> ("{post.deceased_nickname}")</span>
                  )}
                </span>
              </div>

              {/* Hook */}
              <div className="flex items-start gap-3">
                <span className="text-gray-400 text-sm w-24">Hook:</span>
                <div className="flex items-center gap-2">
                  <span className="text-white text-sm">"{post.hook_text}"</span>
                  {post.text_style && (
                    <span
                      className={`px-2 py-0.5 rounded text-xs ${
                        post.text_style === 'snapchat'
                          ? 'bg-pink-600/30 text-pink-300'
                          : 'bg-slate-600/30 text-slate-300'
                      }`}
                    >
                      {post.text_style}
                    </span>
                  )}
                </div>
              </div>

              {/* Time Period */}
              {post.time_period && (
                <div className="flex items-center gap-3">
                  <span className="text-gray-400 text-sm w-24">Time Period:</span>
                  <span className="text-white text-sm">{post.time_period}</span>
                </div>
              )}

              {/* Platform */}
              <div className="flex items-center gap-3">
                <span className="text-gray-400 text-sm w-24">Platform:</span>
                <div className="flex gap-2">
                  {(post.platform === 'tiktok' || post.platform === 'both') && (
                    <span className="px-2 py-0.5 rounded bg-gray-700 text-gray-300 text-xs">TikTok</span>
                  )}
                  {(post.platform === 'instagram' || post.platform === 'both') && (
                    <span className="px-2 py-0.5 rounded bg-gray-700 text-gray-300 text-xs">Instagram</span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Card Message */}
          <div className="bg-[#1a1f2e] rounded-2xl border border-gray-800/50 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">Card Message</h3>
              <span className="text-xs text-gray-500">Text inside the HeartChime card on Slide 2</span>
            </div>
            <textarea
              value={editedCardMessage}
              onChange={(e) => setEditedCardMessage(e.target.value)}
              rows={4}
              className="w-full px-4 py-3 bg-[#0f1419] border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-pink-500/50 resize-none"
            />
            <div className="flex justify-end mt-3">
              <button
                onClick={handleSaveCardMessage}
                disabled={isSavingCardMessage || editedCardMessage === post.card_message}
                className="px-4 py-2 bg-gradient-to-r from-pink-500 to-purple-600 text-white font-semibold rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSavingCardMessage ? 'Saving...' : 'Save Card Message'}
              </button>
            </div>
          </div>

          {/* Caption */}
          <div className="bg-[#1a1f2e] rounded-2xl border border-gray-800/50 p-6">
            <h2 className="text-lg font-semibold text-white mb-4">Social Caption</h2>
            <textarea
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              rows={4}
              className="w-full px-4 py-3 bg-[#0f1419] border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-pink-500/50 resize-none"
            />
            {captionChanged && (
              <button
                onClick={handleSaveCaption}
                disabled={isSaving}
                className="mt-3 px-4 py-2 bg-gradient-to-r from-pink-500 to-purple-600 text-white rounded-xl hover:from-pink-400 hover:to-purple-500 transition-colors disabled:opacity-50"
              >
                {isSaving ? 'Saving...' : 'Save Caption'}
              </button>
            )}
          </div>

          {/* Scheduling */}
          <div className="bg-[#1a1f2e] rounded-2xl border border-gray-800/50 p-6">
            <h2 className="text-lg font-semibold text-white mb-4">Scheduling</h2>

            {post.status === 'draft' && (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-2">Platform</label>
                  <div className="flex gap-4">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={platforms.tiktok}
                        onChange={(e) => setPlatforms((p) => ({ ...p, tiktok: e.target.checked }))}
                        className="w-4 h-4 rounded bg-gray-700 border-gray-600 text-pink-500 focus:ring-pink-500"
                      />
                      <span className="text-white text-sm">TikTok</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={platforms.instagram}
                        onChange={(e) => setPlatforms((p) => ({ ...p, instagram: e.target.checked }))}
                        className="w-4 h-4 rounded bg-gray-700 border-gray-600 text-pink-500 focus:ring-pink-500"
                      />
                      <span className="text-white text-sm">Instagram</span>
                    </label>
                  </div>
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-2">Schedule For</label>
                  <input
                    type="datetime-local"
                    value={scheduledTime}
                    onChange={(e) => setScheduledTime(e.target.value)}
                    className="w-full px-4 py-3 bg-[#0f1419] border border-gray-700 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-pink-500/50"
                  />
                </div>
                <button
                  onClick={handleSchedule}
                  disabled={isSaving || !scheduledTime || (!platforms.tiktok && !platforms.instagram)}
                  className="px-4 py-2 bg-gradient-to-r from-pink-500 to-purple-600 text-white rounded-xl hover:from-pink-400 hover:to-purple-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSaving ? 'Scheduling...' : 'Schedule Post'}
                </button>
              </div>
            )}

            {post.status === 'pending' && (
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-yellow-400">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                  <span>Scheduled for {post.scheduled_time ? formatDateTime(post.scheduled_time) : 'unknown'}</span>
                </div>
                <button
                  onClick={handleCancelSchedule}
                  disabled={isSaving}
                  className="px-4 py-2 bg-gray-700 text-white rounded-xl hover:bg-gray-600 transition-colors disabled:opacity-50"
                >
                  Cancel Schedule
                </button>
              </div>
            )}

            {post.status === 'notified' && (
              <div className="flex items-center gap-2 text-blue-400">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
                  />
                </svg>
                <span>Waiting for manual post</span>
              </div>
            )}

            {post.status === 'posted' && post.posted_at && (
              <div className="flex items-center gap-2 text-green-400">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span>Posted on {formatDateTime(post.posted_at)}</span>
              </div>
            )}
          </div>

          {/* Mark as Posted (only if notified) */}
          {post.status === 'notified' && (
            <div className="bg-[#1a1f2e] rounded-2xl border border-gray-800/50 p-6">
              <h2 className="text-lg font-semibold text-white mb-2">Mark as Posted</h2>
              <p className="text-gray-400 text-sm mb-4">
                After you've posted manually in TikTok/Instagram, mark it here to track performance.
              </p>

              <div className="mb-4">
                <label className="block text-sm text-gray-400 mb-2">Posted to:</label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={platforms.tiktok}
                      onChange={(e) => setPlatforms((p) => ({ ...p, tiktok: e.target.checked }))}
                      className="w-4 h-4 rounded bg-gray-700 border-gray-600 text-pink-500 focus:ring-pink-500"
                    />
                    <span className="text-white text-sm">TikTok</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={platforms.instagram}
                      onChange={(e) => setPlatforms((p) => ({ ...p, instagram: e.target.checked }))}
                      className="w-4 h-4 rounded bg-gray-700 border-gray-600 text-pink-500 focus:ring-pink-500"
                    />
                    <span className="text-white text-sm">Instagram</span>
                  </label>
                </div>
              </div>

              <button
                onClick={handleMarkAsPosted}
                disabled={isSaving || (!platforms.tiktok && !platforms.instagram)}
                className="px-4 py-2 bg-green-600 text-white rounded-xl hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSaving ? 'Saving...' : '✓ Mark as Posted'}
              </button>
            </div>
          )}

          {/* Performance (only if posted) */}
          {post.status === 'posted' && (
            <div className="bg-[#1a1f2e] rounded-2xl border border-gray-800/50 p-6">
              <h2 className="text-lg font-semibold text-white mb-4">Performance</h2>

              <div className="grid grid-cols-5 gap-3 mb-4">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Views</label>
                  <input
                    type="number"
                    value={stats.views}
                    onChange={(e) => setStats((s) => ({ ...s, views: e.target.value }))}
                    className="w-full px-2 py-1.5 bg-[#0f1419] border border-gray-700 rounded text-white text-sm focus:outline-none focus:ring-2 focus:ring-pink-500/50"
                    placeholder="0"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Likes</label>
                  <input
                    type="number"
                    value={stats.likes}
                    onChange={(e) => setStats((s) => ({ ...s, likes: e.target.value }))}
                    className="w-full px-2 py-1.5 bg-[#0f1419] border border-gray-700 rounded text-white text-sm focus:outline-none focus:ring-2 focus:ring-pink-500/50"
                    placeholder="0"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Comments</label>
                  <input
                    type="number"
                    value={stats.comments}
                    onChange={(e) => setStats((s) => ({ ...s, comments: e.target.value }))}
                    className="w-full px-2 py-1.5 bg-[#0f1419] border border-gray-700 rounded text-white text-sm focus:outline-none focus:ring-2 focus:ring-pink-500/50"
                    placeholder="0"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Shares</label>
                  <input
                    type="number"
                    value={stats.shares}
                    onChange={(e) => setStats((s) => ({ ...s, shares: e.target.value }))}
                    className="w-full px-2 py-1.5 bg-[#0f1419] border border-gray-700 rounded text-white text-sm focus:outline-none focus:ring-2 focus:ring-pink-500/50"
                    placeholder="0"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Saves</label>
                  <input
                    type="number"
                    value={stats.saves}
                    onChange={(e) => setStats((s) => ({ ...s, saves: e.target.value }))}
                    className="w-full px-2 py-1.5 bg-[#0f1419] border border-gray-700 rounded text-white text-sm focus:outline-none focus:ring-2 focus:ring-pink-500/50"
                    placeholder="0"
                  />
                </div>
              </div>

              {calculateEngagement() && (
                <div className="mb-4 p-3 bg-[#0f1419] rounded-lg">
                  <span className="text-gray-400 text-sm">Engagement Rate: </span>
                  <span className="text-green-400 font-semibold">{calculateEngagement()}%</span>
                </div>
              )}

              <button
                onClick={handleSaveStats}
                disabled={isSaving}
                className="px-4 py-2 bg-gradient-to-r from-pink-500 to-purple-600 text-white rounded-xl hover:from-pink-400 hover:to-purple-500 transition-colors disabled:opacity-50"
              >
                {isSaving ? 'Saving...' : 'Save Stats'}
              </button>
            </div>
          )}

          {/* Danger Zone */}
          <div className="bg-[#1a1f2e] rounded-2xl border border-gray-800/50 overflow-hidden">
            <button
              onClick={() => setShowDangerZone(!showDangerZone)}
              className="w-full p-4 flex items-center justify-between text-left hover:bg-gray-800/30 transition-colors"
            >
              <span className="text-red-400 font-medium">⚠️ Danger Zone</span>
              <svg
                className={`w-5 h-5 text-gray-400 transition-transform ${showDangerZone ? 'rotate-180' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {showDangerZone && (
              <div className="p-6 pt-2 border-t border-gray-800/50">
                <p className="text-gray-400 text-sm mb-4">
                  Permanently delete this post. This action cannot be undone.
                </p>
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  className="px-4 py-2 bg-red-600 text-white rounded-xl hover:bg-red-700 transition-colors"
                >
                  Delete Post
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Right Column - Preview */}
        <div className="lg:col-span-2 lg:sticky lg:top-6 self-start space-y-4">
          {/* Phone Mockup */}
          <div className="bg-[#1a1f2e] rounded-2xl border border-gray-800/50 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-white">Preview</h2>
              <span className="text-gray-500 text-sm">
                {activeSlide + 1}/{slideCount}
              </span>
            </div>

            {/* Phone Frame */}
            <div className="mx-auto bg-gray-950 rounded-[2rem] p-2 border border-gray-700 shadow-2xl" style={{ maxWidth: '280px' }}>
              {/* Screen */}
              <div className="relative bg-gray-900 rounded-[1.5rem] overflow-hidden" style={{ aspectRatio: '9/16' }}>
                {/* Slide Content */}
                {getSlideUrl(activeSlide) ? (
                  <img
                    src={getSlideUrl(activeSlide)!}
                    alt={`Slide ${activeSlide + 1}`}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center bg-gray-800">
                    <span className="text-4xl mb-2">📷</span>
                    <p className="text-gray-500 text-sm">Not yet generated</p>
                  </div>
                )}

                {/* Navigation Arrows */}
                {slideCount > 1 && (
                  <>
                    <button
                      onClick={() => goToSlide('prev')}
                      className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 bg-black/50 rounded-full flex items-center justify-center text-white hover:bg-black/70 transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                      </svg>
                    </button>
                    <button
                      onClick={() => goToSlide('next')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 bg-black/50 rounded-full flex items-center justify-center text-white hover:bg-black/70 transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                  </>
                )}

                {/* Carousel Dots */}
                <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-1.5">
                  {Array.from({ length: slideCount }).map((_, idx) => (
                    <button
                      key={idx}
                      onClick={() => setActiveSlide(idx)}
                      className={`w-2 h-2 rounded-full transition-all ${
                        activeSlide === idx ? 'bg-white w-4' : 'bg-white/50 hover:bg-white/70'
                      }`}
                    />
                  ))}
                </div>
              </div>
            </div>

            {/* Slide Labels */}
            <div className="flex justify-center gap-4 mt-3 flex-wrap">
              {Array.from({ length: slideCount }).map((_, idx) => (
                <button
                  key={idx}
                  onClick={() => setActiveSlide(idx)}
                  className={`text-xs ${activeSlide === idx ? 'text-pink-400' : 'text-gray-500'}`}
                >
                  Slide {idx + 1}: {getSlideLabel(idx)}
                </button>
              ))}
            </div>

            {/* Add/Remove Slide 3 buttons */}
            {!post.slide_3_url && (
              <button
                onClick={() => {
                  // Pre-fill from cultural moment data if available
                  setSlide3Title(culturalMoment?.media_title || culturalMoment?.title || '')
                  setSlide3Artist(culturalMoment?.media_artist || '')
                  setShowSlide3Modal(true)
                }}
                className="w-full mt-4 px-4 py-3 bg-[#0f1419] border border-dashed border-gray-600 rounded-xl text-gray-400 hover:text-white hover:border-gray-500 transition-colors"
              >
                + Add Slide 3
              </button>
            )}

            {post.slide_3_url && (
              <button
                onClick={handleRemoveSlide3}
                className="w-full mt-2 px-4 py-2 text-sm text-red-400 hover:text-red-300 transition-colors"
              >
                Remove Slide 3
              </button>
            )}
          </div>

          {/* Download Buttons */}
          {(post.slide_1_url || post.slide_2_url || post.slide_3_url) && (
            <div className="bg-[#1a1f2e] rounded-2xl border border-gray-800/50 p-4">
              <h3 className="text-sm font-medium text-white mb-3">Download Slides</h3>
              <div className="flex flex-wrap gap-2">
                {post.slide_1_url && (
                  <a
                    href={post.slide_1_url}
                    download
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 py-2 px-3 bg-gray-700 text-white text-sm rounded-lg hover:bg-gray-600 transition-colors text-center min-w-[80px]"
                  >
                    📥 Slide 1
                  </a>
                )}
                {post.slide_2_url && (
                  <a
                    href={post.slide_2_url}
                    download
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 py-2 px-3 bg-gray-700 text-white text-sm rounded-lg hover:bg-gray-600 transition-colors text-center min-w-[80px]"
                  >
                    📥 Slide 2
                  </a>
                )}
                {post.slide_3_url && (
                  <a
                    href={post.slide_3_url}
                    download
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 py-2 px-3 bg-gray-700 text-white text-sm rounded-lg hover:bg-gray-600 transition-colors text-center min-w-[80px]"
                  >
                    📥 Slide 3
                  </a>
                )}
              </div>
            </div>
          )}

          {/* Regenerate Section */}
          <div className="bg-[#1a1f2e] rounded-2xl border border-gray-800/50 p-4">
            <h3 className="text-sm font-medium text-white mb-3">Regenerate Slide 2</h3>
            <div className="flex gap-2">
              <button
                onClick={regeneratePhoto}
                disabled={regeneratingPhoto}
                className="flex-1 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-800 disabled:cursor-not-allowed text-white py-2 px-3 text-sm rounded-lg transition-colors"
              >
                {regeneratingPhoto ? '🔄 Generating...' : '🖼️ New Photo'}
              </button>
              <button
                onClick={regenerateCaption}
                disabled={regeneratingCaption}
                className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 disabled:cursor-not-allowed text-white py-2 px-3 text-sm rounded-lg transition-colors"
              >
                {regeneratingCaption ? '🔄 Generating...' : '✏️ New Caption'}
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-2">Regenerate the AI photo or card message for slide 2</p>
          </div>
        </div>
      </div>

      {/* Slide 3 Modal */}
      {showSlide3Modal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-[#1a1f2e] rounded-2xl border border-gray-700 p-8 max-w-lg w-full">
            <h3 className="text-xl font-bold text-white mb-6">Add Slide 3</h3>

            {/* Step 1: Pick type */}
            {!slide3Type && (
              <div className="grid grid-cols-2 gap-4">
                {[
                  { key: 'music', label: '🎵 Music', desc: 'Song or album' },
                  { key: 'celebrity', label: '⭐ Celebrity', desc: 'Famous person' },
                  { key: 'movie', label: '🎬 Movie / TV', desc: 'Film or show' },
                  { key: 'other', label: '📷 Other', desc: 'Custom image' },
                ].map((opt) => (
                  <button
                    key={opt.key}
                    onClick={() => setSlide3Type(opt.key as 'music' | 'celebrity' | 'movie' | 'other')}
                    className="p-6 bg-[#0f1419] border border-gray-700 rounded-xl hover:border-pink-500/50 transition-colors text-left"
                  >
                    <div className="text-2xl mb-2">{opt.label.split(' ')[0]}</div>
                    <div className="text-white font-semibold">{opt.label.split(' ').slice(1).join(' ')}</div>
                    <div className="text-gray-500 text-sm mt-1">{opt.desc}</div>
                  </button>
                ))}
              </div>
            )}

            {/* Step 2: Fill details + find image */}
            {slide3Type && (
              <div className="space-y-4">
                <button
                  onClick={() => setSlide3Type(null)}
                  className="text-sm text-gray-500 hover:text-gray-300 mb-2"
                >
                  ← Back to type selection
                </button>

                <div>
                  <label className="block text-sm text-gray-400 mb-2">
                    {slide3Type === 'music' ? 'Song / Album Title' : slide3Type === 'movie' ? 'Movie / Show Title' : slide3Type === 'celebrity' ? 'Person Name' : 'Title'}
                  </label>
                  <input
                    type="text"
                    value={slide3Title}
                    onChange={(e) => setSlide3Title(e.target.value)}
                    placeholder={slide3Type === 'music' ? "e.g., Can't Help Falling in Love" : slide3Type === 'movie' ? 'e.g., The Lion King' : slide3Type === 'celebrity' ? 'e.g., Robin Williams' : 'Title'}
                    className="w-full px-4 py-3 bg-[#0f1419] border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-pink-500/50"
                  />
                </div>

                {slide3Type !== 'other' && (
                  <div>
                    <label className="block text-sm text-gray-400 mb-2">
                      {slide3Type === 'music' ? 'Artist' : slide3Type === 'movie' ? 'Studio / Network' : 'Known For'}
                    </label>
                    <input
                      type="text"
                      value={slide3Artist}
                      onChange={(e) => setSlide3Artist(e.target.value)}
                      placeholder={slide3Type === 'music' ? 'e.g., Elvis Presley' : slide3Type === 'movie' ? 'e.g., Disney' : 'e.g., Actor, Musician'}
                      className="w-full px-4 py-3 bg-[#0f1419] border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-pink-500/50"
                    />
                  </div>
                )}

                <div>
                  <label className="block text-sm text-gray-400 mb-2">Image</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={slide3ImageUrl}
                      onChange={(e) => setSlide3ImageUrl(e.target.value)}
                      placeholder="Paste image URL"
                      className="flex-1 px-4 py-3 bg-[#0f1419] border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-pink-500/50"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        let query = ''
                        if (slide3Type === 'music') query = `${slide3Artist} ${slide3Title} album cover`
                        else if (slide3Type === 'movie') query = `${slide3Title} movie poster`
                        else if (slide3Type === 'celebrity') query = `${slide3Title} portrait photo`
                        else query = slide3Title || 'image'
                        setSlide3ImageSearchQuery(query)
                        setShowSlide3ImageSearch(true)
                      }}
                      className="px-4 py-3 bg-[#0f1419] border border-gray-700 rounded-xl text-amber-400 hover:bg-[#252b3b] transition-colors whitespace-nowrap"
                    >
                      🔍 Find
                    </button>
                  </div>
                  {slide3ImageUrl && (
                    <img src={slide3ImageUrl} alt="Preview" className="mt-3 h-32 rounded-lg object-cover" />
                  )}
                </div>

                <button
                  onClick={handleGenerateSlide3}
                  disabled={!slide3ImageUrl || !slide3Title || isGeneratingSlide3}
                  className="w-full mt-4 px-4 py-3 bg-gradient-to-r from-pink-500 to-purple-600 text-white font-semibold rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isGeneratingSlide3 ? 'Generating Slide 3...' : 'Generate Slide 3'}
                </button>
              </div>
            )}

            {/* Close button */}
            <button
              onClick={() => {
                setShowSlide3Modal(false)
                setSlide3Type(null)
                setSlide3ImageUrl('')
                setSlide3Title('')
                setSlide3Artist('')
              }}
              className="w-full mt-4 px-4 py-2 text-gray-500 hover:text-gray-300 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Image search modal for Slide 3 */}
      <ImageSearchModal
        isOpen={showSlide3ImageSearch}
        onClose={() => setShowSlide3ImageSearch(false)}
        onSelect={(url: string) => {
          setSlide3ImageUrl(url)
          setShowSlide3ImageSearch(false)
        }}
        initialQuery={slide3ImageSearchQuery}
      />
    </div>
  )
}

