'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import ReferencePanel, { TemplateReferencePhoto } from '../../_components/reference-panel'

type AccountType = 'business' | 'persona'
type FieldType = 'text' | 'textarea' | 'select' | 'photo_upload' | 'select_with_custom'
type CharacterKey = 'alive' | 'deceased'
type SelfieGender = 'male' | 'female'
type SelfieEthnicity = 'white' | 'black' | 'hispanic' | 'asian' | 'middle eastern' | 'south asian' | 'mixed'
type SelfieAngle = 'from below' | 'straight on' | 'from above' | 'side tilt'
type SelfieEmotion = 'neutral' | 'slight smile' | 'bittersweet' | 'sad' | 'hopeful' | 'tired' | 'peaceful'
type SelfieGaze = 'looking at camera' | 'looking away' | 'eyes down' | 'looking off to side'
type SelfieSetting = 'home' | 'car' | 'outside' | 'office'

const DEPRECATED_TEMPLATE_VARIABLES = new Set(['deceased_photo_url'])
type MotionStyle = 'ai_subtle' | 'kenburns' | 'static_hold'
type LivePhotoOutputOrientation = 'vertical' | 'horizontal'
type LivePhotoFramingMode = 'fill' | 'fit' | 'blur' | 'contain'
type LivePhotoFramingChoice = 'vertical_fill' | 'landscape_fit'
type SubjectStatus = 'alive' | 'deceased'
type SubjectGender = 'male' | 'female'
type SubjectRelationship =
  | 'father'
  | 'mother'
  | 'son'
  | 'daughter'
  | 'husband'
  | 'wife'
  | 'brother'
  | 'sister'
  | 'grandfather'
  | 'grandmother'
  | 'grandson'
  | 'granddaughter'
  | 'friend'
  | 'self'
type TemplateVariableValue = string | PhotoSubject[] | undefined

interface PhotoSubject {
  age_decade: string
  gender: SubjectGender
  ethnicity: string
  status: SubjectStatus
  relationship: SubjectRelationship
}

interface SubjectsConfig {
  enabled: boolean
  min: number
  max: number
  require_one_deceased: boolean
}

interface VariableField {
  name: string
  label: string
  type: FieldType
  required: boolean
  options?: string[]
}

const CUSTOM_OPTION_VALUE = '__custom__'

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
    prompt_recipe?: string
    characters?: CharacterKey[]
    motion_hint?: string
    motion_style?: MotionStyle
    live_photo_eligible?: boolean
    live_photo_default?: boolean
    live_photo_output_orientation?: LivePhotoOutputOrientation
    live_photo_framing_mode?: LivePhotoFramingMode
    subjects_config?: SubjectsConfig
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
const SUBJECT_AGE_OPTIONS = ['0-12', 'teens', '20s', '30s', '40s', '50s', '60s', '70s', '80s', '90s']
const SUBJECT_RELATIONSHIP_OPTIONS: SubjectRelationship[] = [
  'father',
  'mother',
  'son',
  'daughter',
  'husband',
  'wife',
  'brother',
  'sister',
  'grandfather',
  'grandmother',
  'grandson',
  'granddaughter',
  'friend',
  'self',
]

const LIVE_PHOTO_FRAMING_OPTIONS: Array<{ value: LivePhotoFramingChoice; label: string; description: string }> = [
  {
    value: 'vertical_fill',
    label: 'Vertical photo - fill screen',
    description: 'Best for 9:16 images. Crops if the source is horizontal.',
  },
  {
    value: 'landscape_fit',
    label: 'Landscape photo - fit full photo',
    description: 'Best for horizontal images. Keeps the full image inside the iPhone frame.',
  },
]
const HEADSTONE_MEMORIAL_TYPES = new Set(['headstone_classic', 'headstone_rounded', 'headstone_flat'])
const SAILOR_SONG_HARDCODED_NOTE_LINES = {
  note_line_1: 'I sleep so I can see you',
  note_line_2: "'cause I hate to wait so long",
  note_line_3: 'I sleep so that I can see you',
  note_line_4: 'and I hate to wait so long',
} as const

function formatEthnicityLabel(value: string): string {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase())
}

