import React from 'react'
import { AbsoluteFill, Audio, interpolate, useCurrentFrame, useVideoConfig } from 'remotion'

export type VoicemailVideoTheme = 'classic_dark' | 'soft_blur' | 'minimal_black'

export interface VoicemailVideoInputProps {
  profileImageSrc: string | null
  contactName: string
  emoji: string
  metadataLine: string
  topLabel: string
  transcriptText: string
  theme: VoicemailVideoTheme
  script: string
  audioSrc: string
  durationInFrames: number
}

function formatTimestamp(totalSeconds: number): string {
  const safeSeconds = Number.isFinite(totalSeconds) ? Math.max(0, totalSeconds) : 0
  const wholeSeconds = Math.floor(safeSeconds)
  const minutes = Math.floor(wholeSeconds / 60)
  const seconds = wholeSeconds % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

export const VoicemailVideoComposition: React.FC<VoicemailVideoInputProps> = ({
  profileImageSrc,
  contactName,
  emoji,
  metadataLine,
  topLabel,
  transcriptText,
  theme,
  script,
  audioSrc,
  durationInFrames,
}) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const safeDurationFrames = Math.max(1, durationInFrames)
  const totalDurationSeconds = safeDurationFrames / fps
  const elapsedSeconds = Math.min(totalDurationSeconds, frame / fps)
  const remainingSeconds = Math.max(0, totalDurationSeconds - elapsedSeconds)
  const progressPercent = interpolate(frame, [0, safeDurationFrames], [0, 100], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })

  const palette = {
    classic_dark: {
      shellBg: '#06070a',
      border: 'rgba(255,255,255,0.14)',
      gradient: 'linear-gradient(180deg, rgba(26,31,46,0.4) 0%, rgba(10,13,20,0.72) 45%, rgba(2,3,4,0.95) 100%)',
      text: '#ffffff',
      muted: '#9aa3b4',
      playerCard: 'rgba(17,20,29,0.82)',
      transcriptCard: 'rgba(13,16,23,0.9)',
      navCard: 'rgba(11,14,20,0.95)',
      timelineTrack: '#2a2d36',
      timelineFill: '#8ce9ff',
      timelineKnob: '#d4fbff',
      active: '#8ce9ff',
      iconPrimaryText: '#031f2d',
      iconPrimaryBg: '#8ce9ff',
      iconBg: '#1f2330',
      iconBorder: '#343a49',
    },
    soft_blur: {
      shellBg: 'rgba(16,21,34,0.84)',
      border: 'rgba(255,255,255,0.22)',
      gradient: 'linear-gradient(180deg, rgba(79,92,128,0.3) 0%, rgba(31,43,68,0.42) 48%, rgba(11,18,32,0.88) 100%)',
      text: '#f4f7ff',
      muted: '#d3dbee',
      playerCard: 'rgba(255,255,255,0.12)',
      transcriptCard: 'rgba(255,255,255,0.1)',
      navCard: 'rgba(255,255,255,0.1)',
      timelineTrack: 'rgba(255,255,255,0.24)',
      timelineFill: '#d6e5ff',
      timelineKnob: '#ffffff',
      active: '#ffffff',
      iconPrimaryText: '#12203c',
      iconPrimaryBg: '#bfd8ff',
      iconBg: 'rgba(255,255,255,0.14)',
      iconBorder: 'rgba(255,255,255,0.24)',
    },
    minimal_black: {
      shellBg: '#000',
      border: '#1a1a1a',
      gradient: 'linear-gradient(180deg, rgba(0,0,0,0.4) 0%, rgba(0,0,0,0.74) 45%, rgba(0,0,0,1) 100%)',
      text: '#fff',
      muted: '#737373',
      playerCard: '#090909',
      transcriptCard: '#060606',
      navCard: '#050505',
      timelineTrack: '#1c1c1c',
      timelineFill: '#fff',
      timelineKnob: '#fff',
      active: '#fff',
      iconPrimaryText: '#000',
      iconPrimaryBg: '#fff',
      iconBg: '#111',
      iconBorder: '#222',
    },
  }[theme]

  return (
    <AbsoluteFill style={{ backgroundColor: '#020203', fontFamily: 'system-ui, -apple-system, Segoe UI, sans-serif' }}>
      <Audio src={audioSrc} />

      <div
        style={{
          width: 860,
          height: 1750,
          margin: '85px auto',
          boxSizing: 'border-box',
          padding: 44,
          color: palette.text,
          display: 'flex',
          flexDirection: 'column',
          borderRadius: 92,
          overflow: 'hidden',
          border: `2px solid ${palette.border}`,
          backgroundColor: palette.shellBg,
          position: 'relative',
          boxShadow: '0 32px 90px rgba(0,0,0,0.45)',
        }}
      >
        <div style={{ position: 'absolute', inset: 0, background: palette.gradient }} />
        <div style={{ position: 'relative', display: 'flex', justifyContent: 'space-between', color: palette.muted, fontSize: 20 }}>
          <span>9:41</span>
          <span style={{ letterSpacing: 1 }}>LTE</span>
        </div>

        <div
          style={{
            position: 'absolute',
            top: 12,
            left: '50%',
            transform: 'translateX(-50%)',
            width: 220,
            height: 42,
            borderRadius: 999,
            backgroundColor: 'rgba(0,0,0,0.58)',
          }}
        />

        <div style={{ marginTop: 34, position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
          <div style={{ fontSize: 16, textTransform: 'uppercase', letterSpacing: 5, color: palette.muted }}>{topLabel || 'Voicemail'}</div>
          {profileImageSrc ? (
            <img
              src={profileImageSrc}
              alt="Profile"
              style={{
                width: 250,
                height: 250,
                borderRadius: 999,
                objectFit: 'cover',
                border: `2px solid ${palette.border}`,
                marginTop: 14,
                boxShadow: '0 0 0 12px rgba(255,255,255,0.06)',
              }}
            />
          ) : (
            <div
              style={{
                width: 250,
                height: 250,
                marginTop: 14,
                borderRadius: 999,
                border: `2px solid ${palette.border}`,
                backgroundColor: '#101216',
                color: '#566072',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 36,
              }}
            >
              IMG
            </div>
          )}

          <div style={{ marginTop: 20, fontSize: 74, fontWeight: 600, letterSpacing: -1 }}>
            {contactName}
            {emoji ? ` ${emoji}` : ''}
          </div>
          <div style={{ marginTop: 10, fontSize: 23, color: palette.muted }}>{metadataLine}</div>
        </div>

        <div
          style={{
            marginTop: 48,
            border: `1px solid ${palette.border}`,
            backgroundColor: palette.playerCard,
            borderRadius: 56,
            padding: '30px 32px',
            position: 'relative',
          }}
        >
          <div style={{ fontSize: 18, letterSpacing: 4, textTransform: 'uppercase', color: palette.muted }}>Playback</div>
          <div style={{ marginTop: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 20, color: palette.muted, marginBottom: 14 }}>
              <span>{formatTimestamp(elapsedSeconds)}</span>
              <span>-{formatTimestamp(remainingSeconds)}</span>
            </div>

            <div style={{ position: 'relative', width: '100%', height: 8, borderRadius: 999, backgroundColor: palette.timelineTrack }}>
              <div
                style={{
                  width: `${progressPercent}%`,
                  height: '100%',
                  borderRadius: 999,
                  backgroundColor: palette.timelineFill,
                }}
              />
              <div
                style={{
                  position: 'absolute',
                  top: '50%',
                  left: `${progressPercent}%`,
                  width: 14,
                  height: 14,
                  borderRadius: 999,
                  backgroundColor: palette.timelineKnob,
                  transform: 'translate(-50%, -50%)',
                  boxShadow: `0 0 0 4px ${theme === 'minimal_black' ? 'rgba(255,255,255,0.2)' : 'rgba(191,216,255,0.35)'}`,
                }}
              />
            </div>
          </div>

          <div style={{ marginTop: 26, display: 'flex', justifyContent: 'center', gap: 20 }}>
            {[
              { icon: '↺', active: false },
              { icon: '▶', active: true },
              { icon: '🔊', active: false },
              { icon: '🗑', active: false },
              { icon: '↗', active: false },
            ].map((item) => (
              <div
                key={item.icon}
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: 999,
                  border: `1px solid ${item.active ? palette.iconPrimaryBg : palette.iconBorder}`,
                  backgroundColor: item.active ? palette.iconPrimaryBg : palette.iconBg,
                  color: item.active ? palette.iconPrimaryText : palette.text,
                  fontSize: 24,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {item.icon}
              </div>
            ))}
          </div>
        </div>

        <div
          style={{
            marginTop: 26,
            border: `1px solid ${palette.border}`,
            borderRadius: 34,
            backgroundColor: palette.transcriptCard,
            padding: '24px 24px 22px',
          }}
        >
          <div style={{ fontSize: 16, color: palette.muted, textTransform: 'uppercase', letterSpacing: 4 }}>Transcript</div>
          <div style={{ marginTop: 10, fontSize: 30, color: palette.text }}>{transcriptText || 'Transcript unavailable'}</div>
          <div style={{ marginTop: 8, fontSize: 19, color: palette.muted, lineHeight: 1.4 }}>
            {script || 'No script provided yet.'}
          </div>
        </div>

        <div
          style={{
            marginTop: 'auto',
            border: `1px solid ${palette.border}`,
            borderRadius: 26,
            backgroundColor: palette.navCard,
            padding: '16px 22px',
            display: 'grid',
            gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
            fontSize: 18,
            color: palette.muted,
            textAlign: 'center',
          }}
        >
          <span>Inbox</span>
          <span>Missed</span>
          <span style={{ color: palette.active }}>Voicemail</span>
          <span>Contacts</span>
        </div>
      </div>
    </AbsoluteFill>
  )
}
