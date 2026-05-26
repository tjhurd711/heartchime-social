'use client'

import { useRef, useState } from 'react'
import { VoiceOption } from './types'

interface VoiceSelectorProps {
  voiceId: string
  voices: VoiceOption[]
  onChange: (voiceId: string) => void
}

export function VoiceSelector({ voiceId, voices, onChange }: VoiceSelectorProps) {
  const previewAudioRef = useRef<HTMLAudioElement | null>(null)
  const [previewingVoiceId, setPreviewingVoiceId] = useState<string | null>(null)

  const handlePreview = async (voice: VoiceOption) => {
    if (!voice.previewUrl) return

    if (previewAudioRef.current) {
      previewAudioRef.current.pause()
      previewAudioRef.current.currentTime = 0
      previewAudioRef.current = null
    }

    if (previewingVoiceId === voice.id) {
      setPreviewingVoiceId(null)
      return
    }

    try {
      const audio = new Audio(voice.previewUrl)
      previewAudioRef.current = audio
      setPreviewingVoiceId(voice.id)
      audio.addEventListener('ended', () => {
        setPreviewingVoiceId((current) => (current === voice.id ? null : current))
        previewAudioRef.current = null
      })
      await audio.play()
    } catch {
      setPreviewingVoiceId(null)
      previewAudioRef.current = null
    }
  }

  return (
    <div className="space-y-2">
      <label className="block text-sm text-gray-300">Target voice</label>
      <div className="max-h-80 space-y-2 overflow-y-auto rounded-lg border border-gray-700 bg-[#0f1729] p-2">
        {voices.map((voice) => (
          <div
            key={voice.id}
            className={`flex items-center justify-between gap-3 rounded-md border px-3 py-2 ${
              voice.id === voiceId ? 'border-cyan-300/60 bg-cyan-300/10' : 'border-gray-700 bg-[#121a30]'
            }`}
          >
            <button
              type="button"
              onClick={() => onChange(voice.id)}
              className="flex min-w-0 flex-1 items-center gap-2 text-left"
            >
              <span
                className={`h-3 w-3 rounded-full border ${
                  voice.id === voiceId ? 'border-cyan-200 bg-cyan-300' : 'border-gray-500'
                }`}
              />
              <span className="truncate text-sm text-gray-100">{voice.label}</span>
            </button>
            <button
              type="button"
              onClick={() => void handlePreview(voice)}
              disabled={!voice.previewUrl}
              className="rounded-md border border-gray-600 px-2 py-1 text-xs text-gray-100 transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {previewingVoiceId === voice.id ? 'Stop' : 'Preview'}
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
