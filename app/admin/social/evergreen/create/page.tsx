'use client';

import { useState, useEffect, useMemo } from 'react';
import { createClient } from '@supabase/supabase-js';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import HeartchimePreviewCard from '@/app/admin/components/HeartchimePreviewCard';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

interface Hook {
  id: string;
  text: string;
  category: string;
  text_style: 'snapchat' | 'clean';
  times_used: number;
}

interface SocialPost {
  id: string;
  status: string;
  scheduled_time: string | null;
  platform: string;
  post_type: string;
  slide_1_url: string | null;
  slide_2_url: string | null;
  hook_text: string;
  deceased_nickname: string;
  deceased_relationship: string;
  caption: string;
}

// Selfie generation types
type SelfieGender = 'male' | 'female';
type SelfieEthnicity = 'white' | 'black' | 'hispanic' | 'asian' | 'middle eastern' | 'south asian' | 'mixed';
type SelfieAngle = 'from below' | 'straight on' | 'from above' | 'side tilt';
type SelfieEmotion = 'neutral' | 'slight smile' | 'bittersweet' | 'sad' | 'hopeful' | 'tired' | 'peaceful';
type SelfieGaze = 'looking at camera' | 'looking away' | 'eyes down' | 'looking off to side';
type SelfieSetting = 'home' | 'car' | 'outside' | 'office';

type PostType = 'birthday' | 'passing_anniversary' | 'wedding_anniversary' | 'user_birthday';
type TextStyle = 'snapchat' | 'clean';

const POST_TYPES = [
  { value: 'birthday', label: 'Birthday', emoji: '🎂', description: "Deceased's birthday" },
  { value: 'passing_anniversary', label: 'Anniversary', emoji: '🕯️', description: 'Passing anniversary' },
  { value: 'wedding_anniversary', label: 'Wedding Anniversary', emoji: '💍', description: "Couple's anniversary" },
  { value: 'user_birthday', label: 'User Birthday', emoji: '🎁', description: "Recipient's birthday" },
] as const;

const RELATIONSHIPS = [
  'grandmother', 'grandfather', 
  'mother', 'father', 
  'aunt', 'uncle', 
  'sister', 'brother',
  'spouse',
  'son', 'daughter',
  'friend'
];

const TIME_PERIODS = [
  '1940s', '1950s', '1960s', '1970s', '1980s', '1990s', '2000s', '2010s', '2020s'
];

// Selfie option arrays
const ETHNICITIES: { value: SelfieEthnicity; label: string }[] = [
  { value: 'white', label: 'White' },
  { value: 'black', label: 'Black' },
  { value: 'hispanic', label: 'Hispanic' },
  { value: 'asian', label: 'Asian' },
  { value: 'middle eastern', label: 'Middle Eastern' },
  { value: 'south asian', label: 'South Asian' },
  { value: 'mixed', label: 'Mixed' },
];

const ANGLES: { value: SelfieAngle; label: string }[] = [
  { value: 'from below', label: 'From Below' },
  { value: 'straight on', label: 'Straight On' },
  { value: 'from above', label: 'From Above' },
  { value: 'side tilt', label: 'Side Tilt' },
];

const EMOTIONS: { value: SelfieEmotion; label: string }[] = [
  { value: 'neutral', label: 'Neutral' },
  { value: 'slight smile', label: 'Slight Smile' },
  { value: 'bittersweet', label: 'Bittersweet' },
  { value: 'sad', label: 'Sad' },
  { value: 'hopeful', label: 'Hopeful' },
  { value: 'tired', label: 'Tired' },
  { value: 'peaceful', label: 'Peaceful' },
];

const GAZES: { value: SelfieGaze; label: string }[] = [
  { value: 'looking at camera', label: 'At Camera' },
  { value: 'looking away', label: 'Looking Away' },
  { value: 'eyes down', label: 'Eyes Down' },
  { value: 'looking off to side', label: 'Off to Side' },
];

const SETTINGS: { value: SelfieSetting; label: string }[] = [
  { value: 'home', label: 'Home' },
  { value: 'car', label: 'Car' },
  { value: 'outside', label: 'Outside' },
  { value: 'office', label: 'Office' },
];

