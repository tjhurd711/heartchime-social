'use client';

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import Link from 'next/link';
import { useParams } from 'next/navigation';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

interface SocialPost {
  id: string;
  slide_1_url: string | null;
  slide_2_url: string | null;
  slide_bundle?: unknown;
}

interface SlidePreviewItem {
  order: number;
  url: string;
  slide_type?: string;
}

interface SendToDeviceResult {
  imported_count?: number;
  note_created?: boolean;
}

function buildPreviewSlides(post: SocialPost | null): SlidePreviewItem[] {
  if (!post) return [];

  const slideBundle = Array.isArray(post.slide_bundle)
    ? (post.slide_bundle as Array<{ order?: number; url?: string; image_url?: string; slide_type?: string }>)
    : [];
  const bundleSlides: SlidePreviewItem[] = slideBundle
    .map((slide, index) => ({
      order: typeof slide.order === 'number' ? slide.order : index + 1,
      url: slide.url || slide.image_url || '',
      slide_type: slide.slide_type,
    }))
    .filter((slide) => slide.url);

  if (bundleSlides.length > 0) {
    return bundleSlides.sort((a, b) => a.order - b.order);
  }

  return [
    post.slide_1_url ? { order: 1, url: post.slide_1_url } : null,
    post.slide_2_url ? { order: 2, url: post.slide_2_url } : null,
  ].filter((slide): slide is SlidePreviewItem => !!slide);
}

