'use client'

import { VoiceOption } from './types'

interface VoiceSelectorProps {
  voiceId: string
  voices: VoiceOption[]
  onChange: (voiceId: string) => void
}

export function VoiceSelector({ voiceId, voices, onChange }: VoiceSelectorProps) {
  return (
    <div className="space-y-2">
      <label className="block text-sm text-gray-300">Voice selector</label>
      <select
        value={voiceId}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-lg border border-gray-700 bg-[#0f1729] px-3 py-2 text-sm text-gray-100"
      >
        {voices.map((voice) => (
          <option key={voice.id} value={voice.id}>
            {voice.label}
          </option>
        ))}
      </select>
    </div>
  )
}