export default function CreateSocialPostPage() {
  const router = useRouter();
  
  // Data from database
  const [hooks, setHooks] = useState<Hook[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Selfie generation state
  const [selfieAge, setSelfieAge] = useState<number>(35);
  const [selfieGender, setSelfieGender] = useState<SelfieGender>('female');
  const [selfieEthnicity, setSelfieEthnicity] = useState<SelfieEthnicity>('white');
  const [selfieAngle, setSelfieAngle] = useState<SelfieAngle>('straight on');
  const [selfieEmotion, setSelfieEmotion] = useState<SelfieEmotion>('bittersweet');
  const [selfieGaze, setSelfieGaze] = useState<SelfieGaze>('looking at camera');
  const [selfieSetting, setSelfieSetting] = useState<SelfieSetting>('home');
  const [selfieUrl, setSelfieUrl] = useState<string | null>(null);
  const [isGeneratingSelfie, setIsGeneratingSelfie] = useState(false);
  
  // Form state
  const [postType, setPostType] = useState<PostType>('birthday');
  const [relationship, setRelationship] = useState<string>('');
  const [nickname, setNickname] = useState<string>('');
  const [timePeriod, setTimePeriod] = useState<string>('');
  const [textStyle, setTextStyle] = useState<TextStyle>('snapchat');
  const [selectedHookId, setSelectedHookId] = useState<string | null>(null);
  const [customHookText, setCustomHookText] = useState<string>('');
  const [spouseName, setSpouseName] = useState<string>('');
  
  // Generated post state
  const [generatedPost, setGeneratedPost] = useState<SocialPost | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isScheduling, setIsScheduling] = useState(false);
  const [isRegeneratingCaption, setIsRegeneratingCaption] = useState(false);
  
  // Preview state
  const [activeSlide, setActiveSlide] = useState(0);
  
  // Scheduling state
  const [caption, setCaption] = useState('');
  const [platforms, setPlatforms] = useState({ tiktok: true, instagram: true });
  const [scheduledTime, setScheduledTime] = useState('');
  
  // Toast state
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Fetch data on mount
  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const hooksRes = await supabase
        .from('social_hooks')
        .select('*')
        .order('times_used', { ascending: true });

      if (hooksRes.data) setHooks(hooksRes.data);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  // Filter hooks by style
  const filteredHooks = useMemo(() => {
    return hooks.filter(h => h.text_style === textStyle).slice(0, 6);
  }, [hooks, textStyle]);

  // Get active hook text
  const activeHookText = useMemo(() => {
    if (customHookText.trim()) return customHookText;
    const selectedHook = hooks.find(h => h.id === selectedHookId);
    return selectedHook?.text || '';
  }, [customHookText, selectedHookId, hooks]);

  // Check if form is valid for generation
  const canGenerate = useMemo(() => {
    const baseValid = selfieUrl && relationship && timePeriod && activeHookText;
    // Wedding anniversary requires spouse name
    if (postType === 'wedding_anniversary') {
      return baseValid && spouseName.trim();
    }
    return baseValid;
  }, [selfieUrl, relationship, timePeriod, activeHookText, postType, spouseName]);

  // Show toast
  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  // Generate selfie
  const handleGenerateSelfie = async () => {
    setIsGeneratingSelfie(true);
    try {
      const response = await fetch('/api/admin/social/generate-selfie', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          age: selfieAge,
          gender: selfieGender,
          ethnicity: selfieEthnicity,
          angle: selfieAngle,
          emotion: selfieEmotion,
          gaze: selfieGaze,
          setting: selfieSetting,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to generate selfie');
      }

      const data = await response.json();
      setSelfieUrl(data.selfieUrl);
      showToast('Selfie generated!', 'success');
    } catch (error) {
      console.error('Error generating selfie:', error);
      showToast(error instanceof Error ? error.message : 'Failed to generate selfie', 'error');
    } finally {
      setIsGeneratingSelfie(false);
    }
  };

  // Generate AI caption
  const generateAICaption = async (): Promise<string> => {
    try {
      const response = await fetch('/api/admin/generate-social-caption', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          postType,
          relationship,
          nickname: nickname || relationship,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to generate caption');
      }

      const data = await response.json();
      return data.caption;
    } catch (error) {
      console.error('Error generating AI caption:', error);
      // Fallback caption
      return `Missing ${nickname || relationship} today. Their memory lives on.`;
    }
  };

  // Regenerate caption with AI
  const handleRegenerateCaption = async () => {
    setIsRegeneratingCaption(true);
    try {
      const newCaption = await generateAICaption();
      setCaption(newCaption);
      
      // Also update in database if we have a generated post
      if (generatedPost) {
        await supabase
          .from('social_posts')
          .update({ caption: newCaption })
          .eq('id', generatedPost.id);
      }
      
      showToast('Caption regenerated!', 'success');
    } catch (error) {
      console.error('Error regenerating caption:', error);
      showToast('Failed to regenerate caption', 'error');
    } finally {
      setIsRegeneratingCaption(false);
    }
  };

  // Handle generation - calls the full generation endpoint
  const handleGenerate = async () => {
    if (!canGenerate || !selfieUrl) return;
    
    setIsGenerating(true);
    try {
      const platformValue = platforms.tiktok && platforms.instagram 
        ? 'both' 
        : platforms.tiktok 
          ? 'tiktok' 
          : 'instagram';

      // Call the full generation endpoint with selfieUrl
      const response = await fetch('/api/admin/social/generate-post', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            selfieUrl,
            postType,
            relationship,
            nickname: nickname || relationship,
            hookText: activeHookText,
            hookStyle: textStyle,
            platform: platformValue,
            timePeriod,
            spouseName: postType === 'wedding_anniversary' ? spouseName : undefined,
          }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to generate post');
      }

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Failed to generate post');
      }

      // Update hook usage count if using a preset hook
      if (selectedHookId) {
        const selectedHook = hooks.find(h => h.id === selectedHookId);
        if (selectedHook) {
          await supabase
            .from('social_hooks')
            .update({ times_used: (selectedHook.times_used || 0) + 1 })
            .eq('id', selectedHookId);
        }
      }

      showToast('Post generated successfully! Redirecting...', 'success');

      // Redirect to the post detail page
      setTimeout(() => {
        router.push(`/admin/social/evergreen/${data.post.id}`);
      }, 1000);

    } catch (error) {
      console.error('Error generating post:', error);
      showToast(error instanceof Error ? error.message : 'Failed to generate post', 'error');
    } finally {
      setIsGenerating(false);
    }
  };

  // Handle save as draft
  const handleSaveDraft = async () => {
    if (!generatedPost) return;
    
    setIsScheduling(true);
    try {
      const platformValue = platforms.tiktok && platforms.instagram 
        ? 'both' 
        : platforms.tiktok 
          ? 'tiktok' 
          : 'instagram';

      const { error } = await supabase
        .from('social_posts')
        .update({
          caption,
          platform: platformValue,
          status: 'draft',
          scheduled_time: null,
        })
        .eq('id', generatedPost.id);

      if (error) throw error;

      showToast('Draft saved!', 'success');
    } catch (error) {
      console.error('Error saving draft:', error);
      showToast('Failed to save draft', 'error');
    } finally {
      setIsScheduling(false);
    }
  };

  // Handle schedule
  const handleSchedule = async () => {
    if (!generatedPost || !scheduledTime) return;
    
    setIsScheduling(true);
    try {
      const platformValue = platforms.tiktok && platforms.instagram 
        ? 'both' 
        : platforms.tiktok 
          ? 'tiktok' 
          : 'instagram';

      const { error } = await supabase
        .from('social_posts')
        .update({
          caption,
          platform: platformValue,
          status: 'pending',
          scheduled_time: scheduledTime,
        })
        .eq('id', generatedPost.id);

      if (error) throw error;

      showToast('Post scheduled!', 'success');
      setTimeout(() => router.push('/admin/social/evergreen'), 1000);
    } catch (error) {
      console.error('Error scheduling post:', error);
      showToast('Failed to schedule post', 'error');
    } finally {
      setIsScheduling(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 p-6 flex items-center justify-center">
        <div className="text-gray-400">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 p-6">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg ${
          toast.type === 'success' ? 'bg-green-600' : 'bg-red-600'
        } text-white font-medium`}>
          {toast.message}
        </div>
      )}

      {/* Header */}
      <div className="mb-6">
        <Link 
          href="/admin/social/evergreen"
          className="text-gray-400 hover:text-white text-sm flex items-center gap-1 mb-2"
        >
          ← Back to Evergreen
        </Link>
        <h1 className="text-2xl font-bold text-white">Create Evergreen Post</h1>
        <p className="text-gray-400 mt-1">Create a 2-slide carousel for TikTok/Instagram</p>
      </div>

      {/* Two-column layout */}
      <div className="flex gap-6">
        {/* Left Column - Form */}
        <div className="flex-1 max-w-[60%] space-y-6">
          {/* Section A: Generate Selfie */}
          <div className="bg-gray-800 rounded-xl p-6">
            <h2 className="text-lg font-semibold text-white mb-4">Generate Selfie (Slide 1)</h2>
            
            <div className="grid grid-cols-4 gap-4 mb-4">
              {/* Age */}
              <div>
                <label className="block text-sm text-gray-400 mb-2">Age</label>
                <input
                  type="number"
                  min={18}
                  max={80}
                  value={selfieAge}
                  onChange={(e) => setSelfieAge(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-orange-500"
                />
              </div>

              {/* Gender */}
              <div>
                <label className="block text-sm text-gray-400 mb-2">Gender</label>
                <select
                  value={selfieGender}
                  onChange={(e) => setSelfieGender(e.target.value as SelfieGender)}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-orange-500"
                >
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                </select>
              </div>

              {/* Ethnicity */}
              <div>
                <label className="block text-sm text-gray-400 mb-2">Ethnicity</label>
                <select
                  value={selfieEthnicity}
                  onChange={(e) => setSelfieEthnicity(e.target.value as SelfieEthnicity)}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-orange-500"
                >
                  {ETHNICITIES.map((eth) => (
                    <option key={eth.value} value={eth.value}>{eth.label}</option>
                  ))}
                </select>
              </div>

              {/* Angle */}
              <div>
                <label className="block text-sm text-gray-400 mb-2">Angle</label>
                <select
                  value={selfieAngle}
                  onChange={(e) => setSelfieAngle(e.target.value as SelfieAngle)}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-orange-500"
                >
                  {ANGLES.map((ang) => (
                    <option key={ang.value} value={ang.value}>{ang.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4 mb-4">
              {/* Emotion */}
              <div>
                <label className="block text-sm text-gray-400 mb-2">Emotion</label>
                <select
                  value={selfieEmotion}
                  onChange={(e) => setSelfieEmotion(e.target.value as SelfieEmotion)}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-orange-500"
                >
                  {EMOTIONS.map((emo) => (
                    <option key={emo.value} value={emo.value}>{emo.label}</option>
                  ))}
                </select>
              </div>

              {/* Gaze */}
              <div>
                <label className="block text-sm text-gray-400 mb-2">Gaze</label>
                <select
                  value={selfieGaze}
                  onChange={(e) => setSelfieGaze(e.target.value as SelfieGaze)}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-orange-500"
                >
                  {GAZES.map((gaz) => (
                    <option key={gaz.value} value={gaz.value}>{gaz.label}</option>
                  ))}
                </select>
              </div>

              {/* Setting */}
              <div>
                <label className="block text-sm text-gray-400 mb-2">Setting</label>
                <select
                  value={selfieSetting}
                  onChange={(e) => setSelfieSetting(e.target.value as SelfieSetting)}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-orange-500"
                >
                  {SETTINGS.map((set) => (
                    <option key={set.value} value={set.value}>{set.label}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Generate / Regenerate Button */}
            <button
              onClick={handleGenerateSelfie}
              disabled={isGeneratingSelfie}
              className={`w-full py-3 rounded-lg font-semibold transition-all ${
                !isGeneratingSelfie
                  ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white hover:from-purple-600 hover:to-pink-600'
                  : 'bg-gray-700 text-gray-500 cursor-not-allowed'
              }`}
            >
              {isGeneratingSelfie ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Generating Selfie...
                </span>
              ) : selfieUrl ? (
                '🔄 Regenerate Selfie'
              ) : (
                '✨ Generate Selfie'
              )}
            </button>

            {selfieUrl && (
              <p className="text-center text-green-400 text-sm mt-2">
                ✓ Selfie generated! Preview shown on the right.
              </p>
            )}
          </div>

          {/* Section B: Post Type */}
          <div className="bg-gray-800 rounded-xl p-6">
            <h2 className="text-lg font-semibold text-white mb-4">Post Type</h2>
            <div className="grid grid-cols-2 gap-3">
              {POST_TYPES.map((type) => (
                <button
                  key={type.value}
                  onClick={() => setPostType(type.value)}
                  className={`py-3 px-4 rounded-lg border-2 transition-all text-left ${
                    postType === type.value
                      ? 'border-orange-500 bg-orange-500/10 text-white'
                      : 'border-gray-600 bg-gray-700 text-gray-300 hover:border-gray-500'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-xl">{type.emoji}</span>
                    <span className="font-medium">{type.label}</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1 ml-7">{type.description}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Section C: Deceased Details */}
          <div className="bg-gray-800 rounded-xl p-6">
            <h2 className="text-lg font-semibold text-white mb-4">Deceased Details</h2>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm text-gray-400 mb-2">Relationship *</label>
                <select
                  value={relationship}
                  onChange={(e) => setRelationship(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-orange-500"
                >
                  <option value="">Select...</option>
                  {RELATIONSHIPS.map((rel) => (
                    <option key={rel} value={rel}>
                      {rel.charAt(0).toUpperCase() + rel.slice(1)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-2">Nickname</label>
                <input
                  type="text"
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  placeholder="e.g., Nanny, Papa"
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-orange-500"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-2">Time Period *</label>
                <select
                  value={timePeriod}
                  onChange={(e) => setTimePeriod(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-orange-500"
                >
                  <option value="">Select...</option>
                  {TIME_PERIODS.map((period) => (
                    <option key={period} value={period}>{period}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Spouse Name - only for wedding anniversary */}
            {postType === 'wedding_anniversary' && (
              <div className="mt-4">
                <label className="block text-sm text-gray-400 mb-2">Spouse Name *</label>
                <input
                  type="text"
                  value={spouseName}
                  onChange={(e) => setSpouseName(e.target.value)}
                  placeholder="e.g., Earl, Dorothy"
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-orange-500"
                />
                <p className="text-xs text-gray-500 mt-1">The spouse of the deceased person</p>
              </div>
            )}
          </div>

          {/* Section D: Hook Text */}
          <div className="bg-gray-800 rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-white">Hook Text</h2>
              <Link 
                href="/admin/social/evergreen/hooks"
                className="text-sm text-orange-400 hover:text-orange-300"
              >
                Manage Hooks →
              </Link>
            </div>

            {/* Style Toggle */}
            <div className="flex items-center gap-2 mb-4">
              <span className="text-sm text-gray-400">Style:</span>
              <div className="flex rounded-lg overflow-hidden border border-gray-600">
                <button
                  onClick={() => {
                    setTextStyle('snapchat');
                    setSelectedHookId(null);
                  }}
                  className={`px-4 py-1.5 text-sm font-medium transition-colors ${
                    textStyle === 'snapchat'
                      ? 'bg-pink-500 text-white'
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  }`}
                >
                  Snapchat
                </button>
                <button
                  onClick={() => {
                    setTextStyle('clean');
                    setSelectedHookId(null);
                  }}
                  className={`px-4 py-1.5 text-sm font-medium transition-colors ${
                    textStyle === 'clean'
                      ? 'bg-slate-500 text-white'
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  }`}
                >
                  Clean
                </button>
              </div>
            </div>

            {/* Quick Picks */}
            {filteredHooks.length > 0 && (
              <div className="mb-4">
                <p className="text-sm text-gray-400 mb-2">Quick picks:</p>
                <div className="flex flex-wrap gap-2">
                  {filteredHooks.map((hook) => (
                    <button
                      key={hook.id}
                      onClick={() => {
                        setSelectedHookId(hook.id);
                        setCustomHookText('');
                      }}
                      className={`px-3 py-1.5 rounded-full text-sm transition-all ${
                        selectedHookId === hook.id
                          ? 'bg-orange-500 text-white'
                          : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                      }`}
                    >
                      {hook.text}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Custom Input */}
            <div>
              <label className="block text-sm text-gray-400 mb-2">
                Or enter custom text:
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={customHookText}
                  onChange={(e) => {
                    setCustomHookText(e.target.value);
                    if (e.target.value) setSelectedHookId(null);
                  }}
                  placeholder="miss u 💔"
                  className="w-full px-3 py-2 pr-10 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-orange-500"
                />
                <div className="absolute right-2 top-1/2 -translate-y-1/2">
                  <details className="relative">
                    <summary className="cursor-pointer list-none p-1 hover:bg-gray-600 rounded transition-colors" title="Add emoji">
                      <span className="text-lg">😊</span>
                    </summary>
                    <div className="absolute right-0 top-full mt-1 bg-gray-800 border border-gray-600 rounded-lg p-2 shadow-xl z-10 w-64">
                      <p className="text-xs text-gray-400 mb-2">Click to add:</p>
                      <div className="flex flex-wrap gap-1">
                        {['💔', '😢', '🥺', '🥲', '💕', '🙏', '✨', '💫', '🕊️', '🌹', '💐', '🦋', '⭐', '💛', '🧡', '❤️', '💜', '🤍', '😭', '🥹', '💗', '🌸', '🌺', '🕯️', '👼', '😊', '🥰', '😍', '🤗', '😇', '🫶', '💖', '💝', '🌟', '🌈', '☀️', '🎉', '💃', '🙌', '👏', '😌', '🤩', '💯'].map(emoji => (
                          <button
                            key={emoji}
                            type="button"
                            onClick={() => {
                              setCustomHookText(prev => prev + emoji);
                              setSelectedHookId(null);
                            }}
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
          </div>

          {/* Section E: Generate Button */}
          <div className="bg-gray-800 rounded-xl p-6">
            <button
              onClick={handleGenerate}
              disabled={!canGenerate || isGenerating}
              className={`w-full py-4 rounded-xl font-semibold text-lg transition-all ${
                canGenerate && !isGenerating
                  ? 'bg-gradient-to-r from-orange-500 to-orange-600 text-white hover:from-orange-600 hover:to-orange-700 shadow-lg shadow-orange-500/25'
                  : 'bg-gray-700 text-gray-500 cursor-not-allowed'
              }`}
            >
              {isGenerating ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Generating...
                </span>
              ) : (
                '✨ Generate Post'
              )}
            </button>
            <p className="text-center text-gray-500 text-sm mt-3">
              This will use AI to generate the vintage photo and caption
            </p>
            {!canGenerate && (
              <p className="text-center text-orange-400/70 text-xs mt-2">
                Fill in: generate selfie, relationship, time period, and hook text
              </p>
            )}
          </div>
        </div>

        {/* Right Column - Preview */}
        <div className="w-[40%] sticky top-24 self-start">
          {/* Phone Mockup */}
          <div className="bg-gray-800 rounded-xl p-6">
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
                    {selfieUrl ? (
                      <img
                        src={selfieUrl}
                        alt="Generated Selfie"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-gray-800">
                        <p className="text-gray-500 text-sm text-center px-4">Generate a selfie to see preview</p>
                      </div>
                    )}
                    
                    {/* Hook Text Overlay */}
                    {activeHookText && (
                      <div 
                        className={`absolute inset-0 flex items-center justify-center p-4 ${
                          textStyle === 'snapchat' ? '' : ''
                        }`}
                      >
                        {textStyle === 'snapchat' ? (
                          <p 
                            className="text-white text-xl font-bold text-center"
                            style={{
                              textShadow: '-2px -2px 0 #000, 2px -2px 0 #000, -2px 2px 0 #000, 2px 2px 0 #000',
                              transform: 'rotate(-3deg)',
                              fontFamily: 'Arial, sans-serif'
                            }}
                          >
                            {activeHookText}
                          </p>
                        ) : (
                          <div className="bg-black/50 px-4 py-2 rounded-lg">
                            <p className="text-white text-lg font-semibold text-center uppercase tracking-wider">
                              {activeHookText}
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  /* Slide 2 - HeartChime Card */
                  <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-b from-gray-800 to-gray-900 p-2 overflow-hidden">
                    <div style={{ transform: 'scale(0.85)', transformOrigin: 'center' }}>
                      <HeartchimePreviewCard
                        photo={{ url: selfieUrl || '' }}
                        message={caption || `Missing ${nickname || relationship} today. Their memory lives on.`}
                        socialMode={true}
                      />
                    </div>
                  </div>
                )}

                {/* Carousel Dots */}
                <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-1.5">
                  {[0, 1].map((idx) => (
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
            <div className="flex justify-center gap-4 mt-3">
              <button
                onClick={() => setActiveSlide(0)}
                className={`text-xs ${activeSlide === 0 ? 'text-orange-400' : 'text-gray-500'}`}
              >
                Slide 1: Selfie
              </button>
              <button
                onClick={() => setActiveSlide(1)}
                className={`text-xs ${activeSlide === 1 ? 'text-orange-400' : 'text-gray-500'}`}
              >
                Slide 2: HeartChime
              </button>
            </div>
          </div>

          {/* Scheduling Section - Only shown after generation */}
          {generatedPost && (
            <div className="bg-gray-800 rounded-xl p-6 mt-4">
              <h2 className="text-lg font-semibold text-white mb-4">Schedule Post</h2>
              
              {/* Caption */}
              <div className="mb-4">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm text-gray-400">Caption</label>
                  <button
                    onClick={handleRegenerateCaption}
                    disabled={isRegeneratingCaption}
                    className="text-xs text-orange-400 hover:text-orange-300 disabled:text-gray-500 disabled:cursor-not-allowed flex items-center gap-1"
                  >
                    {isRegeneratingCaption ? (
                      <>
                        <svg className="animate-spin w-3 h-3" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        Regenerating...
                      </>
                    ) : (
                      <>
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                        Regenerate with AI
                      </>
                    )}
                  </button>
                </div>
                <textarea
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-orange-500 resize-none text-sm"
                />
              </div>

              {/* Platform */}
              <div className="mb-4">
                <label className="block text-sm text-gray-400 mb-2">Platform</label>
                <div className="flex gap-3">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={platforms.tiktok}
                      onChange={(e) => setPlatforms(p => ({ ...p, tiktok: e.target.checked }))}
                      className="w-4 h-4 rounded bg-gray-700 border-gray-600 text-orange-500 focus:ring-orange-500 focus:ring-offset-gray-800"
                    />
                    <span className="text-white text-sm">TikTok</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={platforms.instagram}
                      onChange={(e) => setPlatforms(p => ({ ...p, instagram: e.target.checked }))}
                      className="w-4 h-4 rounded bg-gray-700 border-gray-600 text-orange-500 focus:ring-orange-500 focus:ring-offset-gray-800"
                    />
                    <span className="text-white text-sm">Instagram</span>
                  </label>
                </div>
              </div>

              {/* Schedule Time */}
              <div className="mb-4">
                <label className="block text-sm text-gray-400 mb-2">Schedule For</label>
                <input
                  type="datetime-local"
                  value={scheduledTime}
                  onChange={(e) => setScheduledTime(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-orange-500"
                />
              </div>

              {/* Buttons */}
              <div className="flex gap-3">
                <button
                  onClick={handleSaveDraft}
                  disabled={isScheduling}
                  className="flex-1 py-2.5 px-4 rounded-lg bg-gray-700 text-white font-medium hover:bg-gray-600 transition-colors disabled:opacity-50"
                >
                  Save as Draft
                </button>
                <button
                  onClick={handleSchedule}
                  disabled={isScheduling || !scheduledTime}
                  className={`flex-1 py-2.5 px-4 rounded-lg font-medium transition-all ${
                    scheduledTime && !isScheduling
                      ? 'bg-gradient-to-r from-orange-500 to-orange-600 text-white hover:from-orange-600 hover:to-orange-700'
                      : 'bg-gray-700 text-gray-500 cursor-not-allowed'
                  }`}
                >
                  {isScheduling ? 'Saving...' : 'Schedule Post'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