export default function DeliveryPage() {
  const params = useParams<{ id: string }>();
  const postId = params.id;

  const [post, setPost] = useState<SocialPost | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [activeSlide, setActiveSlide] = useState(0);
  const [editPromptBySlideOrder, setEditPromptBySlideOrder] = useState<Record<number, string>>({});
  const [isEditingSlide, setIsEditingSlide] = useState(false);
  const [isSendingToDevice, setIsSendingToDevice] = useState(false);
  const [sendToDeviceResult, setSendToDeviceResult] = useState<SendToDeviceResult | null>(null);
  const [regeneratingPhoto, setRegeneratingPhoto] = useState(false);
  const [regeneratingCaption, setRegeneratingCaption] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const previewSlides = useMemo(() => buildPreviewSlides(post), [post]);
  const safeActiveSlide = Math.max(0, Math.min(activeSlide, Math.max(0, previewSlides.length - 1)));
  const selectedSlide = previewSlides[safeActiveSlide] || null;

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const fetchPost = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('social_posts')
        .select('id, slide_1_url, slide_2_url, slide_bundle')
        .eq('id', postId)
        .single();

      if (error || !data) {
        setNotFound(true);
        return;
      }

      setPost(data as SocialPost);
    } catch {
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchPost();
  }, [postId]);

  useEffect(() => {
    if (activeSlide > Math.max(0, previewSlides.length - 1)) {
      setActiveSlide(0);
    }
  }, [activeSlide, previewSlides.length]);

  const handleEditSlideImage = async () => {
    if (!post || !selectedSlide) return;
    const prompt = (editPromptBySlideOrder[selectedSlide.order] || '').trim();
    if (!prompt) {
      showToast('Add an edit instruction first', 'error');
      return;
    }

    setIsEditingSlide(true);
    try {
      const response = await fetch('/api/admin/social/edit-slide', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          post_id: post.id,
          slide_order: selectedSlide.order,
          prompt,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || 'Failed to edit slide');
      }

      setSendToDeviceResult(null);
      setEditPromptBySlideOrder((prev) => ({ ...prev, [selectedSlide.order]: '' }));
      await fetchPost();
      showToast(`Slide ${selectedSlide.order} updated`, 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Failed to edit slide', 'error');
    } finally {
      setIsEditingSlide(false);
    }
  };

  const handleSendToDevice = async () => {
    if (!post) return;
    setIsSendingToDevice(true);
    setSendToDeviceResult(null);
    try {
      const res = await fetch('/api/admin/social/send-to-device', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ post_id: post.id }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error || 'Failed to send to iPhone');
      }

      setSendToDeviceResult({
        imported_count: data.imported_count,
        note_created: data.note_created,
      });
      showToast('Sent to iPhone!', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Failed to send to iPhone', 'error');
    } finally {
      setIsSendingToDevice(false);
    }
  };

  const regenerateSlide2 = async (regenerateType: 'photo' | 'caption') => {
    if (!post) return;

    if (regenerateType === 'photo') setRegeneratingPhoto(true);
    if (regenerateType === 'caption') setRegeneratingCaption(true);
    try {
      const res = await fetch('/api/admin/social/regenerate-slide2', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postId: post.id, regenerateType }),
      });
      const data = await res.json();

      if (!res.ok || !data?.success) {
        throw new Error(data?.error || `Failed to regenerate ${regenerateType}`);
      }

      await fetchPost();
      showToast(`Slide 2 ${regenerateType} regenerated`, 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : `Failed to regenerate ${regenerateType}`, 'error');
    } finally {
      if (regenerateType === 'photo') setRegeneratingPhoto(false);
      if (regenerateType === 'caption') setRegeneratingCaption(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 p-6 flex items-center justify-center">
        <div className="text-gray-400">Loading preview...</div>
      </div>
    );
  }

  if (notFound || !post) {
    return (
      <div className="min-h-screen bg-gray-900 p-6 flex flex-col items-center justify-center">
        <div className="text-6xl mb-4">😕</div>
        <h1 className="text-2xl font-bold text-white mb-2">Post Not Found</h1>
        <p className="text-gray-400 mb-6">This post does not exist or has been deleted.</p>
        <Link
          href="/admin/social/evergreen"
          className="px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors"
        >
          Back to Evergreen
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 p-6">
      {toast && (
        <div
          className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg ${
            toast.type === 'success' ? 'bg-green-600' : 'bg-red-600'
          } text-white font-medium`}
        >
          {toast.message}
        </div>
      )}

      <div className="max-w-xl mx-auto space-y-4">
        <div className="bg-gray-800 rounded-xl p-6">
          <Link
            href="/admin/social/evergreen"
            className="text-gray-400 hover:text-white text-sm flex items-center gap-1 mb-3"
          >
            ← Back to Evergreen
          </Link>
          <h1 className="text-xl font-semibold text-white">Delivery Preview</h1>
          <p className="text-sm text-gray-400 mt-1">Finalize slides, then send to iPhone.</p>
        </div>

        <div className="bg-gray-800 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Preview</h2>
          <div className="mx-auto bg-gray-950 rounded-[2rem] p-2 border border-gray-700 shadow-2xl" style={{ maxWidth: '280px' }}>
            <div className="relative bg-gray-900 rounded-[1.5rem] overflow-hidden" style={{ aspectRatio: '9/16' }}>
              {selectedSlide?.url ? (
                <img src={selectedSlide.url} alt={`Slide ${selectedSlide.order}`} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-gray-500 text-sm">No preview image</div>
              )}
              <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-1.5">
                {previewSlides.map((slide, idx) => (
                  <button
                    key={`${slide.order}-${idx}`}
                    onClick={() => setActiveSlide(idx)}
                    className={`w-2 h-2 rounded-full transition-all ${safeActiveSlide === idx ? 'bg-white w-4' : 'bg-white/50 hover:bg-white/70'}`}
                  />
                ))}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap justify-center gap-2 mt-3">
            {previewSlides.map((slide, idx) => (
              <button
                key={`label-${slide.order}-${idx}`}
                onClick={() => setActiveSlide(idx)}
                className={`text-xs px-2 py-1 rounded ${safeActiveSlide === idx ? 'text-orange-300 bg-orange-500/10' : 'text-gray-500'}`}
              >
                Slide {slide.order}
              </button>
            ))}
          </div>
        </div>

        {selectedSlide && (
          <div className="bg-gray-800 rounded-xl p-4">
            <h3 className="text-sm font-medium text-white mb-2">Edit Slide {selectedSlide.order} (GPT Image 2)</h3>
            <p className="text-xs text-gray-400 mb-3">
              Apply a direct edit before sending to iPhone. This replaces the slide image used in delivery.
            </p>
            <textarea
              value={editPromptBySlideOrder[selectedSlide.order] || ''}
              onChange={(event) => {
                const nextPrompt = event.target.value;
                setEditPromptBySlideOrder((prev) => ({ ...prev, [selectedSlide.order]: nextPrompt }));
              }}
              rows={3}
              placeholder="e.g. keep the same composition, change outfit to black, make expression more somber, add an urn on the shelf"
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-orange-500 resize-none"
            />
            <button
              onClick={handleEditSlideImage}
              disabled={isEditingSlide || !(editPromptBySlideOrder[selectedSlide.order] || '').trim()}
              className="mt-3 w-full py-2 px-3 bg-violet-600 text-white text-sm rounded-lg hover:bg-violet-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isEditingSlide ? 'Editing...' : `Edit Slide ${selectedSlide.order}`}
            </button>
          </div>
        )}

        {previewSlides.length > 0 && (
          <div className="bg-gray-800 rounded-xl p-4">
            <h3 className="text-sm font-medium text-white mb-3">Download Slides</h3>
            <div className="flex flex-wrap gap-2">
              {previewSlides.map((slide) => (
                <a
                  key={`download-${slide.order}-${slide.url}`}
                  href={slide.url}
                  download
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 py-2 px-3 bg-gray-700 text-white text-sm rounded-lg hover:bg-gray-600 transition-colors text-center"
                >
                  📥 Slide {slide.order}
                </a>
              ))}
            </div>
          </div>
        )}

        {previewSlides.length > 0 && (
          <div className="bg-gray-800 rounded-xl p-4">
            <h3 className="text-sm font-medium text-white mb-2">Send to iPhone</h3>
            <p className="text-xs text-gray-400 mb-3">
              Push the generated photos and Note overlay text to the Mac server.
            </p>
            <button
              onClick={handleSendToDevice}
              disabled={isSendingToDevice}
              className="w-full py-2 px-3 bg-emerald-600 text-white text-sm rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSendingToDevice ? 'Sending...' : 'Send to iPhone'}
            </button>
            {sendToDeviceResult && (
              <div className="mt-3 rounded-lg bg-gray-900/80 border border-gray-700 p-3 text-xs text-gray-300 space-y-1">
                <p>
                  Imported: <span className="text-white font-medium">{sendToDeviceResult.imported_count ?? 'unknown'}</span>
                </p>
                <p>
                  Note created:{' '}
                  <span className="text-white font-medium">
                    {sendToDeviceResult.note_created === undefined
                      ? 'unknown'
                      : sendToDeviceResult.note_created
                        ? 'yes'
                        : 'no'}
                  </span>
                </p>
              </div>
            )}
          </div>
        )}

        <div className="bg-gray-800 rounded-xl p-4">
          <h3 className="text-sm font-medium text-white mb-3">Regenerate Slide 2</h3>
          <div className="flex gap-2">
            <button
              onClick={() => void regenerateSlide2('photo')}
              disabled={regeneratingPhoto}
              className="flex-1 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-800 disabled:cursor-not-allowed text-white py-2 px-3 text-sm rounded-lg transition-colors"
            >
              {regeneratingPhoto ? '🔄 Generating...' : '🖼️ New Photo'}
            </button>
            <button
              onClick={() => void regenerateSlide2('caption')}
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
  );
}
