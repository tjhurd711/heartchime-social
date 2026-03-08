'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import Link from 'next/link';
import { useRouter, useParams } from 'next/navigation';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

interface Recipient {
  id: string;
  name: string;
  age_range: string;
  image_clean_url: string;
}

interface SocialPost {
  id: string;
  status: 'draft' | 'pending' | 'notified' | 'posted' | 'failed';
  scheduled_time: string | null;
  notified_at: string | null;
  posted_at: string | null;
  platform: string;
  post_type: string;
  pipeline: string | null;
  slide_1_url: string | null;
  slide_2_url: string | null;
  slide_3_url: string | null;
  hook_text: string;
  text_style: string;
  deceased_nickname: string;
  deceased_relationship: string;
  time_period: string;
  caption: string;
  card_message: string | null;
  recipient_id: string | null;
  trend_keyword: string | null;
  trend_id: string | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  saves: number | null;
  created_at: string;
  recipient?: Recipient;
}

const STATUS_STYLES: Record<string, string> = {
  draft: 'bg-gray-600 text-gray-100',
  pending: 'bg-amber-600 text-amber-100',
  notified: 'bg-blue-600 text-blue-100',
  posted: 'bg-emerald-600 text-emerald-100',
  failed: 'bg-red-600 text-red-100',
};