function getStringVariable(variables: Record<string, TemplateVariableValue>, name: string): string {
  const value = variables[name]
  return typeof value === 'string' ? value : ''
}

function createDefaultSubject(index: number): PhotoSubject {
  return {
    age_decade: index === 0 ? '30s' : '0-12',
    gender: index === 0 ? 'male' : 'female',
    ethnicity: 'white',
    status: index === 0 ? 'deceased' : 'alive',
    relationship: index === 0 ? 'father' : 'daughter',
  }
}

function parseSelectedSubjectIndexes(value: string): number[] {
  return value
    .split(',')
    .map((index) => Number.parseInt(index.trim(), 10))
    .filter((index) => !Number.isNaN(index))
}

function serializeSelectedSubjectIndexes(indexes: number[]): string {
  return [...new Set(indexes)].sort((a, b) => a - b).join(',')
}

function getDefaultLivePhotoFramingChoice(slide: NonNullable<Template['slides']>[number]): LivePhotoFramingChoice {
  return slide.live_photo_framing_mode === 'fit' || slide.live_photo_framing_mode === 'contain' ? 'landscape_fit' : 'vertical_fill'
}

function getLivePhotoSettings(choice: LivePhotoFramingChoice): {
  output_orientation: LivePhotoOutputOrientation
  framing_mode: Exclude<LivePhotoFramingMode, 'contain'>
} {
  if (choice === 'landscape_fit') {
    return {
      output_orientation: 'vertical',
      framing_mode: 'fit',
    }
  }

  return {
    output_orientation: 'vertical',
    framing_mode: 'fill',
  }
}

function shouldShowVariableField(fieldName: string, variables: Record<string, TemplateVariableValue>): boolean {
  const includeMemorialSlide = getStringVariable(variables, 'include_memorial_slide') === 'yes'
  const memorialFieldNames = new Set([
    'memorial_scene_type',
    'memorial_location',
    'memorial_camera_angle',
    'memorial_camera_distance',
    'memorial_inscription',
    'memorial_headstone_flower_design',
    'memorial_urn_color',
    'memorial_keepsake',
  ])
  if (memorialFieldNames.has(fieldName) && !includeMemorialSlide) {
    return false
  }

  const memorialSceneType = getStringVariable(variables, 'memorial_scene_type')
  const isHeadstoneMemorial = HEADSTONE_MEMORIAL_TYPES.has(memorialSceneType)
  const isKnownMemorialScene = isHeadstoneMemorial || memorialSceneType === 'urn' || memorialSceneType === 'bouquet'

  if (fieldName === 'memorial_location') {
    return isKnownMemorialScene && !isHeadstoneMemorial
  }

  if (fieldName === 'memorial_camera_angle') {
    return isKnownMemorialScene
  }

  if (fieldName === 'memorial_camera_distance') {
    return isKnownMemorialScene
  }

  if (fieldName === 'memorial_inscription') {
    return isHeadstoneMemorial
  }

  if (fieldName === 'memorial_headstone_flower_design') {
    return isHeadstoneMemorial
  }

  if (fieldName === 'memorial_urn_color') {
    return memorialSceneType === 'urn'
  }

  if (fieldName === 'memorial_keepsake') {
    return isHeadstoneMemorial || memorialSceneType === 'bouquet'
  }

  return true
}

function formatTemplateOptionLabel(fieldName: string, option: string): string {
  if (fieldName === 'memorial_location' && option === 'shelf') {
    return 'Shelf / mantel'
  }

  return option
}

function isCustomSelectValue(field: VariableField, currentValue: string): boolean {
  if (!currentValue.trim()) {
    return false
  }

  const options = field.options || []
  return !options.includes(currentValue)
}

