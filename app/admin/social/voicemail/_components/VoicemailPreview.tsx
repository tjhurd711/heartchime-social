'use client'

import { VoicemailPreviewData, VoicemailTheme } from './types'
import { VoicemailPlayer } from './VoicemailPlayer'

interface VoicemailPreviewProps {
  data: VoicemailPreviewData
  audioUrl: string | null
  durationSeconds: number | null
}

const THEME_CLASSES: Record<
  VoicemailTheme,
  {
    phoneShell: string
    overlay: string
    name: string
    meta: string
    playerCard: string
    transcriptCard: string
    transcriptText: string
    nav: string
    activeNav: string
  }
> = {
  classic_dark: {
    phoneShell: 'border-white/10 bg-[#06070a]',
    overlay: 'from-[#1a1f2e]/40 via-[#0a0d14]/70 to-[#020304]/95',
    name: 'text-white',
    meta: 'text-gray-400',
    playerCard: 'border-white/10 bg-[#11141d]/80',
    transcriptCard: 'border-white/10 bg-[#0d1017]/90',
    transcriptText: 'text-gray-300',
    nav: 'border-white/10 bg-[#0b0e14]/95 text-gray-500',
    activeNav: 'text-cyan-300',
  },
  soft_blur: {
    phoneShell: 'border-white/20 bg-[#101522]/80',
    overlay: 'from-[#4f5c80]/30 via-[#1f2b44]/40 to-[#0b1220]/85',
    name: 'text-[#f4f7ff]',
    meta: 'text-[#d8dff0]',
    playerCard: 'border-white/20 bg-white/10 backdrop-blur',
    transcriptCard: 'border-white/15 bg-white/10 backdrop-blur',
    transcriptText: 'text-[#e3e9f8]',
    nav: 'border-white/15 bg-white/10 text-[#cad2e9]',
    activeNav: 'text-white',
  },
  minimal_black: {
    phoneShell: 'border-[#1a1a1a] bg-black',
    overlay: 'from-black/40 via-black/70 to-black',
    name: 'text-white',
    meta: 'text-gray-500',
    playerCard: 'border-[#1a1a1a] bg-[#090909]',
    transcriptCard: 'border-[#1a1a1a] bg-[#060606]',
    transcriptText: 'text-gray-300',
    nav: 'border-[#1a1a1a] bg-[#050505] text-gray-600',
    activeNav: 'text-white',
  },
}

export function VoicemailPreview({ data, audioUrl, durationSeconds }: VoicemailPreviewProps) {
  const theme = THEME_CLASSES[data.theme]

  return (
    <div className="mx-auto w-full max-w-[390px]">
      <div className={`relative overflow-hidden rounded-[44px] border p-4 shadow-2xl shadow-black/50 ${theme.phoneShell}`}>
        <div className={`pointer-events-none absolute inset-0 bg-gradient-to-b ${theme.overlay}`} />

        <div className="relative">
          <div className="mb-5 flex items-center justify-between px-1 text-[11px] text-gray-300/90">
            <span>9:41</span>
            <span className="tracking-wide">LTE</span>
          </div>

          <div className="pointer-events-none absolute left-1/2 top-1 h-6 w-24 -translate-x-1/2 rounded-full bg-black/60" />
        </div>

        <div className="relative mb-7 flex flex-col items-center gap-2 text-center">
          <p className="text-[10px] uppercase tracking-[0.24em] text-gray-400/90">{data.topLabel}</p>
          {data.profileImageUrl ? (
            <img
              src={data.profileImageUrl}
              alt={`${data.contactName} profile`}
              className="h-28 w-28 rounded-full border border-white/20 object-cover shadow-[0_0_0_6px_rgba(255,255,255,0.05)]"
            />
          ) : (
            <div className="flex h-28 w-28 items-center justify-center rounded-full border border-white/20 bg-black/40 text-gray-500">
              IMG
            </div>
          )}
          <p className={`text-[36px] font-semibold leading-tight ${theme.name}`}>
            {data.contactName}
            {data.emoji ? ` ${data.emoji}` : ''}
          </p>
          <p className={`text-[12px] ${theme.meta}`}>{data.metadataLine}</p>
        </div>

        <div className={`relative space-y-3 rounded-[30px] border p-4 ${theme.playerCard}`}>
          <p className="text-[11px] uppercase tracking-[0.2em] text-gray-400">Playback</p>
          <VoicemailPlayer
            key={`${audioUrl || 'no-audio'}-${durationSeconds || 0}`}
            audioUrl={audioUrl}
            durationSeconds={durationSeconds}
            theme={data.theme}
          />
        </div>

        <div className={`relative mt-4 rounded-[22px] border p-4 ${theme.transcriptCard}`}>
          <p className="mb-1 text-[11px] uppercase tracking-[0.2em] text-gray-500">Transcript</p>
          <p className={`text-[15px] font-medium ${theme.transcriptText}`}>
            {data.transcriptText || 'Transcript unavailable'}
          </p>
          <p className="mt-2 line-clamp-3 text-xs text-gray-500">{data.script || 'No script provided yet.'}</p>
        </div>

        <div className={`relative mt-5 grid grid-cols-4 gap-2 rounded-[18px] border px-3 py-2 text-center text-[11px] ${theme.nav}`}>
          <span>Inbox</span>
          <span>Missed</span>
          <span className={theme.activeNav}>Voicemail</span>
          <span>Contacts</span>
        </div>
      </div>
    </div>
  )
}
