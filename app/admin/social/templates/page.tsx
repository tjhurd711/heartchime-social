'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

interface TemplateCard {
  id: string
  name: string
  category: 'evergreen' | 'trend'
  account_type: 'business' | 'persona' | 'both'
  slide_count: number
  description: string | null
}

function categoryStyles(category: TemplateCard['category']) {
  if (category === 'evergreen') {
    return 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
  }
  return 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
}

function accountTypeStyles(accountType: TemplateCard['account_type']) {
  if (accountType === 'business') return 'bg-blue-500/20 text-blue-300'
  if (accountType === 'persona') return 'bg-pink-500/20 text-pink-300'
  return 'bg-slate-500/20 text-slate-300'
}

export default function TemplatesGalleryPage() {
  const [templates, setTemplates] = useState<TemplateCard[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const loadTemplates = async () => {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch('/api/admin/social/templates')
        const data = await res.json()
        if (!res.ok) {
          throw new Error(data?.error || 'Failed to fetch templates')
        }
        setTemplates(data)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch templates')
      } finally {
        setLoading(false)
      }
    }

    loadTemplates()
  }, [])

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <div>
        <Link
          href="/admin/social"
          className="text-gray-400 hover:text-white text-sm flex items-center gap-1 mb-2"
        >
          ← Back to Social Dashboard
        </Link>
        <h1 className="text-3xl font-bold text-white">Template Gallery</h1>
        <p className="text-gray-400 mt-1">Pick a template to generate a post with dynamic variables</p>
      </div>

      {loading ? (
        <div className="text-gray-400">Loading templates...</div>
      ) : error ? (
        <div className="text-red-400">{error}</div>
      ) : templates.length === 0 ? (
        <div className="text-gray-400">No active templates found.</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {templates.map((template) => (
            <Link
              key={template.id}
              href={`/admin/social/templates/${template.id}/generate`}
              className="bg-[#1a1f2e] rounded-2xl p-5 border border-gray-800/50 hover:border-amber-400/40 transition-all"
            >
              <div className="flex items-start justify-between gap-3 mb-3">
                <h2 className="text-white font-bold text-lg leading-tight">{template.name}</h2>
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${categoryStyles(template.category)}`}>
                  {template.category}
                </span>
              </div>

              <div className="flex items-center gap-2 mb-3">
                <span className={`px-2 py-1 rounded text-xs font-medium ${accountTypeStyles(template.account_type)}`}>
                  {template.account_type}
                </span>
                <span className="text-gray-400 text-xs">{template.slide_count} slides</span>
              </div>

              <p className="text-sm text-gray-400">
                {template.description || 'No description provided.'}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
