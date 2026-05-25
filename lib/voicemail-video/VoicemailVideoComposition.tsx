import React from 'react'
import { AbsoluteFill, Audio, interpolate, useCurrentFrame, useVideoConfig } from 'remotion'
import { IOS_VOICEMAIL_LAYOUT } from './iosVoicemailLayout'

export type VoicemailVideoTheme = 'ios_voicemail' | 'classic_dark' | 'soft_blur' | 'minimal_black'

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

function initialsFromName(name: string): string {
  const words = name
    .split(' ')
    .map((word) => word.trim())
    .filter(Boolean)
  if (words.length === 0) return 'VC'
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return `${words[0][0]}${words[1][0]}`.toUpperCase()
}

const IconChevronLeft: React.FC<{ color: string }> = ({ color }) => (
  <svg viewBox="0 0 24 24" width={32} height={32} fill={color}>
    <path d="M15.8 5.2a1 1 0 0 1 0 1.4L10.4 12l5.4 5.4a1 1 0 1 1-1.4 1.4l-6.1-6.1a1 1 0 0 1 0-1.4l6.1-6.1a1 1 0 0 1 1.4 0Z" />
  </svg>
)

const IconPhone: React.FC = () => (
  <svg viewBox="0 0 24 24" width={28} height={28} fill="#041508">
    <path d="M6.4 4.8c.6-.6 1.5-.8 2.3-.5l2.1.8c.7.2 1.1.9 1.1 1.6l-.1 2.2c0 .6-.3 1.1-.8 1.4l-1.4.9a14.6 14.6 0 0 0 3.2 3.2l.9-1.4c.3-.5.8-.8 1.4-.8l2.2-.1c.7 0 1.4.4 1.6 1.1l.8 2.1c.3.8.1 1.7-.5 2.3l-1 1c-.9.9-2.2 1.2-3.4.8-2.4-.8-4.8-2.4-7-4.7S4.6 9.4 3.9 7c-.4-1.2-.1-2.5.8-3.4l1.7-1.7Z" />
  </svg>
)

const IconShare: React.FC<{ color: string }> = ({ color }) => (
  <svg viewBox="0 0 24 24" width={26} height={26} fill="none" stroke={color} strokeWidth={1.8}>
    <path d="M12 16V4M12 4l-4 4M12 4l4 4" />
    <rect x="5" y="11" width="14" height="10" rx="2" />
  </svg>
)

const IconSkipBack: React.FC<{ color: string }> = ({ color }) => (
  <svg viewBox="0 0 24 24" width={26} height={26} fill={color}>
    <path d="M12 6.2a1 1 0 0 1 0 1.4L8.6 11l3.4 3.4a1 1 0 1 1-1.4 1.4L6.5 11.7a1 1 0 0 1 0-1.4l4.1-4.1a1 1 0 0 1 1.4 0Z" />
    <path d="M18 6.2a1 1 0 0 1 0 1.4L14.6 11l3.4 3.4a1 1 0 1 1-1.4 1.4l-4.1-4.1a1 1 0 0 1 0-1.4l4.1-4.1a1 1 0 0 1 1.4 0Z" />
  </svg>
)

