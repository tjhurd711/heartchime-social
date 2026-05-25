'use client'

import { VoicemailPreviewData } from './types'
import { VoicemailPlayer } from './VoicemailPlayer'
import { IOS_VOICEMAIL_LAYOUT } from '@/lib/voicemail-video/iosVoicemailLayout'

interface VoicemailPreviewProps {
  data: VoicemailPreviewData
  audioUrl: string | null
  durationSeconds: number | null
  showReferenceOverlay?: boolean
  referenceOverlaySrc?: string
  referenceOverlayOpacity?: number
  referenceOverlayScale?: number
  referenceOverlayOffsetX?: number
  referenceOverlayOffsetY?: number
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

export function VoicemailPreview({
  data,
  audioUrl,
  durationSeconds,
  showReferenceOverlay = false,
  referenceOverlaySrc = '/dev-reference/voicemail-reference.png',
  referenceOverlayOpacity = IOS_VOICEMAIL_LAYOUT.referenceOverlayOpacity,
  referenceOverlayScale = 1,
  referenceOverlayOffsetX = 0,
  referenceOverlayOffsetY = 0,
}: VoicemailPreviewProps) {
  const layout = IOS_VOICEMAIL_LAYOUT
  const scale = layout.previewMaxWidth / layout.canvasWidth
  const scaledHeight = layout.canvasHeight * scale

  return (
    <div className="mx-auto" style={{ width: layout.previewMaxWidth }}>
      <div
        className="relative overflow-hidden rounded-[20px] border border-[#1f1f1f] bg-black shadow-[0_24px_70px_rgba(0,0,0,0.55)]"
        style={{ width: layout.previewMaxWidth, height: scaledHeight }}
      >
        <div
          className="flex h-full flex-col"
          style={{
            width: layout.canvasWidth,
            height: layout.canvasHeight,
            transform: `scale(${scale})`,
            transformOrigin: 'top left',
            padding: `${layout.phonePaddingTop}px ${layout.phonePaddingX}px ${layout.phonePaddingBottom}px`,
            boxSizing: 'border-box',
          }}
        >
        <div className="mb-2 flex items-center justify-between px-1 text-[33px] text-[#f2f2f2]">
          <span>6:11</span>
          <span>69%</span>
        </div>
          <div
            className="mx-auto rounded-full border border-white/20 bg-[#0b0b0f]"
            style={{
              width: layout.island.width,
              height: layout.island.height,
              marginTop: layout.island.topMargin,
              marginBottom: layout.island.bottomMargin,
            }}
          />

          <div className="flex items-center justify-between" style={{ marginBottom: layout.nav.rowBottomMargin }}>
            <button
              className="flex items-center justify-center rounded-full bg-[#141418] text-white"
              style={{ width: layout.nav.buttonSize, height: layout.nav.buttonSize }}
            >
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor">
              <path d="M15.8 5.2a1 1 0 0 1 0 1.4L10.4 12l5.4 5.4a1 1 0 1 1-1.4 1.4l-6.1-6.1a1 1 0 0 1 0-1.4l6.1-6.1a1 1 0 0 1 1.4 0Z" />
            </svg>
          </button>
            {data.topLabel ? <p style={{ fontSize: layout.nav.labelFontSize }} className="text-[#b8b8be]">{data.topLabel}</p> : <span />}
            <button
              className="flex items-center justify-center rounded-full bg-[#27d05f] text-black"
              style={{ width: layout.nav.buttonSize, height: layout.nav.buttonSize }}
            >
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor">
              <path d="M6.4 4.8c.6-.6 1.5-.8 2.3-.5l2.1.8c.7.2 1.1.9 1.1 1.6l-.1 2.2c0 .6-.3 1.1-.8 1.4l-1.4.9a14.6 14.6 0 0 0 3.2 3.2l.9-1.4c.3-.5.8-.8 1.4-.8l2.2-.1c.7 0 1.4.4 1.6 1.1l.8 2.1c.3.8.1 1.7-.5 2.3l-1 1c-.9.9-2.2 1.2-3.4.8-2.4-.8-4.8-2.4-7-4.7S4.6 9.4 3.9 7c-.4-1.2-.1-2.5.8-3.4l1.7-1.7Z" />
            </svg>
          </button>
        </div>

          <div className="mb-6 flex flex-col items-center gap-3 text-center" style={{ marginTop: layout.profile.topMargin }}>
          {data.profileImageUrl ? (
            <img
              src={data.profileImageUrl}
              alt={`${data.contactName} profile`}
              className="rounded-full object-cover"
              style={{ width: layout.profile.size, height: layout.profile.size }}
            />
          ) : (
              <div
                className="flex items-center justify-center rounded-full bg-[#51506d] font-semibold text-white"
                style={{ width: layout.profile.size, height: layout.profile.size, fontSize: layout.profile.initialsFontSize }}
              >
              {initialsFromName(data.contactName)}
            </div>
          )}
            <div
              className="rounded-full bg-[#1b1b1f] font-semibold text-white"
              style={{
                marginTop: layout.namePill.topMargin,
                padding: `${layout.namePill.verticalPadding}px ${layout.namePill.horizontalPadding}px`,
                fontSize: layout.namePill.fontSize,
              }}
            >
            {data.contactName} <span className="text-[#7f8087]">›</span>
          </div>
            <p className="text-[#a0a0a7]" style={{ marginTop: layout.metadata.topMargin, fontSize: layout.metadata.fontSize }}>
              {data.metadataLine}
            </p>
        </div>

          <div style={{ marginTop: layout.scrubber.topMargin }}>
            <VoicemailPlayer
              key={`${audioUrl || 'no-audio'}-${durationSeconds || 0}`}
              audioUrl={audioUrl}
              durationSeconds={durationSeconds}
            />
          </div>

          <div style={{ marginTop: layout.transcript.topMargin }}>
            <p className="text-[#777882]" style={{ fontSize: layout.transcript.labelFontSize }}>
              {data.transcriptText || 'Transcript (low confidence)'}
            </p>
            <p
              className="line-clamp-2 text-white"
              style={{ marginTop: layout.transcript.bodyTopMargin, fontSize: layout.transcript.bodyFontSize }}
            >
              {data.script || 'Hey'}
            </p>
        </div>

          <div className="mt-auto flex items-center justify-between" style={{ marginTop: layout.dock.topMargin }}>
            <div
              className="flex flex-1 items-center rounded-full border border-[#2f3033] bg-[#151517] text-[#d5d5da]"
              style={{
                height: layout.dock.height,
                padding: `0 ${layout.dock.horizontalPadding}px`,
                borderRadius: layout.dock.borderRadius,
                fontSize: layout.dock.fontSize,
              }}
            >
            <div className="mr-7 text-[#26a8ff]">⏰</div>
            <span className="text-[#23a8ff]">Calls</span>
              <span
                className="ml-2 rounded-full bg-[#ff4b54] text-white"
                style={{ fontSize: layout.dock.badgeFontSize, padding: '2px 8px' }}
              >
                53
              </span>
            <span className="ml-6">👤</span>
            <span className="ml-6">⋮⋮</span>
          </div>
            <button
              className="ml-4 flex items-center justify-center rounded-full border border-[#2f3033] bg-[#151517] text-white"
              style={{
                width: layout.dock.searchSize,
                height: layout.dock.searchSize,
                marginLeft: layout.dock.searchLeftMargin,
                borderRadius: layout.dock.borderRadius,
                fontSize: 42,
              }}
            >
            ⌕
          </button>
        </div>
      </div>

        {showReferenceOverlay ? (
          <img
            src={referenceOverlaySrc}
            alt="Voicemail reference overlay"
            className="pointer-events-none absolute inset-0 h-full w-full object-cover"
            style={{
              opacity: referenceOverlayOpacity,
              transform: `translate(${referenceOverlayOffsetX}px, ${referenceOverlayOffsetY}px) scale(${referenceOverlayScale})`,
              transformOrigin: 'center center',
            }}
          />
        ) : null}
      </div>
    </div>
  )
}