export default function LiveNowPostDetailPage() {
  const router = useRouter();
  const params = useParams();
  const postId = params.id as string;

  // Data state
  const [post, setPost] = useState<SocialPost | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  // Editing state
  const [caption, setCaption] = useState('');
  const [originalCaption, setOriginalCaption] = useState('');
  const [platforms, setPlatforms] = useState({ tiktok: false, instagram: false });
  const [scheduledTime, setScheduledTime] = useState('');
  const [stats, setStats] = useState({
    views: '',
    likes: '',
    comments: '',
    shares: '',
    saves: '',
  });

  // UI state
  const [activeSlide, setActiveSlide] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showDangerZone, setShowDangerZone] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Regenerate state
  const [regeneratingPhoto, setRegeneratingPhoto] = useState(false);
  const [regeneratingCaption, setRegeneratingCaption] = useState(false);

  // Slide 3 state
  const [slide3Type, setSlide3Type] = useState<'album_art' | 'movie_poster'>('album_art');
  const [slide3ImageUrl, setSlide3ImageUrl] = useState('');
  const [slide3Title, setSlide3Title] = useState('');
  const [slide3Artist, setSlide3Artist] = useState('');
  const [generatingSlide3, setGeneratingSlide3] = useState(false);

  // Fetch post on mount
  useEffect(() => {
    fetchPost();
  }, [postId]);

  const fetchPost = async () => {
    setLoading(true);
    try {
      const { data: postData, error: postError } = await supabase
        .from('social_posts')
        .select('*')
        .eq('id', postId)
        .single();

      if (postError || !postData) {
        setNotFound(true);
        return;
      }

      // Fetch recipient if exists
      let recipient: Recipient | undefined;
      if (postData.recipient_id) {
        const { data: recipientData } = await supabase
          .from('social_recipients')
          .select('id, name, age_range, image_clean_url')
          .eq('id', postData.recipient_id)
          .single();
        if (recipientData) recipient = recipientData;
      }

      const fullPost = { ...postData, recipient } as SocialPost;
      setPost(fullPost);
      setCaption(fullPost.caption || '');
      setOriginalCaption(fullPost.caption || '');
      
      setPlatforms({
        tiktok: fullPost.platform === 'tiktok' || fullPost.platform === 'both',
        instagram: fullPost.platform === 'instagram' || fullPost.platform === 'both',
      });

      if (fullPost.scheduled_time) {
        const dt = new Date(fullPost.scheduled_time);
        setScheduledTime(dt.toISOString().slice(0, 16));
      }

      setStats({
        views: fullPost.views?.toString() || '',
        likes: fullPost.likes?.toString() || '',
        comments: fullPost.comments?.toString() || '',
        shares: fullPost.shares?.toString() || '',
        saves: fullPost.saves?.toString() || '',
      });
    } catch (error) {
      console.error('Error fetching post:', error);
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  };

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const handleSaveCaption = async () => {
    if (!post) return;
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('social_posts')
        .update({ caption })
        .eq('id', post.id);

      if (error) throw error;

      setOriginalCaption(caption);
      showToast('Caption saved!', 'success');
    } catch (error) {
      console.error('Error saving caption:', error);
      showToast('Failed to save caption', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSchedule = async () => {
    if (!post || !scheduledTime) return;
    setIsSaving(true);
    try {
      const platformValue = platforms.tiktok && platforms.instagram 
        ? 'both' 
        : platforms.tiktok 
          ? 'tiktok' 
          : 'instagram';

      const { error } = await supabase
        .from('social_posts')
        .update({
          platform: platformValue,
          scheduled_time: scheduledTime,
          status: 'pending',
        })
        .eq('id', post.id);

      if (error) throw error;

      showToast('Post scheduled!', 'success');
      fetchPost();
    } catch (error) {
      console.error('Error scheduling post:', error);
      showToast('Failed to schedule post', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancelSchedule = async () => {
    if (!post) return;
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('social_posts')
        .update({
          scheduled_time: null,
          status: 'draft',
        })
        .eq('id', post.id);

      if (error) throw error;

      showToast('Schedule cancelled', 'success');
      fetchPost();
    } catch (error) {
      console.error('Error cancelling schedule:', error);
      showToast('Failed to cancel schedule', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleMarkAsPosted = async () => {
    if (!post) return;
    setIsSaving(true);
    try {
      const platformValue = platforms.tiktok && platforms.instagram 
        ? 'both' 
        : platforms.tiktok 
          ? 'tiktok' 
          : 'instagram';

      const { error } = await supabase
        .from('social_posts')
        .update({
          status: 'posted',
          posted_at: new Date().toISOString(),
          platform: platformValue,
        })
        .eq('id', post.id);

      if (error) throw error;

      showToast('Marked as posted!', 'success');
      fetchPost();
    } catch (error) {
      console.error('Error marking as posted:', error);
      showToast('Failed to mark as posted', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveStats = async () => {
    if (!post) return;
    setIsSaving(true);
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
        .eq('id', post.id);

      if (error) throw error;

      showToast('Stats saved!', 'success');
      fetchPost();
    } catch (error) {
      console.error('Error saving stats:', error);
      showToast('Failed to save stats', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!post) return;
    setIsDeleting(true);
    try {
      const { error } = await supabase
        .from('social_posts')
        .delete()
        .eq('id', post.id);

      if (error) throw error;

      showToast('Post deleted!', 'success');
      setTimeout(() => router.push('/admin/social/live-now'), 1000);
    } catch (error) {
      console.error('Error deleting post:', error);
      showToast('Failed to delete post', 'error');
      setIsDeleting(false);
    }
  };

  const regeneratePhoto = async () => {
    if (!post) return;
    setRegeneratingPhoto(true);
    try {
      const res = await fetch('/api/admin/social/regenerate-slide2', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postId: post.id, regenerateType: 'photo' })
      });
      const data = await res.json();
      if (data.success) {
        showToast('Photo regenerated!', 'success');
        window.location.reload();
      } else {
        showToast(data.error || 'Failed to regenerate photo', 'error');
      }
    } catch (error) {
      console.error('Failed to regenerate photo:', error);
      showToast('Failed to regenerate photo', 'error');
    }
    setRegeneratingPhoto(false);
  };

  const regenerateCaption = async () => {
    if (!post) return;
    setRegeneratingCaption(true);
    try {
      const res = await fetch('/api/admin/social/regenerate-slide2', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postId: post.id, regenerateType: 'caption' })
      });
      const data = await res.json();
      if (data.success) {
        showToast('Caption regenerated!', 'success');
        window.location.reload();
      } else {
        showToast(data.error || 'Failed to regenerate caption', 'error');
      }
    } catch (error) {
      console.error('Failed to regenerate caption:', error);
      showToast('Failed to regenerate caption', 'error');
    }
    setRegeneratingCaption(false);
  };

  const generateSlide3 = async () => {
    if (!post || !slide3ImageUrl || !slide3Title) {
      showToast('Please fill in the image URL and title', 'error');
      return;
    }

    setGeneratingSlide3(true);
    try {
      const res = await fetch('/api/admin/social/generate-slide-3', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          postId: post.id,
          slide3Type,
          slide3ImageUrl,
          slide3Title,
          slide3Artist,
        })
      });
      const data = await res.json();
      if (data.success) {
        showToast('Slide 3 generated!', 'success');
        // Clear form
        setSlide3ImageUrl('');
        setSlide3Title('');
        setSlide3Artist('');
        // Refresh post data
        window.location.reload();
      } else {
        showToast(data.error || 'Failed to generate Slide 3', 'error');
      }
    } catch (error) {
      console.error('Failed to generate Slide 3:', error);
      showToast('Failed to generate Slide 3', 'error');
    }
    setGeneratingSlide3(false);
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  const calculateEngagement = () => {
    const v = parseInt(stats.views) || 0;
    if (v === 0) return null;
    const l = parseInt(stats.likes) || 0;
    const c = parseInt(stats.comments) || 0;
    const sh = parseInt(stats.shares) || 0;
    const sa = parseInt(stats.saves) || 0;
    const engagement = ((l + c + sh + sa) / v) * 100;
    return engagement.toFixed(2);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 p-6 flex items-center justify-center">
        <div className="text-gray-400">Loading...</div>
      </div>
    );
  }

  if (notFound || !post) {
    return (
      <div className="min-h-screen bg-gray-900 p-6 flex flex-col items-center justify-center">
        <div className="text-6xl mb-4">😕</div>
        <h1 className="text-2xl font-bold text-white mb-2">Post Not Found</h1>
        <p className="text-gray-400 mb-6">This post doesn't exist or has been deleted.</p>
        <Link 
          href="/admin/social/live-now"
          className="px-4 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 transition-colors"
        >
          Back to Live Now
        </Link>
      </div>
    );
  }

  const captionChanged = caption !== originalCaption;

  return (
    <div className="min-h-screen bg-gray-900 p-6">
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

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-xl p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold text-white mb-2">Delete Post?</h3>
            <p className="text-gray-400 mb-6">
              This action cannot be undone. The post and all its data will be permanently deleted.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 py-2 px-4 rounded-lg bg-gray-700 text-white hover:bg-gray-600 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={isDeleting}
                className="flex-1 py-2 px-4 rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors disabled:opacity-50"
              >
                {isDeleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Two-column layout */}
      <div className="flex gap-6">
        {/* Left Column */}
        <div className="flex-1 max-w-[60%] space-y-6">
          {/* Header */}
          <div className="bg-[#1a1f2e] rounded-2xl border border-gray-800/50 p-6">
            <div className="flex items-center gap-2 text-sm text-gray-400 mb-4">
              <Link href="/admin/social" className="hover:text-white">Social Command Center</Link>
              <span>/</span>
              <Link href="/admin/social/live-now" className="hover:text-white">Live Now</Link>
              <span>/</span>
              <span className="text-gray-300">Post Detail</span>
            </div>
            
            <div className="flex items-center gap-3 mb-2">
              <span className="text-2xl">⚡</span>
              <h1 className="text-xl font-bold text-white">Live Now Post</h1>
              <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${STATUS_STYLES[post.status]}`}>
                {post.status.charAt(0).toUpperCase() + post.status.slice(1)}
              </span>
            </div>
            
            {post.trend_keyword && (
              <div className="mt-3 bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2 inline-flex items-center gap-2">
                <span className="text-amber-400">📈</span>
                <span className="text-amber-200 font-medium">{post.trend_keyword}</span>
              </div>
            )}
            
            <p className="text-gray-500 text-sm mt-3">
              Created {formatDate(post.created_at)}
            </p>
          </div>

          {/* Content Details */}
          <div className="bg-[#1a1f2e] rounded-2xl border border-gray-800/50 p-6">
            <h2 className="text-lg font-semibold text-white mb-4">Content Details</h2>
            
            <div className="space-y-4">
              {/* Trend Keyword */}
              {post.trend_keyword && (
                <div className="flex items-center gap-3">
                  <span className="text-gray-400 text-sm w-24">Trend:</span>
                  <span className="text-amber-400 font-medium">{post.trend_keyword}</span>
                </div>
              )}

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

              {/* Deceased */}
              <div className="flex items-start gap-3">
                <span className="text-gray-400 text-sm w-24">Deceased:</span>
                <div>
                  <p className="text-white text-sm">
                    {post.deceased_relationship}
                    {post.deceased_nickname && (
                      <span className="text-gray-400"> "{post.deceased_nickname}"</span>
                    )}
                  </p>
                  {post.time_period && (
                    <p className="text-gray-500 text-xs mt-0.5">{post.time_period}</p>
                  )}
                </div>
              </div>

              {/* Hook */}
              <div className="flex items-start gap-3">
                <span className="text-gray-400 text-sm w-24">Hook:</span>
                <div className="flex items-center gap-2">
                  <span className="text-white text-sm">"{post.hook_text}"</span>
                  {post.text_style && (
                    <span className={`px-2 py-0.5 rounded text-xs ${
                      post.text_style === 'snapchat' ? 'bg-pink-600/30 text-pink-300' : 'bg-slate-600/30 text-slate-300'
                    }`}>
                      {post.text_style}
                    </span>
                  )}
                </div>
              </div>

              {/* Card Message */}
              {post.card_message && (
                <div className="flex items-start gap-3">
                  <span className="text-gray-400 text-sm w-24">Card Msg:</span>
                  <p className="text-gray-300 text-sm italic">"{post.card_message}"</p>
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

          {/* Caption */}
          <div className="bg-[#1a1f2e] rounded-2xl border border-gray-800/50 p-6">
            <h2 className="text-lg font-semibold text-white mb-4">Social Caption</h2>
            <textarea
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              rows={3}
              className="w-full px-4 py-3 bg-[#0f1419] border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50 resize-none"
            />
            {captionChanged && (
              <button
                onClick={handleSaveCaption}
                disabled={isSaving}
                className="mt-3 px-4 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 transition-colors disabled:opacity-50"
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
                        onChange={(e) => setPlatforms(p => ({ ...p, tiktok: e.target.checked }))}
                        className="w-4 h-4 rounded bg-gray-700 border-gray-600 text-amber-500 focus:ring-amber-500"
                      />
                      <span className="text-white text-sm">TikTok</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={platforms.instagram}
                        onChange={(e) => setPlatforms(p => ({ ...p, instagram: e.target.checked }))}
                        className="w-4 h-4 rounded bg-gray-700 border-gray-600 text-amber-500 focus:ring-amber-500"
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
                    className="w-full px-4 py-3 bg-[#0f1419] border border-gray-700 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                  />
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={handleSchedule}
                    disabled={isSaving || !scheduledTime || (!platforms.tiktok && !platforms.instagram)}
                    className="px-4 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isSaving ? 'Scheduling...' : 'Schedule Post'}
                  </button>
                  <button
                    onClick={handleMarkAsPosted}
                    disabled={isSaving || (!platforms.tiktok && !platforms.instagram)}
                    className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    ✓ Mark as Posted Now
                  </button>
                </div>
              </div>
            )}

            {post.status === 'pending' && (
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-amber-400">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span>Scheduled for {post.scheduled_time ? formatDate(post.scheduled_time) : 'unknown'}</span>
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={handleCancelSchedule}
                    disabled={isSaving}
                    className="px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600 transition-colors disabled:opacity-50"
                  >
                    Cancel Schedule
                  </button>
                </div>
              </div>
            )}

            {post.status === 'notified' && (
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-blue-400">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                  </svg>
                  <span>Waiting for manual post</span>
                </div>
                <button
                  onClick={handleMarkAsPosted}
                  disabled={isSaving}
                  className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50"
                >
                  {isSaving ? 'Saving...' : '✓ Mark as Posted'}
                </button>
              </div>
            )}

            {post.status === 'posted' && post.posted_at && (
              <div className="flex items-center gap-2 text-emerald-400">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span>Posted on {formatDate(post.posted_at)}</span>
              </div>
            )}
          </div>

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
                    onChange={(e) => setStats(s => ({ ...s, views: e.target.value }))}
                    className="w-full px-3 py-2 bg-[#0f1419] border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                    placeholder="0"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Likes</label>
                  <input
                    type="number"
                    value={stats.likes}
                    onChange={(e) => setStats(s => ({ ...s, likes: e.target.value }))}
                    className="w-full px-3 py-2 bg-[#0f1419] border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                    placeholder="0"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Comments</label>
                  <input
                    type="number"
                    value={stats.comments}
                    onChange={(e) => setStats(s => ({ ...s, comments: e.target.value }))}
                    className="w-full px-3 py-2 bg-[#0f1419] border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                    placeholder="0"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Shares</label>
                  <input
                    type="number"
                    value={stats.shares}
                    onChange={(e) => setStats(s => ({ ...s, shares: e.target.value }))}
                    className="w-full px-3 py-2 bg-[#0f1419] border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                    placeholder="0"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Saves</label>
                  <input
                    type="number"
                    value={stats.saves}
                    onChange={(e) => setStats(s => ({ ...s, saves: e.target.value }))}
                    className="w-full px-3 py-2 bg-[#0f1419] border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                    placeholder="0"
                  />
                </div>
              </div>

              {calculateEngagement() && (
                <div className="mb-4 p-3 bg-[#0f1419] rounded-lg">
                  <span className="text-gray-400 text-sm">Engagement Rate: </span>
                  <span className="text-emerald-400 font-semibold">{calculateEngagement()}%</span>
                </div>
              )}

              <button
                onClick={handleSaveStats}
                disabled={isSaving}
                className="px-4 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 transition-colors disabled:opacity-50"
              >
                {isSaving ? 'Saving...' : 'Save Stats'}
              </button>
            </div>
          )}

          {/* Danger Zone */}
          <div className="bg-[#1a1f2e] rounded-2xl border border-gray-800/50 overflow-hidden">
            <button
              onClick={() => setShowDangerZone(!showDangerZone)}
              className="w-full p-4 flex items-center justify-between text-left hover:bg-gray-800/50 transition-colors"
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
              <div className="p-6 pt-2 border-t border-gray-700">
                <p className="text-gray-400 text-sm mb-4">
                  Permanently delete this post. This action cannot be undone.
                </p>
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                >
                  Delete Post
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Right Column - Preview */}
        <div className="w-[40%] sticky top-24 self-start space-y-4">
          {/* Phone Mockup */}
          <div className="bg-[#1a1f2e] rounded-2xl border border-gray-800/50 p-6">
            <h2 className="text-lg font-semibold text-white mb-4">Preview</h2>
            
            {/* Phone Frame */}
            <div 
              className="mx-auto bg-gray-950 rounded-[2rem] p-2 border border-gray-700 shadow-2xl"
              style={{ maxWidth: '280px' }}
            >
              {/* Screen */}
              <div 
                className="relative bg-gray-900 rounded-[1.5rem] overflow-hidden"
                style={{ aspectRatio: '9/16' }}
              >
                {/* Slide Content */}
                {activeSlide === 0 ? (
                  /* Slide 1 */
                  <div className="relative w-full h-full">
                    {post.slide_1_url ? (
                      <img
                        src={post.slide_1_url}
                        alt="Slide 1"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center bg-gray-800">
                        <span className="text-4xl mb-2">📷</span>
                        <p className="text-gray-500 text-sm">Not yet generated</p>
                      </div>
                    )}
                  </div>
                ) : activeSlide === 1 ? (
                  /* Slide 2 */
                  <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-b from-gray-800 to-gray-900 p-4">
                    {post.slide_2_url ? (
                      <img
                        src={post.slide_2_url}
                        alt="Slide 2"
                        className="w-full h-full object-contain"
                      />
                    ) : (
                      <>
                        <span className="text-4xl mb-2">💛</span>
                        <p className="text-gray-500 text-sm">Not yet generated</p>
                      </>
                    )}
                  </div>
                ) : (
                  /* Slide 3 */
                  <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-b from-purple-900/50 to-gray-900 p-4">
                    {post.slide_3_url ? (
                      <img
                        src={post.slide_3_url}
                        alt="Slide 3"
                        className="w-full h-full object-contain"
                      />
                    ) : (
                      <>
                        <span className="text-4xl mb-2">🎵</span>
                        <p className="text-gray-500 text-sm">No Slide 3</p>
                      </>
                    )}
                  </div>
                )}

                {/* Carousel Dots */}
                <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-1.5">
                  {(post.slide_3_url ? [0, 1, 2] : [0, 1]).map((idx) => (
                    <button
                      key={idx}
                      onClick={() => setActiveSlide(idx)}
                      className={`w-2 h-2 rounded-full transition-all ${
                        activeSlide === idx
                          ? 'bg-white w-4'
                          : 'bg-white/50 hover:bg-white/70'
                      }`}
                    />
                  ))}
                </div>
              </div>
            </div>

            {/* Slide Labels */}
            <div className="flex justify-center gap-3 mt-3 flex-wrap">
              <button
                onClick={() => setActiveSlide(0)}
                className={`text-xs ${activeSlide === 0 ? 'text-amber-400' : 'text-gray-500'}`}
              >
                Slide 1: Hook
              </button>
              <button
                onClick={() => setActiveSlide(1)}
                className={`text-xs ${activeSlide === 1 ? 'text-amber-400' : 'text-gray-500'}`}
              >
                Slide 2: HeartChime
              </button>
              {post.slide_3_url && (
                <button
                  onClick={() => setActiveSlide(2)}
                  className={`text-xs ${activeSlide === 2 ? 'text-purple-400' : 'text-gray-500'}`}
                >
                  Slide 3: Media
                </button>
              )}
            </div>
          </div>

          {/* Download Buttons */}
          {(post.slide_1_url || post.slide_2_url || post.slide_3_url) && (
            <div className="bg-[#1a1f2e] rounded-2xl border border-gray-800/50 p-4">
              <h3 className="text-sm font-medium text-white mb-3">Download Slides</h3>
              <div className="flex gap-2 flex-wrap">
                {post.slide_1_url && (
                  <a
                    href={post.slide_1_url}
                    download
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 py-2 px-3 bg-gray-700 text-white text-sm rounded-lg hover:bg-gray-600 transition-colors text-center"
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
                    className="flex-1 py-2 px-3 bg-gray-700 text-white text-sm rounded-lg hover:bg-gray-600 transition-colors text-center"
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
                    className="flex-1 py-2 px-3 bg-purple-700 text-white text-sm rounded-lg hover:bg-purple-600 transition-colors text-center"
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
            <p className="text-xs text-gray-500 mt-2">
              Regenerate the AI photo or card message for slide 2
            </p>
          </div>

          {/* Add Slide 3 Section */}
          {!post.slide_3_url && (
            <div className="bg-[#1a1f2e] rounded-2xl border border-purple-800/50 p-4">
              <h3 className="text-sm font-medium text-white mb-3">Add Slide 3 (Media)</h3>
              
              {/* Slide Type */}
              <div className="mb-3">
                <label className="block text-xs text-gray-400 mb-1.5">Type</label>
                <div className="flex gap-2">
                  <button
                    onClick={() => setSlide3Type('album_art')}
                    className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                      slide3Type === 'album_art'
                        ? 'bg-purple-500 text-white'
                        : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                    }`}
                  >
                    🎵 Album
                  </button>
                  <button
                    onClick={() => setSlide3Type('movie_poster')}
                    className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                      slide3Type === 'movie_poster'
                        ? 'bg-purple-500 text-white'
                        : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                    }`}
                  >
                    🎬 Movie
                  </button>
                </div>
              </div>

              {/* Image URL */}
              <div className="mb-3">
                <label className="block text-xs text-gray-400 mb-1.5">Image URL *</label>
                <input
                  type="text"
                  value={slide3ImageUrl}
                  onChange={(e) => setSlide3ImageUrl(e.target.value)}
                  placeholder="https://i.scdn.co/image/..."
                  className="w-full px-3 py-2 bg-[#0f1419] border border-gray-700 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                />
              </div>

              {/* Title */}
              <div className="mb-3">
                <label className="block text-xs text-gray-400 mb-1.5">
                  {slide3Type === 'album_art' ? 'Song/Album Title *' : 'Movie/Show Title *'}
                </label>
                <input
                  type="text"
                  value={slide3Title}
                  onChange={(e) => setSlide3Title(e.target.value)}
                  placeholder={slide3Type === 'album_art' ? 'Bohemian Rhapsody' : 'Home Alone'}
                  className="w-full px-3 py-2 bg-[#0f1419] border border-gray-700 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                />
              </div>

              {/* Artist/Year */}
              <div className="mb-4">
                <label className="block text-xs text-gray-400 mb-1.5">
                  {slide3Type === 'album_art' ? 'Artist' : 'Year'}
                </label>
                <input
                  type="text"
                  value={slide3Artist}
                  onChange={(e) => setSlide3Artist(e.target.value)}
                  placeholder={slide3Type === 'album_art' ? 'Queen' : '1990'}
                  className="w-full px-3 py-2 bg-[#0f1419] border border-gray-700 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                />
              </div>

              {/* Preview */}
              {slide3ImageUrl && (
                <div className="mb-4 flex items-center gap-3 p-2 bg-gray-800/50 rounded-lg">
                  <div className="w-12 h-12 rounded overflow-hidden bg-gray-700 flex-shrink-0">
                    <img
                      src={slide3ImageUrl}
                      alt="Preview"
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                      }}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm font-medium truncate">{slide3Title || 'Title'}</p>
                    <p className="text-gray-400 text-xs truncate">{slide3Artist || 'Artist/Year'}</p>
                  </div>
                </div>
              )}

              {/* Generate Button */}
              <button
                onClick={generateSlide3}
                disabled={generatingSlide3 || !slide3ImageUrl || !slide3Title}
                className="w-full py-2 px-4 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-800 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
              >
                {generatingSlide3 ? '🔄 Generating...' : '✨ Generate Slide 3'}
              </button>
              
              <p className="text-xs text-gray-500 mt-2">
                Add album art or movie poster as a third carousel slide
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

