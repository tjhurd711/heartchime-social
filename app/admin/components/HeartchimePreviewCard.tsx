'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'

// ===========================================
// INLINE SVG ICONS
// ===========================================

const ChevronLeftIcon = () => (
  <svg className="w-5 h-5 text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
  </svg>
)

const ChevronRightIcon = () => (
  <svg className="w-5 h-5 text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
  </svg>
)

// ===========================================
// TYPES
// ===========================================

interface Media {
  type: 'song' | 'movie' | 'album' | 'celebrity'
  name: string
  imageUrl?: string
  previewUrl?: string
}

interface Pulse {
  enabled: boolean
  question: string
}

interface HeartchimePreviewCardProps {
  photo: { url: string; id?: string }
  message: string
  media?: Media
  pulse?: Pulse
  className?: string
  isEditing?: boolean
  onMessageChange?: (message: string) => void
  onPulseQuestionChange?: (question: string) => void
  onPulseToggle?: (enabled: boolean) => void
  onRegenerate?: () => void
  isRegenerating?: boolean
  coverImageUrl?: string // External cover image URL (from Google search)
  audioUrl?: string // Spotify preview URL
  videoUrl?: string // YouTube video URL
  // Social card mode - simplified layout matching Framer design
  socialMode?: boolean
}

// ===========================================
// COLORS (matching Framer design exactly)
// ===========================================

const goldColor = "#FFC300"
const orangeColor = "#FF9800"
const navyBlue = "#1A365D"

// ===========================================
// COMPONENT
// ===========================================

