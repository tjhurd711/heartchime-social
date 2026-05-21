'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import ReferencePanel, { TemplateReferencePhoto } from '../../_components/reference-panel'

type AccountType = 'business' | 'persona'
type FieldType = 'text' | 'textarea' | 'select' | 'photo_upload'
type CharacterKey = 'alive' | 'deceased'
type SelfieGender = 'male' | 'female'
type SelfieEthnicity = 'white' | 'black' | 'hispanic' | 'asian' | 'middle eastern' | 'south asian' | 'mixed'
type SelfieAngle = 'from below' | 'straight on' | 'from above' | 'side tilt'
type SelfieEmotion = 'neutral' | 'slight smile' | 'bittersweet' | 'sad' | 'hopeful' | 'tired' | 'peaceful'
type SelfieGaze = 'looking at camera' | 'looking away' | 'eyes down' | 'looking off to side'
type SelfieSetting = 'home' | 'car' | 'outside' | 'office'
type MotionStyle = 'ai_subtle' | 'kenburns' | 'static_hold'

interface VariableField {
  name: string
  label: string
  type: FieldType
  required: boolean
  options?: string[]
}

interface Template {
  id: string
  name: string
  description: string | null
  account_type: 'business' | 'persona' | 'both'
  audio_track_url?: string | null
  live_photo_supported?: boolean
  reference_video_url?: string | null
  reference_photos?: TemplateReferencePhoto[] | null
  variables_schema: VariableField[] | null
  slides?: Array<{
    order?: number
    slide_type?: string
    characters?: CharacterKey[]
    motion_hint?: string
    motion_style?: MotionStyle
    live_photo_eligible?: boolean
    live_photo_default?: boolean
  }>
}

interface PersonaOption {
  id: string
  name: string
}

const ETHNICITIES: { value: SelfieEthnicity; label: string }[] = [
  { value: 'white', label: 'White' },
  { value: 'black', label: 'Black' },
  { value: 'hispanic', label: 'Hispanic' },
  { value: 'asian', label: 'Asian' },
  { value: 'middle eastern', label: 'Middle Eastern' },
  { value: 'south asian', label: 'South Asian' },
  { value: 'mixed', label: 'Mixed' },
]
const ANGLES: { value: SelfieAngle; label: string }[] = [
  { value: 'from below', label: 'From Below' },
  { value: 'straight on', label: 'Straight On' },
  { value: 'from above', label: 'From Above' },
  { value: 'side tilt', label: 'Side Tilt' },
]
const EMOTIONS: { value: SelfieEmotion; label: string }[] = [
  { value: 'neutral', label: 'Neutral' },
  { value: 'slight smile', label: 'Slight Smile' },
  { value: 'bittersweet', label: 'Bittersweet' },
  { value: 'sad', label: 'Sad' },
  { value: 'hopeful', label: 'Hopeful' },
  { value: 'tired', label: 'Tired' },
  { value: 'peaceful', label: 'Peaceful' },
]
const GAZES: { value: SelfieGaze; label: string }[] = [
  { value: 'looking at camera', label: 'At Camera' },
  { value: 'looking away', label: 'Looking Away' },
  { value: 'eyes down', label: 'Eyes Down' },
  { value: 'looking off to side', label: 'Off to Side' },
]
const SETTINGS: { value: SelfieSetting; label: string }[] = [
  { value: 'home', label: 'Home' },
  { value: 'car', label: 'Car' },
  { value: 'outside', label: 'Outside' },
  { value: 'office', label: 'Office' },
]

const CHARACTER_AGE_OPTIONS = ['teens', '20s', '30s', '40s', '50s', '60s', '70s', '80s', '90s']
const CHARACTER_GENDER_OPTIONS = ['male', 'female']
const CHARACTER_ETHNICITY_OPTIONS = ['white', 'black', 'hispanic', 'asian', 'middle_eastern', 'mixed']

function formatEthnicityLabel(value: string): string {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase())
}

