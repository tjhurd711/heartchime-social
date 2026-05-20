'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'

type AccountType = 'business' | 'persona'
type FieldType = 'text' | 'textarea' | 'select' | 'photo_upload'

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
  variables_schema: VariableField[] | null
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

  const variablesSchema = useMemo(() => template?.variables_schema || [], [template])

  const requiredMissing = useMemo(() => {
    return variablesSchema.some((field) => field.required && !variables[field.name]?.trim())
  }, [variablesSchema, variables])

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!template) return
    if (requiredMissing) {
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
          variables,
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
      </div>

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
          disabled={submitting || requiredMissing || !!uploadingField}
          className={`w-full py-3 rounded-xl font-semibold transition-all ${
            !submitting && !requiredMissing && !uploadingField
              ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-white hover:from-amber-400 hover:to-orange-400'
              : 'bg-gray-700 text-gray-500 cursor-not-allowed'
          }`}
        >
          {submitting ? 'Generating Post...' : 'Generate Post'}
        </button>
      </form>
    </div>
  )
}
