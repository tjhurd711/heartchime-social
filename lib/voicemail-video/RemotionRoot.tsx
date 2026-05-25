import React from 'react'
import { Composition } from 'remotion'
import { VoicemailVideoComposition, VoicemailVideoInputProps } from './VoicemailVideoComposition'

const FALLBACK_DURATION_SECONDS = 8
const FPS = 30

const defaultProps: VoicemailVideoInputProps = {
  profileImageSrc: null,
  contactName: 'Mom',
  emoji: '❤️',
  metadataLine: 'home • Dec 16, 2022 at 1:54 PM',
  topLabel: 'Voicemail',
  transcriptText: 'Transcript unavailable',
  theme: 'classic_dark',
  script: 'Voicemail preview script',
  audioSrc: '',
  durationInFrames: FALLBACK_DURATION_SECONDS * FPS,
}

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="VoicemailVideo"
      component={VoicemailVideoComposition as unknown as React.ComponentType<Record<string, unknown>>}
      width={1080}
      height={1920}
      fps={FPS}
      durationInFrames={FPS * 60}
      defaultProps={defaultProps as unknown as Record<string, unknown>}
    />
  )
}