export default function GenerateFromTemplatePage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const templateId = params.id

  const [template, setTemplate] = useState<Template | null>(null)
  const [variables, setVariables] = useState<Record<string, TemplateVariableValue>>({})
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
  const [livePhotoFramingChoices, setLivePhotoFramingChoices] = useState<Record<number, LivePhotoFramingChoice>>({})
  const [selfieAge, setSelfieAge] = useState(35)
  const [selfieGender, setSelfieGender] = useState<SelfieGender>('female')
  const [selfieEthnicity, setSelfieEthnicity] = useState<SelfieEthnicity>('white')
  const [selfieAngle, setSelfieAngle] = useState<SelfieAngle>('straight on')
  const [selfieEmotion, setSelfieEmotion] = useState<SelfieEmotion>('bittersweet')
  const [selfieGaze, setSelfieGaze] = useState<SelfieGaze>('looking at camera')
  const [selfieSetting, setSelfieSetting] = useState<SelfieSetting>('home')
  const [customSelectEnabled, setCustomSelectEnabled] = useState<Record<string, boolean>>({})

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
  const isSailorSongTemplate = template?.name === 'Sailor Song'
  const getResolvedVariableValue = (name: string): string => {
    if (
      isSailorSongTemplate &&
      Object.prototype.hasOwnProperty.call(SAILOR_SONG_HARDCODED_NOTE_LINES, name)
    ) {
      return SAILOR_SONG_HARDCODED_NOTE_LINES[name as keyof typeof SAILOR_SONG_HARDCODED_NOTE_LINES]
    }
    return getStringVariable(variables, name)
  }
  const schemaFieldNames = useMemo(() => new Set(variablesSchema.map((field) => field.name)), [variablesSchema])
  const subjectSlides = useMemo(
    () => (template?.slides || []).filter((slide) => slide.subjects_config?.enabled === true),
    [template]
  )
  const subjectDrivenDemographicFields = useMemo(() => {
    const fields = new Set<string>()
    for (const slide of subjectSlides) {
      for (const character of slide.characters || []) {
        fields.add(`${character}_age`)
        fields.add(`${character}_gender`)
        fields.add(`${character}_ethnicity`)
      }
    }
    return fields
  }, [subjectSlides])
  const visibleVariablesSchema = useMemo(
    () => variablesSchema.filter((field) => (
      !DEPRECATED_TEMPLATE_VARIABLES.has(field.name) &&
      !subjectDrivenDemographicFields.has(field.name) &&
      shouldShowVariableField(field.name, variables)
    )),
    [variablesSchema, subjectDrivenDemographicFields, variables]
  )
  const livePhotoSlides = useMemo(
    () => (template?.slides || []).filter((slide) => slide.live_photo_eligible === true),
    [template]
  )
  const memorialAttendeeSlides = useMemo(
    () => (template?.slides || []).filter((slide) => (
      typeof slide.order === 'number' &&
      typeof slide.prompt_recipe === 'string' &&
      slide.prompt_recipe.includes('{memorial_attendees_description}')
    )),
    [template]
  )
  const hasSelfieSlide = useMemo(
    () => !!template?.slides?.some((slide) => slide?.slide_type === 'selfie'),
    [template]
  )
  const needsAliveDemographics = useMemo(
    () => !!template?.slides?.some((slide) => !slide.subjects_config?.enabled && (slide?.characters || []).includes('alive')),
    [template]
  )
  const needsDeceasedDemographics = useMemo(
    () => !!template?.slides?.some((slide) => !slide.subjects_config?.enabled && (slide?.characters || []).includes('deceased')),
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
      !getStringVariable(variables, 'alive_age').trim() ||
      !getStringVariable(variables, 'alive_gender').trim() ||
      !getStringVariable(variables, 'alive_ethnicity').trim()
    )
    const deceasedMissing = needsDeceasedDemographicInputs && (
      !getStringVariable(variables, 'deceased_age').trim() ||
      !getStringVariable(variables, 'deceased_gender').trim() ||
      !getStringVariable(variables, 'deceased_ethnicity').trim()
    )
    return aliveMissing || deceasedMissing
  }, [shouldShowCharacterInputs, needsAliveDemographicInputs, needsDeceasedDemographicInputs, variables])

  const requiredMissing = useMemo(() => {
    return visibleVariablesSchema.some((field) => field.required && !getResolvedVariableValue(field.name).trim())
  }, [visibleVariablesSchema, variables, isSailorSongTemplate])
  const subjectsMissing = useMemo(() => {
    return subjectSlides.some((slide) => {
      const config = slide.subjects_config
      const subjects = variables[`slide_${slide.order}_subjects`]
      if (!config?.enabled || !Array.isArray(subjects)) return true
      if (subjects.length < config.min || subjects.length > config.max) return true
      if (config.require_one_deceased && subjects.filter((subject) => subject.status === 'deceased').length !== 1) return true
      return subjects.some((subject) => (
        !subject.age_decade ||
        !subject.gender ||
        !subject.ethnicity ||
        !subject.status ||
        !subject.relationship
      ))
    })
  }, [subjectSlides, variables])
  const selfieMissing = hasSelfieSlide && !getStringVariable(variables, 'selfie_url')
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
    const memorialSceneType = getStringVariable(variables, 'memorial_scene_type')
    if (!HEADSTONE_MEMORIAL_TYPES.has(memorialSceneType)) return
    if (getStringVariable(variables, 'memorial_location') === 'cemetery') return

    setVariables((prev) => ({ ...prev, memorial_location: 'cemetery' }))
  }, [variables])

  useEffect(() => {
    const defaultLivePhotoOrders = livePhotoSlides
      .filter((slide) => slide.live_photo_default ?? true)
      .map((slide) => slide.order)
      .filter((order): order is number => typeof order === 'number')

    setSelectedLivePhotoSlideOrders(defaultLivePhotoOrders)
    setLivePhotoFramingChoices((prev) => {
      const next: Record<number, LivePhotoFramingChoice> = {}

      for (const slide of livePhotoSlides) {
        if (typeof slide.order !== 'number') continue
        next[slide.order] = prev[slide.order] ?? getDefaultLivePhotoFramingChoice(slide)
      }

      return next
    })
  }, [livePhotoSlides])

  useEffect(() => {
    if (subjectSlides.length === 0) return

    setVariables((prev) => {
      const next = { ...prev }
      let changed = false

      for (const slide of subjectSlides) {
        if (typeof slide.order !== 'number') continue

        const key = `slide_${slide.order}_subjects`
        if (Array.isArray(next[key])) continue

        const count = slide.subjects_config?.min || 1
        next[key] = Array.from({ length: count }, (_item, index) => createDefaultSubject(index))
        changed = true
      }

      return changed ? next : prev
    })
  }, [subjectSlides])

  useEffect(() => {
    if (!isSailorSongTemplate) return

    setVariables((prev) => {
      const next = { ...prev }
      let changed = false

      for (const [key, value] of Object.entries(SAILOR_SONG_HARDCODED_NOTE_LINES)) {
        if (next[key] === value) continue
        next[key] = value
        changed = true
      }

      return changed ? next : prev
    })
  }, [isSailorSongTemplate])

  useEffect(() => {
    if (memorialAttendeeSlides.length === 0) return

    setVariables((prev) => {
      const next = { ...prev }
      let changed = false
      const slideOneSubjects: PhotoSubject[] = Array.isArray(next.slide_1_subjects) ? next.slide_1_subjects : []
      const eligibleIndexes = new Set(
        slideOneSubjects
          .map((subject, index) => ({ subject, index }))
          .filter(({ subject }) => subject.status !== 'deceased')
          .map(({ index }) => index)
      )

      for (const slide of memorialAttendeeSlides) {
        if (typeof slide.order !== 'number') continue

        const key = `slide_${slide.order}_memorial_attendee_indices`
        const currentValue = getStringVariable(next, key)
        if (!Object.prototype.hasOwnProperty.call(next, key)) {
          next[key] = ''
          changed = true
          continue
        }

        if (!currentValue) continue

        const validIndexes = parseSelectedSubjectIndexes(currentValue).filter((index) => eligibleIndexes.has(index))
        const nextValue = serializeSelectedSubjectIndexes(validIndexes)
        if (nextValue !== currentValue) {
          next[key] = nextValue
          changed = true
        }
      }

      return changed ? next : prev
    })
  }, [memorialAttendeeSlides, variables.slide_1_subjects])

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

  const setSubjectCount = (slideOrder: number, count: number) => {
    const key = `slide_${slideOrder}_subjects`
    setVariables((prev) => {
      const current: PhotoSubject[] = Array.isArray(prev[key]) ? prev[key] : []
      const nextSubjects: PhotoSubject[] = Array.from({ length: count }, (_item, index) => current[index] || createDefaultSubject(index))
      const hasDeceased = nextSubjects.some((subject) => subject.status === 'deceased')
      if (!hasDeceased && nextSubjects[0]) {
        nextSubjects[0] = { ...nextSubjects[0], status: 'deceased' }
      }
      return { ...prev, [key]: nextSubjects }
    })
  }

  const updateSubject = (
    slideOrder: number,
    subjectIndex: number,
    field: keyof PhotoSubject,
    value: PhotoSubject[keyof PhotoSubject],
    requireOneDeceased: boolean
  ) => {
    const key = `slide_${slideOrder}_subjects`
    setVariables((prev) => {
      const current: PhotoSubject[] = Array.isArray(prev[key]) ? prev[key] : [createDefaultSubject(0)]
      const nextSubjects: PhotoSubject[] = current.map((subject, index) => {
        if (field === 'status' && value === 'deceased' && requireOneDeceased) {
          return {
            ...subject,
            status: index === subjectIndex ? 'deceased' : 'alive',
          }
        }

        if (index !== subjectIndex) {
          return subject
        }

        if (field === 'status' && value === 'alive' && requireOneDeceased) {
          const deceasedCount = current.filter((item) => item.status === 'deceased').length
          if (subject.status === 'deceased' && deceasedCount === 1) {
            return subject
          }
        }

        return { ...subject, [field]: value }
      })

      return { ...prev, [key]: nextSubjects }
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!template) return
    if (requiredMissing || selfieMissing || personaMissing || demographicsMissing || subjectsMissing) {
      setError('Please fill all required fields.')
      return
    }

    setSubmitting(true)
    setError(null)
    try {
      const livePhotoSettings = selectedLivePhotoSlideOrders.reduce<Record<string, ReturnType<typeof getLivePhotoSettings>>>((settings, order) => {
        settings[String(order)] = getLivePhotoSettings(livePhotoFramingChoices[order] ?? 'vertical_fill')
        return settings
      }, {})

      const res = await fetch('/api/admin/social/generate-from-template', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          template_id: template.id,
          account_type: accountType,
          persona_id: accountType === 'persona' ? selectedPersonaId : undefined,
          variables,
          live_photo_slide_orders: selectedLivePhotoSlideOrders,
          live_photo_settings: livePhotoSettings,
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
          <div className="border border-gray-700/60 rounded-xl p-4 space-y-3">
            <h2 className="text-white font-semibold">Live Photo Slides</h2>
            <p className="text-xs text-gray-400">
              Choose which slides should become Live Photos, then pick whether the source photo is vertical or landscape.
            </p>
            <div className="space-y-3">
              {livePhotoSlides.map((slide, index) => {
                const order = slide.order
                const isSelected = typeof order === 'number' && selectedLivePhotoSlideOrders.includes(order)
                const framingChoice = typeof order === 'number'
                  ? livePhotoFramingChoices[order] ?? getDefaultLivePhotoFramingChoice(slide)
                  : 'vertical_fill'
                const selectedOption = LIVE_PHOTO_FRAMING_OPTIONS.find((option) => option.value === framingChoice)

                return (
                  <div
                    key={`${slide.order || index}-${slide.slide_type || 'slide'}`}
                    className="rounded-lg border border-gray-700/50 bg-gray-900/30 p-3 space-y-2"
                  >
                    <label className="flex items-center gap-3 cursor-pointer text-sm text-gray-200">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={(e) => {
                          if (typeof order !== 'number') return
                          setSelectedLivePhotoSlideOrders((prev) => (
                            e.target.checked
                              ? [...new Set([...prev, order])]
                              : prev.filter((selectedOrder) => selectedOrder !== order)
                          ))
                          setLivePhotoFramingChoices((prev) => ({
                            ...prev,
                            [order]: prev[order] ?? getDefaultLivePhotoFramingChoice(slide),
                          }))
                        }}
                        className="w-4 h-4 rounded bg-gray-700 border-gray-600 text-amber-500 focus:ring-amber-500"
                      />
                      <span>
                        Slide {order || index + 1} — make this photo a Live Photo
                      </span>
                    </label>

                    {isSelected && typeof order === 'number' && (
                      <div className="pl-7 space-y-1">
                        <label className="block text-xs text-gray-400">Source photo shape</label>
                        <select
                          value={framingChoice}
                          onChange={(e) => {
                            setLivePhotoFramingChoices((prev) => ({
                              ...prev,
                              [order]: e.target.value as LivePhotoFramingChoice,
                            }))
                          }}
                          className="w-full max-w-md px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-amber-400"
                        >
                          {LIVE_PHOTO_FRAMING_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                        {selectedOption && (
                          <p className="text-xs text-gray-500">{selectedOption.description}</p>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
          )}

          {subjectSlides.map((slide) => {
            if (typeof slide.order !== 'number' || !slide.subjects_config?.enabled) return null

            const config = slide.subjects_config
            const subjectsKey = `slide_${slide.order}_subjects`
            const subjects = Array.isArray(variables[subjectsKey])
              ? variables[subjectsKey]
              : []
            const counts = Array.from({ length: config.max - config.min + 1 }, (_item, index) => config.min + index)

            return (
              <div key={subjectsKey} className="border border-gray-700/60 rounded-xl p-4 space-y-4">
                <div>
                  <h2 className="text-white font-semibold">People in this photo</h2>
                  <p className="text-xs text-gray-400 mt-1">Slide {slide.order} can include {config.min}-{config.max} people.</p>
                </div>

                <div className="flex gap-2">
                  {counts.map((count) => (
                    <button
                      key={count}
                      type="button"
                      onClick={() => setSubjectCount(slide.order as number, count)}
                      className={`px-3 py-1 rounded-full text-sm font-medium ${
                        subjects.length === count
                          ? 'bg-amber-500 text-white'
                          : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                      }`}
                    >
                      {count}
                    </button>
                  ))}
                </div>

                <div className="space-y-4">
                  {subjects.map((subject, subjectIndex) => (
                    <div key={`${subjectsKey}-${subjectIndex}`} className="rounded-xl bg-gray-800/70 border border-gray-700/60 p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-medium text-amber-300">Person {subjectIndex + 1}</h3>
                        <div className="flex gap-3 text-xs text-gray-300">
                          {(['alive', 'deceased'] as SubjectStatus[]).map((status) => (
                            <label key={status} className="flex items-center gap-1 cursor-pointer">
                              <input
                                type="radio"
                                name={`${subjectsKey}-${subjectIndex}-status`}
                                checked={subject.status === status}
                                onChange={() => updateSubject(slide.order as number, subjectIndex, 'status', status, config.require_one_deceased)}
                                className="text-amber-500 focus:ring-amber-500"
                              />
                              {status}
                            </label>
                          ))}
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <select
                          value={subject.age_decade}
                          onChange={(e) => updateSubject(slide.order as number, subjectIndex, 'age_decade', e.target.value, config.require_one_deceased)}
                          className="px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"
                        >
                          {SUBJECT_AGE_OPTIONS.map((option) => (
                            <option key={option} value={option}>{option}</option>
                          ))}
                        </select>

                        <select
                          value={subject.gender}
                          onChange={(e) => updateSubject(slide.order as number, subjectIndex, 'gender', e.target.value as SubjectGender, config.require_one_deceased)}
                          className="px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"
                        >
                          <option value="male">Male</option>
                          <option value="female">Female</option>
                        </select>

                        <select
                          value={subject.ethnicity}
                          onChange={(e) => updateSubject(slide.order as number, subjectIndex, 'ethnicity', e.target.value, config.require_one_deceased)}
                          className="px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"
                        >
                          {CHARACTER_ETHNICITY_OPTIONS.map((option) => (
                            <option key={option} value={option}>{formatEthnicityLabel(option)}</option>
                          ))}
                        </select>

                        <select
                          value={subject.relationship}
                          onChange={(e) => updateSubject(slide.order as number, subjectIndex, 'relationship', e.target.value as SubjectRelationship, config.require_one_deceased)}
                          className="px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"
                        >
                          {SUBJECT_RELATIONSHIP_OPTIONS.map((option) => (
                            <option key={option} value={option}>{formatEthnicityLabel(option)}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}

          {memorialAttendeeSlides.map((slide) => {
            if (typeof slide.order !== 'number') return null

            const key = `slide_${slide.order}_memorial_attendee_indices`
            const slideOneSubjects: PhotoSubject[] = Array.isArray(variables.slide_1_subjects) ? variables.slide_1_subjects : []
            const eligibleSubjects = slideOneSubjects
              .map((subject, index) => ({ subject, index }))
              .filter(({ subject }) => subject.status !== 'deceased')
            const selectedIndexes = parseSelectedSubjectIndexes(getStringVariable(variables, key))
            const selectedIndexSet = new Set(selectedIndexes)

            return (
              <div key={key} className="border border-gray-700/60 rounded-xl p-4 space-y-3">
                <div>
                  <h2 className="text-white font-semibold">People at Memorial</h2>
                  <p className="text-xs text-gray-400 mt-1">
                    Slide {slide.order} can include non-deceased people from Slide 1, always with faces hidden.
                  </p>
                </div>
                <div className="space-y-2">
                  <label className="flex items-center gap-3 cursor-pointer text-sm text-gray-200">
                    <input
                      type="checkbox"
                      checked={selectedIndexes.length === 0}
                      onChange={() => setVariables((prev) => ({ ...prev, [key]: '' }))}
                      className="w-4 h-4 rounded bg-gray-700 border-gray-600 text-amber-500 focus:ring-amber-500"
                    />
                    Nobody in memorial photo
                  </label>
                  {eligibleSubjects.map(({ subject, index }) => (
                    <label key={`${key}-${index}`} className="flex items-center gap-3 cursor-pointer text-sm text-gray-200">
                      <input
                        type="checkbox"
                        checked={selectedIndexSet.has(index)}
                        onChange={(e) => {
                          const nextIndexes = e.target.checked
                            ? [...selectedIndexes, index]
                            : selectedIndexes.filter((selectedIndex) => selectedIndex !== index)
                          setVariables((prev) => ({ ...prev, [key]: serializeSelectedSubjectIndexes(nextIndexes) }))
                        }}
                        className="w-4 h-4 rounded bg-gray-700 border-gray-600 text-amber-500 focus:ring-amber-500"
                      />
                      Person {index + 1}: {formatEthnicityLabel(subject.relationship)}, {subject.age_decade}, {formatEthnicityLabel(subject.ethnicity)}
                    </label>
                  ))}
                </div>
                {eligibleSubjects.length === 0 && (
                  <p className="text-xs text-gray-500">
                    Add an alive person to Slide 1 if you want someone to appear at the memorial.
                  </p>
                )}
              </div>
            )
          })}

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
              {isGeneratingSelfie ? 'Generating Selfie...' : getStringVariable(variables, 'selfie_url') ? 'Regenerate Selfie' : 'Generate Selfie'}
            </button>
            {getStringVariable(variables, 'selfie_url') && <p className="text-xs text-green-300 break-all">Selfie URL set.</p>}
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
                    value={getStringVariable(variables, 'alive_age')}
                    onChange={(e) => setVariables((prev) => ({ ...prev, alive_age: e.target.value }))}
                    className="px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"
                  >
                    <option value="">Select age...</option>
                    {CHARACTER_AGE_OPTIONS.map((option) => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                  <select
                    value={getStringVariable(variables, 'alive_gender')}
                    onChange={(e) => setVariables((prev) => ({ ...prev, alive_gender: e.target.value }))}
                    className="px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"
                  >
                    <option value="">Select gender...</option>
                    {CHARACTER_GENDER_OPTIONS.map((option) => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                  <select
                    value={getStringVariable(variables, 'alive_ethnicity')}
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
                    value={getStringVariable(variables, 'deceased_age')}
                    onChange={(e) => setVariables((prev) => ({ ...prev, deceased_age: e.target.value }))}
                    className="px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"
                  >
                    <option value="">Select age...</option>
                    {CHARACTER_AGE_OPTIONS.map((option) => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                  <select
                    value={getStringVariable(variables, 'deceased_gender')}
                    onChange={(e) => setVariables((prev) => ({ ...prev, deceased_gender: e.target.value }))}
                    className="px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"
                  >
                    <option value="">Select gender...</option>
                    {CHARACTER_GENDER_OPTIONS.map((option) => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                  <select
                    value={getStringVariable(variables, 'deceased_ethnicity')}
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

          {visibleVariablesSchema.map((field) => (
            <div key={field.name}>
            <label className="block text-sm text-gray-300 mb-2">
              {field.label}
              {field.required ? <span className="text-amber-300"> *</span> : null}
            </label>

            {field.type === 'text' && (
              <input
                type="text"
                value={getResolvedVariableValue(field.name)}
                onChange={(e) => {
                  if (
                    isSailorSongTemplate &&
                    Object.prototype.hasOwnProperty.call(SAILOR_SONG_HARDCODED_NOTE_LINES, field.name)
                  ) {
                    return
                  }
                  setVariables((prev) => ({ ...prev, [field.name]: e.target.value }))
                }}
                readOnly={
                  isSailorSongTemplate &&
                  Object.prototype.hasOwnProperty.call(SAILOR_SONG_HARDCODED_NOTE_LINES, field.name)
                }
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-amber-400 read-only:opacity-80 read-only:cursor-not-allowed"
              />
            )}

            {field.type === 'textarea' && (
              <textarea
                rows={3}
                value={getStringVariable(variables, field.name)}
                onChange={(e) => setVariables((prev) => ({ ...prev, [field.name]: e.target.value }))}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-amber-400"
              />
            )}

            {field.type === 'select' && (
              <select
                value={getStringVariable(variables, field.name)}
                onChange={(e) => setVariables((prev) => ({ ...prev, [field.name]: e.target.value }))}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-amber-400"
              >
                <option value="">Select...</option>
                {(field.options || []).map((option) => (
                  <option key={option} value={option}>
                    {formatTemplateOptionLabel(field.name, option)}
                  </option>
                ))}
              </select>
            )}

            {field.type === 'select_with_custom' && (
              <>
                {(() => {
                  const currentValue = getStringVariable(variables, field.name)
                  const hasStoredCustomValue = isCustomSelectValue(field, currentValue)
                  const isCustomMode = customSelectEnabled[field.name] ?? hasStoredCustomValue
                  const selectedValue = isCustomMode ? CUSTOM_OPTION_VALUE : currentValue

                  return (
                    <>
                      <select
                        value={selectedValue}
                        onChange={(e) => {
                          const nextValue = e.target.value
                          if (nextValue === CUSTOM_OPTION_VALUE) {
                            setCustomSelectEnabled((prev) => ({ ...prev, [field.name]: true }))
                            setVariables((prev) => {
                              const existingValue = getStringVariable(prev, field.name)
                              const nextCustomValue = isCustomSelectValue(field, existingValue) ? existingValue : ''
                              return { ...prev, [field.name]: nextCustomValue }
                            })
                            return
                          }
                          setCustomSelectEnabled((prev) => ({ ...prev, [field.name]: false }))
                          setVariables((prev) => ({ ...prev, [field.name]: nextValue }))
                        }}
                        className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-amber-400"
                      >
                        <option value="">Select...</option>
                        {(field.options || []).map((option) => (
                          <option key={option} value={option}>
                            {formatTemplateOptionLabel(field.name, option)}
                          </option>
                        ))}
                        <option value={CUSTOM_OPTION_VALUE}>Other...</option>
                      </select>
                      {isCustomMode && (
                        <input
                          type="text"
                          value={currentValue}
                          onChange={(e) => setVariables((prev) => ({ ...prev, [field.name]: e.target.value }))}
                          placeholder="Enter custom value..."
                          className="mt-2 w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-amber-400"
                        />
                      )}
                    </>
                  )
                })()}
              </>
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
                {getStringVariable(variables, field.name) && (
                  <p className="text-xs text-green-300 break-all">Uploaded: {getStringVariable(variables, field.name)}</p>
                )}
              </div>
            )}
            </div>
          ))}

          {error && <p className="text-red-400 text-sm">{error}</p>}

          <button
            type="submit"
            disabled={submitting || requiredMissing || selfieMissing || personaMissing || demographicsMissing || subjectsMissing || !!uploadingField}
            className={`w-full py-3 rounded-xl font-semibold transition-all ${
              !submitting && !requiredMissing && !demographicsMissing && !subjectsMissing && !uploadingField
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