const IconPlay: React.FC<{ color: string; isPlaying: boolean }> = ({ color, isPlaying }) => {
  if (isPlaying) {
    return (
      <svg viewBox="0 0 24 24" width={26} height={26} fill={color}>
        <rect x="6" y="5" width="4" height="14" rx="1" />
        <rect x="14" y="5" width="4" height="14" rx="1" />
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 24 24" width={26} height={26} fill={color}>
      <path d="M8 5.6c0-1 1.1-1.6 2-1.1l8.5 5.4c.8.5.8 1.7 0 2.2L10 17.5c-.9.6-2 .1-2-1V5.6Z" />
    </svg>
  )
}

const IconSpeaker: React.FC<{ color: string }> = ({ color }) => (
  <svg viewBox="0 0 24 24" width={26} height={26} fill="none" stroke={color} strokeWidth={1.8}>
    <path d="M4 14h3l4 4V6L7 10H4v4Z" />
    <path d="M16 9c1.3.9 2 2 2 3s-.7 2.1-2 3" />
    <path d="M18.8 6.4C20.8 7.8 22 9.8 22 12c0 2.2-1.2 4.2-3.2 5.6" />
  </svg>
)

const IconTrash: React.FC<{ color: string }> = ({ color }) => (
  <svg viewBox="0 0 24 24" width={26} height={26} fill="none" stroke={color} strokeWidth={1.8}>
    <path d="M5 7h14M9 7V5h6v2M8 7l1 12h6l1-12" />
  </svg>
)

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
  const layout = IOS_VOICEMAIL_LAYOUT
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
    ios_voicemail: {
      shellBorder: '#1f1f1f',
      shellBg: '#000000',
      text: '#f2f2f2',
      muted: '#9b9ca4',
      pill: '#1b1b1f',
      timelineTrack: '#1f2126',
      timelineFill: '#bfc4ce',
      knob: '#ffffff',
      circleButtonBg: '#141418',
      circleButtonBorder: 'rgba(255,255,255,0.2)',
      callButtonBg: '#27d05f',
      dockBorder: '#2f3033',
      dockBg: '#151517',
      accentBlue: '#26a8ff',
    },
    classic_dark: {
      shellBorder: '#1f1f1f',
      shellBg: '#000000',
      text: '#f2f2f2',
      muted: '#9b9ca4',
      pill: '#1b1b1f',
      timelineTrack: '#1f2126',
      timelineFill: '#bfc4ce',
      knob: '#ffffff',
      circleButtonBg: '#141418',
      circleButtonBorder: 'rgba(255,255,255,0.2)',
      callButtonBg: '#27d05f',
      dockBorder: '#2f3033',
      dockBg: '#151517',
      accentBlue: '#26a8ff',
    },
    soft_blur: {
      shellBorder: '#1f1f1f',
      shellBg: '#000000',
      text: '#f2f2f2',
      muted: '#9b9ca4',
      pill: '#1b1b1f',
      timelineTrack: '#1f2126',
      timelineFill: '#bfc4ce',
      knob: '#ffffff',
      circleButtonBg: '#141418',
      circleButtonBorder: 'rgba(255,255,255,0.2)',
      callButtonBg: '#27d05f',
      dockBorder: '#2f3033',
      dockBg: '#151517',
      accentBlue: '#26a8ff',
    },
    minimal_black: {
      shellBorder: '#1f1f1f',
      shellBg: '#000000',
      text: '#f2f2f2',
      muted: '#9b9ca4',
      pill: '#1b1b1f',
      timelineTrack: '#1f2126',
      timelineFill: '#bfc4ce',
      knob: '#ffffff',
      circleButtonBg: '#141418',
      circleButtonBorder: 'rgba(255,255,255,0.2)',
      callButtonBg: '#27d05f',
      dockBorder: '#2f3033',
      dockBg: '#151517',
      accentBlue: '#26a8ff',
    },
  }[theme]

  return (
    <AbsoluteFill style={{ backgroundColor: '#020203', fontFamily: 'system-ui, -apple-system, Segoe UI, sans-serif' }}>
      <Audio src={audioSrc} />

      <div
        style={{
          width: layout.canvasWidth - 2 * 95,
          height: layout.canvasHeight - 2 * 72,
          margin: '72px auto',
          boxSizing: 'border-box',
          padding: `${layout.phonePaddingTop}px ${layout.phonePaddingX}px ${layout.phonePaddingBottom}px`,
          color: palette.text,
          display: 'flex',
          flexDirection: 'column',
          borderRadius: layout.phoneRadius,
          overflow: 'hidden',
          border: `2px solid ${palette.shellBorder}`,
          backgroundColor: palette.shellBg,
          position: 'relative',
          boxShadow: '0 32px 90px rgba(0,0,0,0.45)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: layout.statusTimeFontSize, color: palette.text }}>
          <span>6:11</span>
          <span style={{ fontSize: 26 }}>69%</span>
        </div>

        <div
          style={{
            width: layout.island.width,
            height: layout.island.height,
            margin: `${layout.island.topMargin}px auto ${layout.island.bottomMargin}px`,
            border: '1px solid rgba(255,255,255,0.18)',
            borderRadius: 999,
            backgroundColor: '#0b0b0f',
          }}
        />

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: layout.nav.rowBottomMargin,
          }}
        >
          <div
            style={{
              width: layout.nav.buttonSize,
              height: layout.nav.buttonSize,
              borderRadius: 999,
              backgroundColor: palette.circleButtonBg,
              border: `1px solid ${palette.circleButtonBorder}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <IconChevronLeft color="#fff" />
          </div>
          <div style={{ fontSize: layout.nav.labelFontSize, color: palette.muted }}>{topLabel || ''}</div>
          <div
            style={{
              width: layout.nav.buttonSize,
              height: layout.nav.buttonSize,
              borderRadius: 999,
              backgroundColor: palette.callButtonBg,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <IconPhone />
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
          {profileImageSrc ? (
            <img
              src={profileImageSrc}
              alt="Profile"
              style={{
                width: layout.profile.size,
                height: layout.profile.size,
                borderRadius: 999,
                objectFit: 'cover',
              }}
            />
          ) : (
            <div
              style={{
                width: layout.profile.size,
                height: layout.profile.size,
                borderRadius: 999,
                backgroundColor: '#51506d',
                color: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: layout.profile.initialsFontSize,
                fontWeight: 600,
              }}
            >
              {initialsFromName(contactName)}
            </div>
          )}

          <div
            style={{
              marginTop: layout.namePill.topMargin,
              fontSize: layout.namePill.fontSize,
              fontWeight: 600,
              padding: `${layout.namePill.verticalPadding}px ${layout.namePill.horizontalPadding}px`,
              borderRadius: 999,
              backgroundColor: palette.pill,
            }}
          >
            {contactName} {emoji ? emoji : ''}
            <span style={{ marginLeft: 10, color: '#8b8d96' }}>›</span>
          </div>
          <div style={{ marginTop: layout.metadata.topMargin, fontSize: layout.metadata.fontSize, color: palette.muted }}>
            {metadataLine}
          </div>
        </div>

        <div
          style={{
            marginTop: layout.scrubber.topMargin,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: layout.scrubber.timeFontSize, color: palette.text, marginBottom: 12 }}>
            <span>{formatTimestamp(elapsedSeconds)}</span>
            <span>-{formatTimestamp(remainingSeconds)}</span>
          </div>

          <div
            style={{
              position: 'relative',
              width: '100%',
              height: layout.scrubber.timelineHeight,
              borderRadius: 999,
              backgroundColor: palette.timelineTrack,
              marginTop: layout.scrubber.timelineTopMargin,
            }}
          >
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
                width: layout.scrubber.knobWidth,
                height: layout.scrubber.knobHeight,
                borderRadius: 999,
                backgroundColor: palette.knob,
                transform: 'translate(-50%, -50%)',
                boxShadow: '0 0 10px rgba(255,255,255,0.25)',
              }}
            />
          </div>

          <div style={{ marginTop: layout.scrubber.controlsTopMargin, display: 'flex', justifyContent: 'space-between', gap: layout.scrubber.controlGap }}>
            {[
              { key: 'share', icon: <IconShare color="#fff" />, active: false },
              { key: 'skip', icon: <IconSkipBack color="#fff" />, active: false },
              { key: 'play', icon: <IconPlay color="#000" isPlaying={frame % (fps * 4) > fps * 2} />, active: true },
              { key: 'speaker', icon: <IconSpeaker color="#fff" />, active: false },
              { key: 'trash', icon: <IconTrash color="#fff" />, active: false },
            ].map((item) => (
              <div
                key={item.key}
                style={{
                  width: layout.scrubber.controlSize,
                  height: layout.scrubber.controlSize,
                  borderRadius: 999,
                  border: `1px solid ${item.active ? '#fff' : 'rgba(255,255,255,0.2)'}`,
                  backgroundColor: item.active ? '#fff' : 'transparent',
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

        <div style={{ marginTop: layout.transcript.topMargin }}>
          <div style={{ fontSize: layout.transcript.labelFontSize, color: '#74757e' }}>
            {transcriptText || 'Transcript (low confidence)'}
          </div>
          <div
            style={{
              marginTop: layout.transcript.bodyTopMargin,
              fontSize: layout.transcript.bodyFontSize,
              color: '#fff',
              lineHeight: 1.25,
            }}
          >
            {script || 'Hey'}
          </div>
        </div>

        <div
          style={{
            marginTop: 'auto',
            paddingTop: layout.dock.topMargin,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div
            style={{
              flex: 1,
              height: layout.dock.height,
              borderRadius: layout.dock.borderRadius,
              border: `1px solid ${palette.dockBorder}`,
              backgroundColor: palette.dockBg,
              display: 'flex',
              alignItems: 'center',
              padding: `0 ${layout.dock.horizontalPadding}px`,
              color: '#d5d5da',
              fontSize: layout.dock.fontSize,
            }}
          >
            <span style={{ color: palette.accentBlue, marginRight: 14 }}>⏰</span>
            <span style={{ color: palette.accentBlue, marginRight: 8 }}>Calls</span>
            <span style={{ backgroundColor: '#ff4b54', color: '#fff', borderRadius: 999, padding: '2px 8px', fontSize: 21 }}>
              53
            </span>
            <span style={{ marginLeft: 22 }}>👤</span>
            <span style={{ marginLeft: 24 }}>⋮⋮</span>
          </div>
          <div
            style={{
              height: layout.dock.searchSize,
              width: layout.dock.searchSize,
              borderRadius: layout.dock.borderRadius,
              border: `1px solid ${palette.dockBorder}`,
              backgroundColor: palette.dockBg,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
              fontSize: 42,
              marginLeft: layout.dock.searchLeftMargin,
            }}
          >
            ⌕
          </div>
        </div>
      </div>
    </AbsoluteFill>
  )
}
