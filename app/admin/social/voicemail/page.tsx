'use client'

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import { VoiceSelector } from './_components/VoiceSelector'
import { VoiceOption } from './_components/types'

const DEFAULT_VOICES: VoiceOption[] = [
  { id: '21m00Tcm4TlvDq8ikWAM', label: 'Rachel (default)' },
  { id: 'AZnzlk1XvdvUeBnXmlld', label: 'Domi' },
  { id: 'EXAVITQu4vr4xnSDxMaL', label: 'Bella' },
  { id: 'TxGEqnHWrfWFTfGW9XjX', label: 'Josh' },
  { id: 'VR6AewLTigWG4xSOukaG', label: 'Arnold' },
]

const DEFAULT_SCRIPT =
  'Hey honey. Just checking in to say I love you and I am proud of you. If you get this, call me back when you have a minute.'

interface GenerateAudioResponse {
  audioUrl?: string
  audioKey?: string
  durationSeconds?: number | null
  voiceId?: string
  jobId?: string
  mode?: 'text_to_speech' | 'speech_to_speech'
  error?: string
  details?: string
  code?: string
}

interface SwapVideoAudioResponse {
  videoUrl?: string
  videoKey?: string
  jobId?: string
  audioKey?: string | null
  sourceVideoKey?: string
  error?: string
  details?: string
}

interface UploadSourceVideoResponse {
  jobId?: string
  sourceVideoKey?: string
  uploadUrl?: string
  sourceVideoUrl?: string
  expiresInSeconds?: number
  error?: string
  details?: string
}

type VoiceMode = 'speech_to_speech' | 'text_to_speech'

