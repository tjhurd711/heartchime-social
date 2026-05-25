export interface VoiceOption {
  id: string
  label: string
}

export type VoicemailTheme = 'classic_dark' | 'soft_blur' | 'minimal_black'

export interface VoicemailPreviewData {
  profileImageUrl: string | null
  contactName: string
  emoji: string
  metadataLine: string
  script: string
  topLabel: string
  transcriptText: string
  theme: VoicemailTheme
}
