'use client'

import type { ReactNode } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { IOS_VOICEMAIL_LAYOUT } from '@/lib/voicemail-video/iosVoicemailLayout'
interface VoicemailPlayerProps {
  audioUrl: string | null
  durationSeconds?: number | null
}

function formatTimestamp(totalSeconds: number): string {
  const safeSeconds = Number.isFinite(totalSeconds) ? Math.max(0, totalSeconds) : 0
  const wholeSeconds = Math.floor(safeSeconds)
  const minutes = Math.floor(wholeSeconds / 60)
  const seconds = wholeSeconds % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

function IconButton({
  label,
  icon,
  onClick,
  disabled,
  active,
  size,
}: {
  label: string
  icon: ReactNode
  onClick?: () => void
  disabled?: boolean
  active?: boolean
  size: number
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={`rounded-full border transition disabled:opacity-45 ${
        active
          ? 'border-white/80 bg-white text-black'
          : 'border-white/20 bg-transparent text-white hover:bg-white/10'
      }`}
      style={{ width: size, height: size }}
    >
      {icon}
    </button>
  )
}

function IconShare() {
  return (
    <svg viewBox="0 0 24 24" className="mx-auto h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.8}>
      <path d="M12 16V4M12 4l-4 4M12 4l4 4" />
      <rect x="5" y="11" width="14" height="10" rx="2" />
    </svg>
  )
}

function IconBack() {
  return (
    <svg viewBox="0 0 24 24" className="mx-auto h-5 w-5" fill="currentColor">
      <path d="M15.8 5.2a1 1 0 0 1 0 1.4L10.4 12l5.4 5.4a1 1 0 1 1-1.4 1.4l-6.1-6.1a1 1 0 0 1 0-1.4l6.1-6.1a1 1 0 0 1 1.4 0Z" />
    </svg>
  )
}

function IconPlay({ paused }: { paused: boolean }) {
  if (!paused) {
    return (
      <svg viewBox="0 0 24 24" className="mx-auto h-5 w-5" fill="currentColor">
        <rect x="6" y="5" width="4" height="14" rx="1" />
        <rect x="14" y="5" width="4" height="14" rx="1" />
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 24 24" className="mx-auto h-5 w-5" fill="currentColor">
      <path d="M8 5.6c0-1 1.1-1.6 2-1.1l8.5 5.4c.8.5.8 1.7 0 2.2L10 17.5c-.9.6-2 .1-2-1V5.6Z" />
    </svg>
  )
}

function IconSpeaker() {
  return (
    <svg viewBox="0 0 24 24" className="mx-auto h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.8}>
      <path d="M4 14h3l4 4V6L7 10H4v4Z" />
      <path d="M16 9c1.3.9 2 2 2 3s-.7 2.1-2 3" />
      <path d="M18.8 6.4C20.8 7.8 22 9.8 22 12c0 2.2-1.2 4.2-3.2 5.6" />
    </svg>
  )
}

function IconTrash() {
  return (
    <svg viewBox="0 0 24 24" className="mx-auto h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.8}>
      <path d="M5 7h14M9 7V5h6v2M8 7l1 12h6l1-12" />
    </svg>
  )
}

export function VoicemailPlayer({ audioUrl, durationSeconds }: VoicemailPlayerProps) {
  const ui = IOS_VOICEMAIL_LAYOUT.scrubber
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [resolvedDuration, setResolvedDuration] = useState(() => durationSeconds ?? 0)
  const [playerError, setPlayerError] = useState<string | null>(null)

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    const handleTimeUpdate = () => setCurrentTime(audio.currentTime || 0)
    const handleLoadedMetadata = () => {
      if (Number.isFinite(audio.duration) && audio.duration > 0) {
        setResolvedDuration(audio.duration)
      }
    }
    const handleEnded = () => setIsPlaying(false)
    const handleAudioError = () => {
      setIsPlaying(false)
      setPlayerError('Audio could not be played. Try generating again.')
    }

    audio.addEventListener('timeupdate', handleTimeUpdate)
    audio.addEventListener('loadedmetadata', handleLoadedMetadata)
    audio.addEventListener('ended', handleEnded)
    audio.addEventListener('error', handleAudioError)

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate)
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata)
      audio.removeEventListener('ended', handleEnded)
      audio.removeEventListener('error', handleAudioError)
    }
  }, [])

  const totalDuration = useMemo(() => {
    if (Number.isFinite(resolvedDuration) && resolvedDuration > 0) return resolvedDuration
    return 0
  }, [resolvedDuration])

  const progressPercent = totalDuration > 0 ? Math.min(100, (currentTime / totalDuration) * 100) : 0
  const remainingSeconds = totalDuration > 0 ? Math.max(0, totalDuration - currentTime) : 0

  const togglePlay = async () => {
    if (!audioRef.current || !audioUrl) return
    try {
      if (isPlaying) {
        audioRef.current.pause()
        setIsPlaying(false)
      } else {
        await audioRef.current.play()
        setPlayerError(null)
        setIsPlaying(true)
      }
    } catch {
      setPlayerError('Playback was blocked. Interact with the page and try again.')
    }
  }

  const rewindTenSeconds = () => {
    if (!audioRef.current) return
    audioRef.current.currentTime = Math.max(0, audioRef.current.currentTime - 10)
  }

  const seekPercent = (nextPercent: number) => {
    if (!audioRef.current || totalDuration <= 0) return
    const safePercent = Math.max(0, Math.min(100, nextPercent))
    audioRef.current.currentTime = (safePercent / 100) * totalDuration
  }

  return (
    <div className="px-1">
      <audio ref={audioRef} src={audioUrl || undefined} preload="metadata" />

      <div
        className="mb-2 flex items-center justify-between leading-none text-white"
        style={{ fontSize: ui.timeFontSize }}
      >
        <span>{formatTimestamp(currentTime)}</span>
        <span>-{formatTimestamp(remainingSeconds)}</span>
      </div>

      <div
        className="relative mb-7 rounded-full bg-[#1f2126]"
        style={{ height: ui.timelineHeight, marginTop: ui.timelineTopMargin }}
      >
        <div className="h-full rounded-full bg-[#bfc4ce]" style={{ width: `${progressPercent}%` }} />
        <div
          className="absolute top-1/2 h-11 w-20 -translate-y-1/2 rounded-full bg-white shadow-[0_0_10px_rgba(255,255,255,0.25)]"
          style={{
            left: `calc(${progressPercent}% - ${ui.knobWidth / 2}px)`,
            width: ui.knobWidth,
            height: ui.knobHeight,
          }}
        />
        <input
          type="range"
          min={0}
          max={100}
          value={progressPercent}
          onChange={(event) => seekPercent(Number(event.target.value))}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          disabled={!audioUrl || totalDuration <= 0}
          aria-label="Voicemail progress"
        />
      </div>

      <div className="flex items-center justify-between px-1" style={{ gap: ui.controlGap, marginTop: ui.controlsTopMargin }}>
        <IconButton
          label="Share"
          icon={<IconShare />}
          disabled
          size={ui.controlSize}
        />
        <IconButton
          label="Skip back"
          icon={<IconBack />}
          onClick={rewindTenSeconds}
          disabled={!audioUrl}
          size={ui.controlSize}
        />
        <IconButton
          label={isPlaying ? 'Pause' : 'Play'}
          icon={<IconPlay paused={!isPlaying} />}
          onClick={togglePlay}
          disabled={!audioUrl}
          active
          size={ui.controlSize}
        />
        <IconButton
          label="Speaker"
          icon={<IconSpeaker />}
          disabled
          size={ui.controlSize}
        />
        <IconButton
          label="Delete"
          icon={<IconTrash />}
          disabled
          size={ui.controlSize}
        />
      </div>

      {!audioUrl && (
        <p className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
          Generate audio to enable synced playback.
        </p>
      )}

      {playerError && <p className="mt-3 text-xs text-red-300">{playerError}</p>}
    </div>
  )
}
