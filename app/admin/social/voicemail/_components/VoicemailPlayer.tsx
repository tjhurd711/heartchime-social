'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { VoicemailTheme } from './types'

interface VoicemailPlayerProps {
  audioUrl: string | null
  durationSeconds?: number | null
  theme: VoicemailTheme
}

function formatTimestamp(totalSeconds: number): string {
  const safeSeconds = Number.isFinite(totalSeconds) ? Math.max(0, totalSeconds) : 0
  const wholeSeconds = Math.floor(safeSeconds)
  const minutes = Math.floor(wholeSeconds / 60)
  const seconds = wholeSeconds % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

const THEME_CLASSES: Record<
  VoicemailTheme,
  {
    shell: string
    timelineTrack: string
    timelineFill: string
    knob: string
    time: string
    iconButton: string
    iconButtonPrimary: string
    helper: string
  }
> = {
  classic_dark: {
    shell: 'bg-[#17181f]',
    timelineTrack: 'bg-[#2a2d36]',
    timelineFill: 'bg-cyan-300',
    knob: 'bg-cyan-100 ring-4 ring-cyan-300/25',
    time: 'text-gray-400',
    iconButton: 'bg-[#1f2330] border border-[#343a49] text-gray-200 hover:bg-[#252a39]',
    iconButtonPrimary: 'bg-cyan-300 border border-cyan-200 text-[#032332] hover:bg-cyan-200',
    helper: 'text-gray-500',
  },
  soft_blur: {
    shell: 'bg-white/5 backdrop-blur-sm',
    timelineTrack: 'bg-white/20',
    timelineFill: 'bg-[#bfd8ff]',
    knob: 'bg-white ring-4 ring-[#bfd8ff]/35',
    time: 'text-[#dde4f5]',
    iconButton: 'bg-white/10 border border-white/20 text-[#e9effd] hover:bg-white/20',
    iconButtonPrimary: 'bg-[#bfd8ff] border border-[#d8e8ff] text-[#12203c] hover:bg-[#d8e8ff]',
    helper: 'text-[#c4cce0]',
  },
  minimal_black: {
    shell: 'bg-black',
    timelineTrack: 'bg-[#1c1c1c]',
    timelineFill: 'bg-white',
    knob: 'bg-white ring-4 ring-white/20',
    time: 'text-gray-300',
    iconButton: 'bg-[#111] border border-[#222] text-gray-200 hover:bg-[#181818]',
    iconButtonPrimary: 'bg-white border border-white text-black hover:bg-gray-200',
    helper: 'text-gray-500',
  },
}

function IconButton({
  label,
  icon,
  onClick,
  disabled,
  className,
}: {
  label: string
  icon: string
  onClick?: () => void
  disabled?: boolean
  className: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={`h-11 w-11 rounded-full text-lg transition disabled:opacity-45 ${className}`}
    >
      {icon}
    </button>
  )
}

export function VoicemailPlayer({ audioUrl, durationSeconds, theme }: VoicemailPlayerProps) {
  const palette = THEME_CLASSES[theme]
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
    <div className={`rounded-[24px] p-4 ${palette.shell}`}>
      <audio ref={audioRef} src={audioUrl || undefined} preload="metadata" />

      <div className={`mb-2 flex items-center justify-between text-[11px] ${palette.time}`}>
        <span>{formatTimestamp(currentTime)}</span>
        <span>-{formatTimestamp(remainingSeconds)}</span>
      </div>

      <div className={`relative mb-4 h-1.5 rounded-full ${palette.timelineTrack}`}>
        <div className={`h-full rounded-full ${palette.timelineFill}`} style={{ width: `${progressPercent}%` }} />
        <div
          className={`absolute top-1/2 h-3 w-3 -translate-y-1/2 rounded-full ${palette.knob}`}
          style={{ left: `calc(${progressPercent}% - 6px)` }}
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

      <div className="flex items-center justify-center gap-4">
        <IconButton
          label="Rewind 10 seconds"
          icon="↺"
          onClick={rewindTenSeconds}
          disabled={!audioUrl}
          className={palette.iconButton}
        />
        <IconButton
          label={isPlaying ? 'Pause voicemail' : 'Play voicemail'}
          icon={isPlaying ? '⏸' : '▶'}
          onClick={togglePlay}
          disabled={!audioUrl}
          className={palette.iconButtonPrimary}
        />
        <IconButton label="Speaker" icon="🔊" disabled className={palette.iconButton} />
        <IconButton label="Delete" icon="🗑" disabled className={palette.iconButton} />
        <IconButton label="Share" icon="↗" disabled className={palette.iconButton} />
      </div>

      {!audioUrl && (
        <p className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
          Generate audio to enable synced playback.
        </p>
      )}

      {playerError && <p className="mt-3 text-xs text-red-300">{playerError}</p>}
      {audioUrl && <p className={`mt-2 text-center text-[11px] ${palette.helper}`}>Voicemail-inspired playback controls</p>}
    </div>
  )
}