export default function HeartchimePreviewCard({
  photo,
  message,
  media,
  pulse,
  className = '',
  isEditing = false,
  onMessageChange,
  onPulseQuestionChange,
  onPulseToggle,
  onRegenerate,
  isRegenerating = false,
  coverImageUrl,
  audioUrl,
  videoUrl,
  socialMode = false,
}: HeartchimePreviewCardProps) {
  const [currentSlide, setCurrentSlide] = useState(0)
  const [isVideoPlaying, setIsVideoPlaying] = useState(false)

  // Load Raleway font
  useEffect(() => {
    if (typeof document !== "undefined") {
      const existing = document.querySelector('link[href*="Raleway"]')
      if (!existing) {
        const fontLink = document.createElement("link")
        fontLink.href = "https://fonts.googleapis.com/css2?family=Raleway:wght@400;500;600;700&display=swap"
        fontLink.rel = "stylesheet"
        document.head.appendChild(fontLink)
      }
    }
  }, [])

  // ===========================================
  // SOCIAL MODE - Simplified Framer-style card
  // ===========================================
  if (socialMode) {
    return (
      <div
        className={className}
        style={{
          width: 300,
          padding: 20,
          borderRadius: 24,
          background: `linear-gradient(135deg, ${goldColor} 0%, ${orangeColor} 100%)`,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 16,
          boxShadow: `0 0 30px 5px rgba(255, 195, 0, 0.4)`,
          fontFamily: "'Raleway', sans-serif",
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
          <Image
            src="/heartchime_icon.png"
            alt="Heartchime"
            width={50}
            height={40}
            style={{ width: 50, height: 40, objectFit: 'contain' }}
          />
          <span
            style={{
              fontFamily: "'Raleway', sans-serif",
              fontWeight: 600,
              fontSize: 25,
              color: navyBlue,
            }}
          >
            Heartchime
          </span>
        </div>

        {/* Photo */}
        {photo.url ? (
          <img
            src={photo.url}
            alt="Memory"
            style={{
              width: '100%',
              height: 'auto',
              minHeight: 150,
              maxHeight: 350,
              objectFit: 'cover',
              display: 'block',
              borderRadius: 16,
            }}
          />
        ) : (
          <div
            style={{
              width: '100%',
              height: 200,
              borderRadius: 16,
              background: 'rgba(26, 54, 93, 0.2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <span style={{ fontSize: 48, opacity: 0.4 }}>📷</span>
          </div>
        )}

        {/* Message */}
        <p
          style={{
            fontFamily: "'Raleway', sans-serif",
            fontSize: 18,
            fontWeight: 500,
            color: navyBlue,
            textAlign: 'center',
            lineHeight: 1.5,
            margin: 0,
          }}
        >
          {message || <span style={{ opacity: 0.5, fontStyle: 'italic' }}>No message yet...</span>}
        </p>
      </div>
    )
  }

  // Build slides array
  const slides: { 
    type: 'photo' | 'audio' | 'cover' | 'video'
    url: string
    label?: string
    videoId?: string
    isShort?: boolean
    originalUrl?: string
  }[] = []
  
  if (photo.url) {
    slides.push({ type: 'photo', url: photo.url, label: 'Photo' })
  }
  
  // Add Spotify embed as a slide (after photo) with autoplay
  // Debug: Log what audioUrl we received
  if (audioUrl) {
    console.log('[HeartchimePreviewCard] audioUrl received:', audioUrl)
    console.log('[HeartchimePreviewCard] includes spotify.com/embed:', audioUrl.includes('spotify.com/embed'))
  }
  
  if (audioUrl?.includes('spotify.com/embed')) {
    const autoplayUrl = audioUrl.includes('?') 
      ? `${audioUrl}&autoplay=1` 
      : `${audioUrl}?autoplay=1`
    slides.push({ type: 'audio', url: autoplayUrl, label: 'Audio' })
    console.log('[HeartchimePreviewCard] Added audio slide with URL:', autoplayUrl)
  }
  
  if (coverImageUrl) {
    slides.push({ type: 'cover', url: coverImageUrl, label: 'Cover Image' })
  }
  
  if (videoUrl) {
    // Extract YouTube video ID and detect if it's a Short
    const videoId = videoUrl.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/)?.[1]
    const isShort = videoUrl.includes('/shorts/')
    if (videoId) {
      slides.push({ 
        type: 'video', 
        url: `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`, 
        label: isShort ? 'Short' : 'Video',
        videoId,
        isShort,
        originalUrl: videoUrl,
      })
    }
  }

  // Debug: Log all slides
  console.log('[HeartchimePreviewCard] Total slides:', slides.length, slides.map(s => s.type))

  const hasMultipleSlides = slides.length > 1

  const nextSlide = () => {
    setCurrentSlide((prev) => (prev + 1) % slides.length)
  }

  const prevSlide = () => {
    setCurrentSlide((prev) => (prev - 1 + slides.length) % slides.length)
  }

  // Reset slide and video playing state when slides change
  // Use individual props as dependencies (fixed size array)
  useEffect(() => {
    setCurrentSlide(0)
    setIsVideoPlaying(false)
  }, [photo?.url, audioUrl, coverImageUrl, videoUrl])

  // Reset video playing state when changing slides
  useEffect(() => {
    setIsVideoPlaying(false)
  }, [currentSlide])

  const currentSlideData = slides[currentSlide] || slides[0]

  return (
    <div
      className={`mx-auto transition-transform hover:-translate-y-2 ${className}`}
      style={{
        width: 320,
        padding: 20,
        borderRadius: 24,
        background: `linear-gradient(135deg, ${goldColor} 0%, ${orangeColor} 100%)`,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 16,
        boxShadow: `0 0 30px 5px rgba(255, 195, 0, 0.4)`,
        fontFamily: "'Raleway', sans-serif",
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <Image
          src="/heartchime_icon.png"
          alt="Heartchime"
          width={50}
          height={40}
          style={{ width: 'auto', height: 'auto', maxWidth: 50, maxHeight: 40, objectFit: 'contain' }}
        />
        <span
          style={{
            fontFamily: "'Raleway', sans-serif",
            fontWeight: 600,
            fontSize: 25,
            color: navyBlue,
          }}
        >
          Heartchime
        </span>
      </div>

      {/* Media badges row */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
        {audioUrl && (
          <span style={{ 
            fontSize: 11, 
            background: 'rgba(34, 197, 94, 0.2)', 
            color: '#166534', 
            padding: '2px 8px', 
            borderRadius: 12,
            fontWeight: 600,
          }}>
            🎵 Audio
          </span>
        )}
        {videoUrl && (
          <span style={{ 
            fontSize: 11, 
            background: 'rgba(239, 68, 68, 0.2)', 
            color: '#991b1b', 
            padding: '2px 8px', 
            borderRadius: 12,
            fontWeight: 600,
          }}>
            📹 Video
          </span>
        )}
        {coverImageUrl && (
          <span style={{ 
            fontSize: 11, 
            background: 'rgba(147, 51, 234, 0.2)', 
            color: '#6b21a8', 
            padding: '2px 8px', 
            borderRadius: 12,
            fontWeight: 600,
          }}>
            🖼️ Cover
          </span>
        )}
      </div>

      {/* Photo / Media Carousel */}
      <div style={{ width: '100%', position: 'relative' }}>
        {currentSlideData?.url ? (
          <div style={{ position: 'relative', width: '100%', borderRadius: 16, overflow: 'hidden' }}>
            {/* Audio slide - Spotify embed */}
            {currentSlideData.type === 'audio' ? (
              <div 
                style={{
                  width: '100%',
                  aspectRatio: '4 / 5',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: 'linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%)',
                  borderRadius: 16,
                }}
              >
                {/* Spotify embed player - height 352 shows album art + controls */}
                <iframe
                  key={`spotify-${currentSlide}`}
                  src={currentSlideData.url}
                  width="100%"
                  height={352}
                  allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                  loading="lazy"
                  style={{ borderRadius: 12, border: 'none' }}
                />
              </div>
            ) : currentSlideData.type === 'video' && isVideoPlaying && currentSlideData.videoId ? (
              /* Video playing - YouTube embed */
              <div 
                style={{
                  width: '100%',
                  aspectRatio: currentSlideData.isShort ? '9 / 16' : '16 / 9',
                  maxHeight: currentSlideData.isShort ? 450 : 200,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: '#000',
                  borderRadius: 16,
                  overflow: 'hidden',
                }}
              >
                <iframe
                  key={`youtube-${currentSlideData.videoId}`}
                  src={`https://www.youtube.com/embed/${currentSlideData.videoId}?autoplay=1&rel=0`}
                  width="100%"
                  height="100%"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  style={{ border: 'none', borderRadius: 16 }}
                />
              </div>
            ) : currentSlideData.type === 'video' && currentSlideData.videoId ? (
              /* Video thumbnail with play button */
              <div 
                style={{
                  width: '100%',
                  aspectRatio: currentSlideData.isShort ? '9 / 16' : '16 / 9',
                  maxHeight: currentSlideData.isShort ? 450 : 200,
                  position: 'relative',
                  background: '#000',
                  borderRadius: 16,
                  overflow: 'hidden',
                }}
              >
                <img
                  src={currentSlideData.url}
                  alt="Video thumbnail"
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: currentSlideData.isShort ? 'contain' : 'cover',
                    display: 'block',
                  }}
                  onError={(e) => {
                    e.currentTarget.style.display = 'none'
                  }}
                />
                {/* Play button overlay */}
                <button
                  onClick={() => setIsVideoPlaying(true)}
                  style={{ 
                    position: 'absolute', 
                    inset: 0, 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center',
                    background: 'rgba(0,0,0,0.4)',
                    border: 'none',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{
                    background: '#dc2626',
                    borderRadius: '50%',
                    padding: 16,
                    boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                    transition: 'transform 0.2s',
                  }}>
                    <svg style={{ width: 32, height: 32, color: 'white' }} viewBox="0 0 24 24" fill="currentColor">
                      <path d="M8 5v14l11-7z"/>
                    </svg>
                  </div>
                </button>
              </div>
            ) : (
              /* Image slides (photo, cover) */
              <img
                src={currentSlideData.url}
                alt="Heartchime memory"
                style={{
                  width: '100%',
                  height: 'auto',
                  minHeight: 150,
                  maxHeight: 350,
                  objectFit: 'cover',
                  display: 'block',
                  borderRadius: 16,
                }}
                onError={(e) => {
                  // Hide broken images
                  e.currentTarget.style.display = 'none'
                }}
              />
            )}
            
            {/* Slide type label */}
            {hasMultipleSlides && currentSlideData.label && (
              <div style={{
                position: 'absolute',
                top: 8,
                left: 8,
                background: 'rgba(0,0,0,0.6)',
                color: 'white',
                fontSize: 11,
                padding: '4px 10px',
                borderRadius: 8,
                fontWeight: 500,
              }}>
                {currentSlideData.label}
              </div>
            )}

            {/* Arrow buttons */}
            {hasMultipleSlides && (
              <>
                <button
                  onClick={prevSlide}
                  style={{
                    position: 'absolute',
                    left: 8,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'rgba(255,255,255,0.9)',
                    border: 'none',
                    borderRadius: '50%',
                    width: 32,
                    height: 32,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
                  }}
                >
                  <ChevronLeftIcon />
                </button>
                <button
                  onClick={nextSlide}
                  style={{
                    position: 'absolute',
                    right: 8,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'rgba(255,255,255,0.9)',
                    border: 'none',
                    borderRadius: '50%',
                    width: 32,
                    height: 32,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
                  }}
                >
                  <ChevronRightIcon />
                </button>
              </>
            )}

            {/* Dot indicators */}
            {hasMultipleSlides && (
              <div style={{
                position: 'absolute',
                bottom: 8,
                left: '50%',
                transform: 'translateX(-50%)',
                display: 'flex',
                gap: 6,
              }}>
                {slides.map((_, idx) => (
                  <button
                    key={idx}
                    onClick={() => setCurrentSlide(idx)}
                    style={{
                      width: idx === currentSlide ? 16 : 8,
                      height: 8,
                      borderRadius: 4,
                      background: idx === currentSlide ? 'white' : 'rgba(255,255,255,0.5)',
                      border: 'none',
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                    }}
                  />
                ))}
              </div>
            )}

          </div>
        ) : (
          <div 
            style={{ 
              width: '100%', 
              height: 200, 
              borderRadius: 16, 
              background: 'rgba(26, 54, 93, 0.2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <span style={{ fontSize: 48, opacity: 0.4 }}>📷</span>
          </div>
        )}
      </div>

      {/* Message */}
      <div style={{ width: '100%' }}>
        {isEditing ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <textarea
              value={message}
              onChange={(e) => onMessageChange?.(e.target.value)}
              style={{
                width: '100%',
                minHeight: 100,
                padding: 12,
                borderRadius: 12,
                border: `2px solid ${navyBlue}`,
                background: 'rgba(255,255,255,0.9)',
                color: navyBlue,
                fontSize: 16,
                fontFamily: "'Raleway', sans-serif",
                fontWeight: 500,
                lineHeight: 1.5,
                resize: 'vertical',
                outline: 'none',
              }}
              placeholder="Write your message..."
            />
            {onRegenerate && (
              <button
                onClick={onRegenerate}
                disabled={isRegenerating}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  padding: '8px 16px',
                  borderRadius: 8,
                  border: `2px solid ${navyBlue}`,
                  background: 'transparent',
                  color: navyBlue,
                  fontSize: 14,
                  fontFamily: "'Raleway', sans-serif",
                  fontWeight: 600,
                  cursor: isRegenerating ? 'not-allowed' : 'pointer',
                  opacity: isRegenerating ? 0.6 : 1,
                }}
              >
                {isRegenerating ? (
                  <>
                    <span className="animate-spin">⏳</span>
                    <span>Regenerating...</span>
                  </>
                ) : (
                  <>
                    <span>🔄</span>
                    <span>Regenerate with AI</span>
                  </>
                )}
              </button>
            )}
          </div>
        ) : (
          <p
            style={{
              fontFamily: "'Raleway', sans-serif",
              fontSize: 17,
              fontWeight: 500,
              color: navyBlue,
              textAlign: 'center',
              lineHeight: 1.5,
              margin: 0,
            }}
          >
            {message || <span style={{ opacity: 0.5, fontStyle: 'italic' }}>No message yet...</span>}
          </p>
        )}
      </div>

      {/* Pulse Question */}
      {pulse && (
        <div style={{ width: '100%' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ color: navyBlue, fontSize: 12, fontWeight: 600, opacity: 0.7 }}>💬 Pulse Question</span>
            {onPulseToggle && (
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <span style={{ color: navyBlue, fontSize: 12, fontWeight: 500 }}>Include</span>
                <button
                  onClick={() => onPulseToggle(!pulse.enabled)}
                  style={{
                    position: 'relative',
                    width: 36,
                    height: 20,
                    borderRadius: 10,
                    border: 'none',
                    background: pulse.enabled ? navyBlue : 'rgba(26, 54, 93, 0.3)',
                    cursor: 'pointer',
                    transition: 'background 0.2s',
                  }}
                >
                  <span
                    style={{
                      position: 'absolute',
                      top: 2,
                      left: pulse.enabled ? 18 : 2,
                      width: 16,
                      height: 16,
                      borderRadius: '50%',
                      background: 'white',
                      transition: 'left 0.2s',
                    }}
                  />
                </button>
              </label>
            )}
          </div>
          
          {pulse.enabled && (
            <div 
              style={{ 
                background: 'rgba(26, 54, 93, 0.15)', 
                borderRadius: 12, 
                padding: 12,
                border: `1px solid rgba(26, 54, 93, 0.2)`,
              }}
            >
              {isEditing ? (
                <input
                  type="text"
                  value={pulse.question}
                  onChange={(e) => onPulseQuestionChange?.(e.target.value)}
                  style={{
                    width: '100%',
                    background: 'transparent',
                    border: 'none',
                    color: navyBlue,
                    fontSize: 14,
                    fontFamily: "'Raleway', sans-serif",
                    fontWeight: 500,
                    outline: 'none',
                  }}
                  placeholder="Enter a question..."
                />
              ) : (
                <p style={{ 
                  color: navyBlue, 
                  fontSize: 14, 
                  fontFamily: "'Raleway', sans-serif",
                  fontWeight: 500,
                  margin: 0,
                  textAlign: 'center',
                }}>
                  {pulse.question || <span style={{ opacity: 0.5, fontStyle: 'italic' }}>No question set</span>}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