export default function VoicemailTesterPage() {
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const mediaStreamRef = useRef<MediaStream | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const [voiceMode, setVoiceMode] = useState<VoiceMode>('speech_to_speech')
  const [voiceId, setVoiceId] = useState(DEFAULT_VOICES[0].id)
  const [script, setScript] = useState(DEFAULT_SCRIPT)
  const [screenRecordingFile, setScreenRecordingFile] = useState<File | null>(null)
  const [sourceVideoKey, setSourceVideoKey] = useState<string | null>(null)
  const [sourceVideoJobId, setSourceVideoJobId] = useState<string | null>(null)
  const [isUploadingSourceVideo, setIsUploadingSourceVideo] = useState(false)
  const [sourceSpeechFile, setSourceSpeechFile] = useState<File | null>(null)
  const [sourceSpeechObjectUrl, setSourceSpeechObjectUrl] = useState<string | null>(null)
  const [isRecordingSpeech, setIsRecordingSpeech] = useState(false)
  const [generatedAudioUrl, setGeneratedAudioUrl] = useState<string | null>(null)
  const [generatedAudioKey, setGeneratedAudioKey] = useState<string | null>(null)
  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  const [videoKey, setVideoKey] = useState<string | null>(null)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)

  const selectedVoiceLabel = useMemo(
    () => DEFAULT_VOICES.find((voice) => voice.id === voiceId)?.label || voiceId,
    [voiceId]
  )

  useEffect(() => {
    return () => {
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((track) => track.stop())
      }
      if (sourceSpeechObjectUrl) {
        URL.revokeObjectURL(sourceSpeechObjectUrl)
      }
    }
  }, [sourceSpeechObjectUrl])

  const setSpeechFileWithPreview = (file: File | null) => {
    if (sourceSpeechObjectUrl) {
      URL.revokeObjectURL(sourceSpeechObjectUrl)
    }
    setSourceSpeechFile(file)
    setSourceSpeechObjectUrl(file ? URL.createObjectURL(file) : null)
  }

  const handleStartRecordingSpeech = async () => {
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('Audio recording is not supported in this browser.')
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      mediaStreamRef.current = stream

      const recorder = new MediaRecorder(stream)
      mediaRecorderRef.current = recorder
      audioChunksRef.current = []

      recorder.addEventListener('dataavailable', (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data)
        }
      })

      recorder.addEventListener('stop', () => {
        const recordedBlob = new Blob(audioChunksRef.current, { type: recorder.mimeType || 'audio/webm' })
        const extension = recorder.mimeType.includes('mp4') ? 'm4a' : 'webm'
        const recordedFile = new File([recordedBlob], `voice-sample.${extension}`, {
          type: recorder.mimeType || 'audio/webm',
        })
        setSpeechFileWithPreview(recordedFile)
        stream.getTracks().forEach((track) => track.stop())
        mediaStreamRef.current = null
      })

      recorder.start()
      setIsRecordingSpeech(true)
      setStatusMessage('Recording started. Click Stop Recording when done.')
      setErrorMessage(null)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to start recording.')
    }
  }

  const handleStopRecordingSpeech = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop()
      setIsRecordingSpeech(false)
      setStatusMessage('Recorded source speech captured.')
    }
  }

  const uploadSourceVideoToS3 = async (file: File): Promise<{ sourceVideoKey: string; jobId: string }> => {
    const uploadInitResponse = await fetch('/api/voicemail/upload-source-video', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fileName: file.name || 'source-video.mp4',
        contentType: file.type || 'video/mp4',
        jobId: sourceVideoJobId || undefined,
      }),
    })
    const uploadInitData = (await uploadInitResponse.json()) as UploadSourceVideoResponse
    if (!uploadInitResponse.ok) {
      throw new Error(uploadInitData.details || uploadInitData.error || 'Failed to start source video upload.')
    }

    if (!uploadInitData.uploadUrl || !uploadInitData.sourceVideoKey || !uploadInitData.jobId) {
      throw new Error('Upload initialization did not return uploadUrl/sourceVideoKey/jobId.')
    }

    const putResponse = await fetch(uploadInitData.uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': file.type || 'video/mp4',
      },
      body: file,
    })

    if (!putResponse.ok) {
      throw new Error(`Direct S3 upload failed with status ${putResponse.status}.`)
    }

    return {
      sourceVideoKey: uploadInitData.sourceVideoKey,
      jobId: uploadInitData.jobId,
    }
  }

  const handleSourceVideoSelected = async (file: File | null) => {
    setScreenRecordingFile(file)
    setSourceVideoKey(null)
    setSourceVideoJobId(null)
    setVideoUrl(null)
    setVideoKey(null)

    if (!file) {
      return
    }

    setIsUploadingSourceVideo(true)
    setStatusMessage('Uploading source video directly to S3...')
    setErrorMessage(null)
    try {
      const uploadResult = await uploadSourceVideoToS3(file)
      setSourceVideoKey(uploadResult.sourceVideoKey)
      setSourceVideoJobId(uploadResult.jobId)
      setStatusMessage('Source video uploaded to S3. Ready to generate and swap.')
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to upload source video to S3.')
    } finally {
      setIsUploadingSourceVideo(false)
    }
  }

  const generateVoiceAudio = async (): Promise<{ audioKey: string; audioUrl?: string }> => {
    if (voiceMode === 'text_to_speech') {
      if (!script.trim()) {
        throw new Error('Type a script for Type it mode.')
      }

      const response = await fetch('/api/voicemail/generate-audio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'text_to_speech',
          script,
          voiceId,
        }),
      })
      const data = (await response.json()) as GenerateAudioResponse
      if (!response.ok) {
        throw new Error(data.details || data.error || 'Audio generation failed.')
      }
      if (!data.audioKey) {
        throw new Error('Audio generation response did not include audioKey.')
      }
      return { audioKey: data.audioKey, audioUrl: data.audioUrl }
    }

    if (!sourceSpeechFile) {
      throw new Error('Upload or record source speech for Speak it mode.')
    }

    const body = new FormData()
    body.append('mode', 'speech_to_speech')
    body.append('voiceId', voiceId)
    body.append('audio', sourceSpeechFile, sourceSpeechFile.name || 'source-speech.webm')

    const response = await fetch('/api/voicemail/generate-audio', {
      method: 'POST',
      body,
    })
    const data = (await response.json()) as GenerateAudioResponse
    if (!response.ok) {
      throw new Error(data.details || data.error || 'Speech-to-speech generation failed.')
    }
    if (!data.audioKey) {
      throw new Error('Speech-to-speech response did not include audioKey.')
    }
    return { audioKey: data.audioKey, audioUrl: data.audioUrl }
  }

  const swapAudioOnVideo = async (audioKey: string, sourceVideoKeyValue: string, audioUrl?: string) => {
    if (!sourceVideoKeyValue) {
      throw new Error('Upload the source video to S3 first.')
    }

    const response = await fetch('/api/voicemail/swap-video-audio', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sourceVideoKey: sourceVideoKeyValue,
        audioKey,
        ...(audioUrl ? { audioUrl } : {}),
      }),
    })
    const data = (await response.json()) as SwapVideoAudioResponse
    if (!response.ok) {
      throw new Error(data.details || data.error || 'Video audio swap failed.')
    }
    if (!data.videoUrl) {
      throw new Error('Swap route finished but no video URL was returned.')
    }

    setVideoUrl(data.videoUrl)
    setVideoKey(data.videoKey || null)
  }

  const handleGenerateSwapVideo = async () => {
    setStatusMessage(null)
    setErrorMessage(null)
    setVideoUrl(null)
    setVideoKey(null)
    setGeneratedAudioKey(null)
    setGeneratedAudioUrl(null)

    if (!screenRecordingFile) {
      setErrorMessage('Upload the source screen recording first.')
      return
    }
    if (!sourceVideoKey) {
      setErrorMessage('Wait for source video upload to S3 to complete before generating.')
      return
    }

    if (voiceMode === 'text_to_speech' && !script.trim()) {
      setErrorMessage('Type a script for Type it mode.')
      return
    }

    if (voiceMode === 'speech_to_speech' && !sourceSpeechFile) {
      setErrorMessage('Upload or record source speech for Speak it mode.')
      return
    }

    setIsGenerating(true)
    try {
      setStatusMessage('Generating transformed voice...')
      const generatedAudio = await generateVoiceAudio()
      setGeneratedAudioKey(generatedAudio.audioKey)
      setGeneratedAudioUrl(generatedAudio.audioUrl || null)

      setStatusMessage('Swapping generated voice onto video...')
      await swapAudioOnVideo(generatedAudio.audioKey, sourceVideoKey, generatedAudio.audioUrl)

      setStatusMessage(`Done. Voice generated with ${selectedVoiceLabel} and swapped onto your video.`)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unexpected generation failure.')
    } finally {
      setIsGenerating(false)
    }
  }

  return (
    <div className="space-y-6 p-6 lg:p-8">
      <div>
        <Link href="/admin/social" className="mb-2 inline-flex text-sm text-gray-400 hover:text-gray-200">
          ← Back to Social Dashboard
        </Link>
        <h1 className="text-3xl font-bold text-white">Voicemail Audio-Swap Engine</h1>
        <p className="mt-1 max-w-3xl text-sm text-gray-400">
          Upload a real iOS voicemail screen recording, generate voice with ElevenLabs (speech-to-speech or text-to-speech), and output an MP4 with replaced audio.
        </p>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.15fr,1fr]">
        <section className="space-y-4 rounded-2xl border border-gray-800 bg-[#151a26] p-5">
          <h2 className="text-lg font-semibold text-white">Inputs</h2>

          <label className="space-y-2">
            <span className="block text-sm text-gray-300">Screen recording (MP4/MOV)</span>
            <input
              type="file"
              accept="video/mp4,video/quicktime,video/x-m4v,.mp4,.mov,.m4v"
              onChange={(event) => void handleSourceVideoSelected(event.target.files?.[0] || null)}
              className="w-full rounded-lg border border-gray-700 bg-[#0f1729] px-3 py-2 text-sm text-gray-100 file:mr-4 file:rounded-md file:border-0 file:bg-cyan-400 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-[#03141c]"
            />
            {screenRecordingFile ? (
              <p className="text-xs text-gray-400">
                {screenRecordingFile.name}
                {isUploadingSourceVideo ? ' - uploading to S3...' : sourceVideoKey ? ' - uploaded to S3' : ''}
              </p>
            ) : (
              <p className="text-xs text-gray-500">Upload the original iOS voicemail screen recording first.</p>
            )}
          </label>

          <div className="space-y-2 rounded-xl border border-gray-800 bg-[#0f1420] p-3">
            <span className="block text-sm font-semibold text-white">Voice mode</span>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setVoiceMode('speech_to_speech')}
                className={`rounded-lg px-3 py-2 text-sm transition ${
                  voiceMode === 'speech_to_speech'
                    ? 'bg-cyan-300 text-[#06232e]'
                    : 'border border-gray-700 bg-[#0f1729] text-gray-200 hover:bg-gray-800'
                }`}
              >
                Speak it
              </button>
              <button
                type="button"
                onClick={() => setVoiceMode('text_to_speech')}
                className={`rounded-lg px-3 py-2 text-sm transition ${
                  voiceMode === 'text_to_speech'
                    ? 'bg-cyan-300 text-[#06232e]'
                    : 'border border-gray-700 bg-[#0f1729] text-gray-200 hover:bg-gray-800'
                }`}
              >
                Type it
              </button>
            </div>
          </div>

          <VoiceSelector voiceId={voiceId} voices={DEFAULT_VOICES} onChange={setVoiceId} />

          {voiceMode === 'text_to_speech' ? (
            <label className="space-y-2">
              <span className="block text-sm text-gray-300">Script (TTS)</span>
              <textarea
                value={script}
                onChange={(event) => setScript(event.target.value)}
                rows={6}
                className="w-full rounded-lg border border-gray-700 bg-[#0f1729] px-3 py-2 text-sm text-gray-100"
              />
            </label>
          ) : (
            <div className="space-y-3 rounded-xl border border-gray-800 bg-[#0f1420] p-4">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-cyan-200">Source speech (STS)</h3>
              <p className="text-xs text-gray-400">
                Upload or record your own voice. ElevenLabs will preserve your timing and emotion while changing vocal character.
              </p>
              <input
                type="file"
                accept="audio/*,.mp3,.m4a,.wav,.webm,.ogg"
                onChange={(event) => setSpeechFileWithPreview(event.target.files?.[0] || null)}
                className="w-full rounded-lg border border-gray-700 bg-[#0f1729] px-3 py-2 text-sm text-gray-100 file:mr-4 file:rounded-md file:border-0 file:bg-cyan-400 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-[#03141c]"
              />
              <div className="flex flex-wrap gap-2">
                {!isRecordingSpeech ? (
                  <button
                    type="button"
                    onClick={handleStartRecordingSpeech}
                    className="rounded-lg border border-cyan-300/70 bg-cyan-300/10 px-3 py-1.5 text-xs font-semibold text-cyan-100 transition hover:bg-cyan-300/20"
                  >
                    Record voice
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleStopRecordingSpeech}
                    className="rounded-lg border border-rose-300/70 bg-rose-300/10 px-3 py-1.5 text-xs font-semibold text-rose-100 transition hover:bg-rose-300/20"
                  >
                    Stop recording
                  </button>
                )}
              </div>
              {sourceSpeechFile ? <p className="text-xs text-gray-400">{sourceSpeechFile.name}</p> : null}
              {sourceSpeechObjectUrl ? <audio controls src={sourceSpeechObjectUrl} className="w-full" /> : null}
            </div>
          )}

          <div className="flex flex-wrap gap-3 pt-2">
            <button
              type="button"
              onClick={handleGenerateSwapVideo}
              disabled={isGenerating || isUploadingSourceVideo || !sourceVideoKey}
              className="rounded-lg bg-cyan-400 px-4 py-2 text-sm font-semibold text-[#03141c] transition hover:bg-cyan-300 disabled:opacity-60"
            >
              {isGenerating ? 'Generating + swapping...' : 'Generate swapped voicemail video'}
            </button>
          </div>

          {statusMessage && <p className="text-sm text-emerald-300">{statusMessage}</p>}
          {errorMessage && <p className="text-sm text-amber-300">{errorMessage}</p>}
          {generatedAudioUrl && (
            <p className="text-sm text-cyan-300">
              Generated audio:{' '}
              <a href={generatedAudioUrl} target="_blank" rel="noreferrer" className="underline">
                Open MP3
              </a>
              {generatedAudioKey ? <span className="ml-2 text-xs text-gray-400">({generatedAudioKey})</span> : null}
            </p>
          )}
          {videoUrl && (
            <p className="text-sm text-cyan-300">
              Video ready:{' '}
              <a href={videoUrl} target="_blank" rel="noreferrer" className="underline">
                Open / download MP4
              </a>
              {videoKey ? <span className="ml-2 text-xs text-gray-400">({videoKey})</span> : null}
            </p>
          )}
        </section>

        <section className="space-y-3 rounded-2xl border border-gray-800 bg-[#121620] p-5">
          <h2 className="text-lg font-semibold text-white">Result</h2>
          <p className="text-xs text-gray-400">The output MP4 is generated by replacing the uploaded video&apos;s audio track.</p>
          {videoUrl ? (
            <video src={videoUrl} controls playsInline className="w-full rounded-lg border border-gray-800 bg-black" />
          ) : (
            <div className="rounded-lg border border-dashed border-gray-700 bg-[#0f1420] p-6 text-sm text-gray-400">
              Generate a swapped video to preview it here.
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