export default function GenerateFromTemplatePage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const templateId = params.id

  const [template, setTemplate] = useState<Template | null>(null)
  const [variables, setVariables] = useState<Record<string, string>>({})
  const [accountType, setAccountType] = useState<AccountType>('business')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [uploadingField, setUploadingField] = useState<string | null>(null)
  const [personas, setPersonas] = useState<PersonaOption[]>([])
  const [selectedPersonaId, setSelectedPersonaId] = useState('')
  const [loadingPersonas, setLoadingPersonas] = useState(false)
  const [isGeneratingSelfie, setIsGeneratingSelfie] = useState(false)
  const [selectedLivePhotoSlideOrders, setSelectedLivePhotoSlideOrders] = useState<number[]>([])
  const [selfieAge, setSelfieAge] = useState(35)
  const [selfieGender, setSelfieGender] = useState<SelfieGender>('female')
  const [selfieEthnicity, setSelfieEthnicity] = useState<SelfieEthnicity>('white')
  const [selfieAngle, setSelfieAngle] = useState<SelfieAngle>('straight on')
  const [selfieEmotion, setSelfieEmotion] = useState<SelfieEmotion>('bittersweet')
  const [selfieGaze, setSelfieGaze] = useState<SelfieGaze>('looking at camera')
  const [selfieSetting, setSelfieSetting] = useState<SelfieSetting>('home')

  useEffect(() => {
    const loadTemplate = async () => {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch(`/api/admin/social/templates/${templateId}`)
        const data = await res.json()
        if (!res.ok) {
          throw new Error(data?.error || 'Failed to load template')
        }
        setTemplate(data)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load template')
      } finally {
        setLoading(false)
      }
    }

    if (templateId) {
      loadTemplate()
    }
  }, [templateId])

  useEffect(() => {
    const loadPersonas = async () => {
      if (accountType !== 'persona' || personas.length > 0) return
      setLoadingPersonas(true)
      try {
        const res = await fetch('/api/admin/social/ai-ugc/personas')
        const data = await res.json()
        if (!res.ok) {
          throw new Error(data?.error || 'Failed to load personas')
        }
        const personaOptions: PersonaOption[] = (data.personas || []).map((p: { id: string; name: string }) => ({
          id: p.id,
          name: p.name,
        }))
        setPersonas(personaOptions)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load personas')
      } finally {
        setLoadingPersonas(false)
      }
    }

    void loadPersonas()
  }, [accountType, personas.length])

  const variablesSchema = useMemo(() => template?.variables_schema || [], [template])
  const schemaFieldNames = useMemo(() => new Set(variablesSchema.map((field) => field.name)), [variablesSchema])
  const livePhotoSlides = useMemo(
    () => (template?.slides || []).filter((slide) => slide.live_photo_eligible === true),
    [template]
  )
  const hasSelfieSlide = useMemo(
    () => !!template?.slides?.some((slide) => slide?.slide_type === 'selfie'),
    [template]
  )
  const needsAliveDemographics = useMemo(
    () => !!template?.slides?.some((slide) => (slide?.characters || []).includes('alive')),
    [template]
  )
  const needsDeceasedDemographics = useMemo(
    () => !!template?.slides?.some((slide) => (slide?.characters || []).includes('deceased')),
    [template]
  )
  const needsAliveDemographicInputs = needsAliveDemographics && (
    !schemaFieldNames.has('alive_age') ||
    !schemaFieldNames.has('alive_gender') ||
    !schemaFieldNames.has('alive_ethnicity')
  )
  const needsDeceasedDemographicInputs = needsDeceasedDemographics && (
    !schemaFieldNames.has('deceased_age') ||
    !schemaFieldNames.has('deceased_gender') ||
    !schemaFieldNames.has('deceased_ethnicity')
  )
  const shouldShowCharacterInputs = accountType === 'business' && (needsAliveDemographicInputs || needsDeceasedDemographicInputs)

  const demographicsMissing = useMemo(() => {
    if (!shouldShowCharacterInputs) return false

    const aliveMissing = needsAliveDemographicInputs && (
      !variables.alive_age?.trim() ||
      !variables.alive_gender?.trim() ||
      !variables.alive_ethnicity?.trim()
    )
    const deceasedMissing = needsDeceasedDemographicInputs && (
      !variables.deceased_age?.trim() ||
      !variables.deceased_gender?.trim() ||
      !variables.deceased_ethnicity?.trim()
    )
    return aliveMissing || deceasedMissing
  }, [shouldShowCharacterInputs, needsAliveDemographicInputs, needsDeceasedDemographicInputs, variables])

  const requiredMissing = useMemo(() => {
    return variablesSchema.some((field) => field.required && !variables[field.name]?.trim())
  }, [variablesSchema, variables])
  const selfieMissing = hasSelfieSlide && !variables.selfie_url
  const personaMissing = accountType === 'persona' && !selectedPersonaId

  const accountTypeOptions = useMemo(() => {
    if (!template) return ['business', 'persona'] as AccountType[]
    if (template.account_type === 'both') return ['business', 'persona'] as AccountType[]
    return [template.account_type] as AccountType[]
  }, [template])

  useEffect(() => {
    if (!accountTypeOptions.includes(accountType)) {
      setAccountType(accountTypeOptions[0] || 'business')
    }
  }, [accountTypeOptions, accountType])

  useEffect(() => {
    const defaultLivePhotoOrders = livePhotoSlides
      .filter((slide) => slide.live_photo_default ?? true)
      .map((slide) => slide.order)
      .filter((order): order is number => typeof order === 'number')

    setSelectedLivePhotoSlideOrders(defaultLivePhotoOrders)
  }, [livePhotoSlides])

  const handleUploadPhoto = async (fieldName: string, file: File) => {
    setUploadingField(fieldName)
    setError(null)
    try {
      const formData = new FormData()
      formData.append('file', file)

      const res = await fetch('/api/admin/social/templates/upload-photo', {
        method: 'POST',
        body: formData,
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data?.error || 'Photo upload failed')
      }

      setVariables((prev) => ({ ...prev, [fieldName]: data.url }))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Photo upload failed')
    } finally {
      setUploadingField(null)
    }
  }

  const handleGenerateSelfie = async () => {
    setIsGeneratingSelfie(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/social/generate-selfie', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          age: selfieAge,
          gender: selfieGender,
          ethnicity: selfieEthnicity,
          angle: selfieAngle,
          emotion: selfieEmotion,
          gaze: selfieGaze,
          setting: selfieSetting,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data?.error || 'Failed to generate selfie')
      }
      setVariables((prev) => ({ ...prev, selfie_url: data.selfieUrl }))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate selfie')
    } finally {
      setIsGeneratingSelfie(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!template) return
    if (requiredMissing || selfieMissing || personaMissing || demographicsMissing) {
      setError('Please fill all required fields.')
      return
    }

    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/social/generate-from-template', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          template_id: template.id,
          account_type: accountType,
          persona_id: accountType === 'persona' ? selectedPersonaId : undefined,
          variables,
          live_photo_slide_orders: selectedLivePhotoSlideOrders,
        }),
      })

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data?.error || 'Generation failed')
      }

      if (!data.post_id) {
        throw new Error('Generation response missing post_id')
      }

      router.push(`/admin/social/evergreen/${data.post_id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generation failed')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return <div className="p-6 lg:p-8 text-gray-400">Loading template...</div>
  }

  if (!template) {
    return <div className="p-6 lg:p-8 text-red-400">Template not found.</div>
  }

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <div>
        <Link
          href="/admin/social/templates"
          className="text-gray-400 hover:text-white text-sm flex items-center gap-1 mb-2"
        >
          ← Back to Template Gallery
        </Link>
        <h1 className="text-3xl font-bold text-white">{template.name}</h1>
        <p className="text-gray-400 mt-1">{template.description || 'Generate a post from this template.'}</p>
        <Link href={`/admin/social/templates/${template.id}/edit`} className="inline-flex mt-3 text-sm text-amber-300 hover:text-amber-200">
          Edit template details →
        </Link>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_320px] gap-6 items-start">
        <form onSubmit={handleSubmit} className="bg-[#1a1f2e] rounded-2xl p-6 border border-gray-800/50 space-y-5">
          <div>
            <label className="block text-sm text-gray-400 mb-2">Account Type</label>
            <select
              value={accountType}
              onChange={(e) => setAccountType(e.target.value as AccountType)}
              className="w-full max-w-xs px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-amber-400"
            >
              {accountTypeOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>

          {accountType === 'persona' && (
            <div>
              <label className="block text-sm text-gray-300 mb-2">
                Persona <span className="text-amber-300">*</span>
              </label>
              <select
                value={selectedPersonaId}
                onChange={(e) => setSelectedPersonaId(e.target.value)}
                disabled={loadingPersonas}
                className="w-full max-w-xs px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-amber-400 disabled:opacity-60"
              >
                <option value="">
                  {loadingPersonas ? 'Loading personas...' : 'Choose a persona...'}
                </option>
                {personas.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {template.live_photo_supported && livePhotoSlides.length > 0 && (
          <div className="border border-gray-700/60 rounded-xl p-4 space-y-2">
            <h2 className="text-white font-semibold">Live Photo Slides</h2>
            {livePhotoSlides.map((slide, index) => (
              <label
                key={`${slide.order || index}-${slide.slide_type || 'slide'}`}
                className="flex items-center gap-3 cursor-pointer text-sm text-gray-200"
              >
                <input
                  type="checkbox"
                  checked={typeof slide.order === 'number' && selectedLivePhotoSlideOrders.includes(slide.order)}
                  onChange={(e) => {
                    if (typeof slide.order !== 'number') return
                    setSelectedLivePhotoSlideOrders((prev) => (
                      e.target.checked
                        ? [...new Set([...prev, slide.order as number])]
                        : prev.filter((order) => order !== slide.order)
                    ))
                  }}
                  className="w-4 h-4 rounded bg-gray-700 border-gray-600 text-amber-500 focus:ring-amber-500"
                />
                <span>
                  Slide {slide.order || index + 1} ({slide.slide_type || 'unknown'}) — animate with {slide.motion_style || 'ai_subtle'} motion
                </span>
              </label>
            ))}
          </div>
          )}

          {hasSelfieSlide && (
          <div className="border border-gray-700/60 rounded-xl p-4 space-y-3">
            <h2 className="text-white font-semibold">Generate Selfie (Slide 1)</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <input type="number" min={18} max={80} value={selfieAge} onChange={(e) => setSelfieAge(Number(e.target.value))} className="px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white" />
              <select value={selfieGender} onChange={(e) => setSelfieGender(e.target.value as SelfieGender)} className="px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white">
                <option value="male">Male</option>
                <option value="female">Female</option>
              </select>
              <select value={selfieEthnicity} onChange={(e) => setSelfieEthnicity(e.target.value as SelfieEthnicity)} className="px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white">
                {ETHNICITIES.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
              </select>
              <select value={selfieAngle} onChange={(e) => setSelfieAngle(e.target.value as SelfieAngle)} className="px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white">
                {ANGLES.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
              </select>
              <select value={selfieEmotion} onChange={(e) => setSelfieEmotion(e.target.value as SelfieEmotion)} className="px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white">
                {EMOTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
              </select>
              <select value={selfieGaze} onChange={(e) => setSelfieGaze(e.target.value as SelfieGaze)} className="px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white">
                {GAZES.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
              </select>
            </div>
            <select value={selfieSetting} onChange={(e) => setSelfieSetting(e.target.value as SelfieSetting)} className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white">
              {SETTINGS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
            </select>
            <button type="button" onClick={handleGenerateSelfie} disabled={isGeneratingSelfie} className={`px-4 py-2 rounded-lg font-medium ${isGeneratingSelfie ? 'bg-gray-700 text-gray-500' : 'bg-purple-600 text-white hover:bg-purple-500'}`}>
              {isGeneratingSelfie ? 'Generating Selfie...' : variables.selfie_url ? 'Regenerate Selfie' : 'Generate Selfie'}
            </button>
            {variables.selfie_url && <p className="text-xs text-green-300 break-all">Selfie URL set.</p>}
          </div>
          )}

          {shouldShowCharacterInputs && (
          <div className="border border-gray-700/60 rounded-xl p-4 space-y-4">
            <h2 className="text-white font-semibold">Character Demographics</h2>

            {needsAliveDemographicInputs && (
              <div className="space-y-3">
                <h3 className="text-sm font-medium text-amber-300">Alive Person</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <select
                    value={variables.alive_age || ''}
                    onChange={(e) => setVariables((prev) => ({ ...prev, alive_age: e.target.value }))}
                    className="px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"
                  >
                    <option value="">Select age...</option>
                    {CHARACTER_AGE_OPTIONS.map((option) => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                  <select
                    value={variables.alive_gender || ''}
                    onChange={(e) => setVariables((prev) => ({ ...prev, alive_gender: e.target.value }))}
                    className="px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"
                  >
                    <option value="">Select gender...</option>
                    {CHARACTER_GENDER_OPTIONS.map((option) => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                  <select
                    value={variables.alive_ethnicity || ''}
                    onChange={(e) => setVariables((prev) => ({ ...prev, alive_ethnicity: e.target.value }))}
                    className="px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"
                  >
                    <option value="">Select ethnicity...</option>
                    {CHARACTER_ETHNICITY_OPTIONS.map((option) => (
                      <option key={option} value={option}>{formatEthnicityLabel(option)}</option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            {needsDeceasedDemographicInputs && (
              <div className="space-y-3">
                <h3 className="text-sm font-medium text-amber-300">Deceased Person</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <select
                    value={variables.deceased_age || ''}
                    onChange={(e) => setVariables((prev) => ({ ...prev, deceased_age: e.target.value }))}
                    className="px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"
                  >
                    <option value="">Select age...</option>
                    {CHARACTER_AGE_OPTIONS.map((option) => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                  <select
                    value={variables.deceased_gender || ''}
                    onChange={(e) => setVariables((prev) => ({ ...prev, deceased_gender: e.target.value }))}
                    className="px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"
                  >
                    <option value="">Select gender...</option>
                    {CHARACTER_GENDER_OPTIONS.map((option) => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                  <select
                    value={variables.deceased_ethnicity || ''}
                    onChange={(e) => setVariables((prev) => ({ ...prev, deceased_ethnicity: e.target.value }))}
                    className="px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"
                  >
                    <option value="">Select ethnicity...</option>
                    {CHARACTER_ETHNICITY_OPTIONS.map((option) => (
                      <option key={option} value={option}>{formatEthnicityLabel(option)}</option>
                    ))}
                  </select>
                </div>
              </div>
            )}
          </div>
          )}

          {variablesSchema.map((field) => (
            <div key={field.name}>
            <label className="block text-sm text-gray-300 mb-2">
              {field.label}
              {field.required ? <span className="text-amber-300"> *</span> : null}
            </label>

            {field.type === 'text' && (
              <input
                type="text"
                value={variables[field.name] || ''}
                onChange={(e) => setVariables((prev) => ({ ...prev, [field.name]: e.target.value }))}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-amber-400"
              />
            )}

            {field.type === 'textarea' && (
              <textarea
                rows={3}
                value={variables[field.name] || ''}
                onChange={(e) => setVariables((prev) => ({ ...prev, [field.name]: e.target.value }))}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-amber-400"
              />
            )}

            {field.type === 'select' && (
              <select
                value={variables[field.name] || ''}
                onChange={(e) => setVariables((prev) => ({ ...prev, [field.name]: e.target.value }))}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-amber-400"
              >
                <option value="">Select...</option>
                {(field.options || []).map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            )}

            {field.type === 'photo_upload' && (
              <div className="space-y-2">
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/jpg,image/webp"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) {
                      void handleUploadPhoto(field.name, file)
                    }
                  }}
                  className="w-full text-sm text-gray-300 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:bg-amber-500/20 file:text-amber-300 hover:file:bg-amber-500/30"
                />
                {uploadingField === field.name && (
                  <p className="text-sm text-amber-300">Uploading photo...</p>
                )}
                {variables[field.name] && (
                  <p className="text-xs text-green-300 break-all">Uploaded: {variables[field.name]}</p>
                )}
              </div>
            )}
            </div>
          ))}

          {error && <p className="text-red-400 text-sm">{error}</p>}

          <button
            type="submit"
            disabled={submitting || requiredMissing || selfieMissing || personaMissing || demographicsMissing || !!uploadingField}
            className={`w-full py-3 rounded-xl font-semibold transition-all ${
              !submitting && !requiredMissing && !demographicsMissing && !uploadingField
                ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-white hover:from-amber-400 hover:to-orange-400'
                : 'bg-gray-700 text-gray-500 cursor-not-allowed'
            }`}
          >
            {submitting ? 'Generating Post...' : 'Generate Post'}
          </button>
        </form>

        <div className="xl:sticky xl:top-6">
          <ReferencePanel
            templateId={template.id}
            referenceVideoUrl={template.reference_video_url}
            referencePhotos={template.reference_photos}
            audioTrackUrl={template.audio_track_url}
          />
        </div>
      </div>
    </div>
  )
}
