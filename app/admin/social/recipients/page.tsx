'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import type { Json } from '@/types/database.types'

// ===========================================
// TYPES
// ===========================================

type AgeRange = '20s' | '30s' | '40s' | '50s' | '60s' | '70s'
type Gender = 'male' | 'female'

interface PersonInfo {
  name: string
  age_range: AgeRange
  gender: Gender
  ethnicity: string
}

interface SocialRecipient {
  id: string
  name: string
  age_range: AgeRange
  gender: Gender
  ethnicity: string | null
  image_clean_url: string
  times_used: number
  last_used_at: string | null
  created_at: string
  updated_at: string
  person_count: number
  people: PersonInfo[] | null
}

interface RecipientFormData {
  name: string
  age_range: AgeRange
  gender: Gender
  ethnicity: string
  image_clean_url: string
  person_count: number
  people: PersonInfo[]
}

const AGE_RANGES: AgeRange[] = ['20s', '30s', '40s', '50s', '60s', '70s']
const GENDERS: Gender[] = ['male', 'female']
const ETHNICITIES = ['White', 'Black', 'Hispanic', 'Asian', 'Middle Eastern', 'Mixed']

const createEmptyPerson = (): PersonInfo => ({
  name: '',
  age_range: '30s',
  gender: 'female',
  ethnicity: '',
})

const createEmptyFormData = (): RecipientFormData => ({
  name: '',
  age_range: '30s',
  gender: 'female',
  ethnicity: '',
  image_clean_url: '',
  person_count: 1,
  people: [],
})

// ===========================================
// MAIN COMPONENT
// ===========================================

export default function RecipientsPage() {
  const [recipients, setRecipients] = useState<SocialRecipient[]>([])
  const [loading, setLoading] = useState(true)
  const [showAddModal, setShowAddModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState<string | null>(null)
  const [showDeleteModal, setShowDeleteModal] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  
  // Upload state
  const [isUploading, setIsUploading] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  
  // S3 Scanner state
  const [isScanning, setIsScanning] = useState(false)
  const [unlinkedImages, setUnlinkedImages] = useState<string[]>([])
  const [showUnlinked, setShowUnlinked] = useState(true)
  const [hasScanned, setHasScanned] = useState(false)
  
  // Form state (used for both add and edit)
  const [formData, setFormData] = useState<RecipientFormData>(createEmptyFormData())

  // Load recipients
  useEffect(() => {
    loadRecipients()
  }, [])

  const loadRecipients = async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('social_recipients')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) {
        console.error('Error fetching recipients:', error)
        setRecipients([])
      } else {
        setRecipients((data || []) as any)
      }
    } catch (error) {
      console.error('Error loading recipients:', error)
    } finally {
      setLoading(false)
    }
  }

  // Calculate stats
  const stats = {
    total: recipients.length,
    byAge: AGE_RANGES.reduce((acc, age) => {
      acc[age] = recipients.filter(r => r.age_range === age).length
      return acc
    }, {} as Record<AgeRange, number>),
  }

  // Add recipient
  const handleAddRecipient = async () => {
    if (!formData.name || !formData.image_clean_url) {
      alert('Please fill in name and image URL')
      return
    }

    // Validate multi-person data
    if (formData.person_count > 1) {
      const hasIncompletePerson = formData.people.some(p => !p.name)
      if (hasIncompletePerson) {
        alert('Please fill in names for all people in the photo')
        return
      }
    }

    setSaving(true)
    try {
      const { error } = await supabase
        .from('social_recipients')
        .insert({
          name: formData.name,
          age_range: formData.age_range,
          gender: formData.gender,
          ethnicity: formData.ethnicity || null,
          image_clean_url: formData.image_clean_url,
          person_count: formData.person_count,
          people: formData.person_count > 1 ? (formData.people as unknown as Json) : null,
          times_used: 0,
        })

      if (error) {
        console.error('Error adding recipient:', error)
        alert('Failed to add recipient')
      } else {
        // Remove from unlinked list if it was there
        removeFromUnlinked(formData.image_clean_url)
        closeAddModal()
        loadRecipients()
      }
    } catch (error) {
      console.error('Error adding recipient:', error)
      alert('Failed to add recipient')
    } finally {
      setSaving(false)
    }
  }

  // Edit recipient
  const handleEditRecipient = async () => {
    if (!showEditModal || !formData.name || !formData.image_clean_url) {
      alert('Please fill in name and image URL')
      return
    }

    // Validate multi-person data
    if (formData.person_count > 1) {
      const hasIncompletePerson = formData.people.some(p => !p.name)
      if (hasIncompletePerson) {
        alert('Please fill in names for all people in the photo')
        return
      }
    }

    setSaving(true)
    try {
      const { error } = await supabase
        .from('social_recipients')
        .update({
          name: formData.name,
          age_range: formData.age_range,
          gender: formData.gender,
          ethnicity: formData.ethnicity || null,
          image_clean_url: formData.image_clean_url,
          person_count: formData.person_count,
          people: formData.person_count > 1 ? (formData.people as unknown as Json) : null,
        })
        .eq('id', showEditModal)

      if (error) {
        console.error('Error updating recipient:', error)
        alert('Failed to update recipient')
      } else {
        closeEditModal()
        loadRecipients()
      }
    } catch (error) {
      console.error('Error updating recipient:', error)
      alert('Failed to update recipient')
    } finally {
      setSaving(false)
    }
  }

  // Open edit modal with existing data
  const openEditModal = (recipient: SocialRecipient) => {
    setFormData({
      name: recipient.name,
      age_range: recipient.age_range,
      gender: recipient.gender,
      ethnicity: recipient.ethnicity || '',
      image_clean_url: recipient.image_clean_url,
      person_count: recipient.person_count || 1,
      people: recipient.people || [],
    })
    setShowEditModal(recipient.id)
  }

  // Close edit modal
  const closeEditModal = () => {
    setShowEditModal(null)
    setFormData(createEmptyFormData())
    setUploadError(null)
    setIsDragging(false)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  // Handle person count change
  const handlePersonCountChange = (count: number) => {
    const newCount = Math.max(1, Math.min(10, count))
    setFormData(prev => {
      const newPeople = [...prev.people]
      // Add new empty people if increasing
      while (newPeople.length < newCount - 1) {
        newPeople.push(createEmptyPerson())
      }
      // Remove extra people if decreasing
      while (newPeople.length > newCount - 1) {
        newPeople.pop()
      }
      return { ...prev, person_count: newCount, people: newPeople }
    })
  }

  // Update a specific person's data
  const updatePerson = (index: number, field: keyof PersonInfo, value: string) => {
    setFormData(prev => {
      const newPeople = [...prev.people]
      newPeople[index] = { ...newPeople[index], [field]: value }
      return { ...prev, people: newPeople }
    })
  }

  // Delete recipient
  const handleDeleteRecipient = async () => {
    if (!showDeleteModal) return

    setSaving(true)
    try {
      const { error } = await supabase
        .from('social_recipients')
        .delete()
        .eq('id', showDeleteModal)

      if (error) {
        console.error('Error deleting recipient:', error)
        alert('Failed to delete recipient')
      } else {
        setShowDeleteModal(null)
        loadRecipients()
      }
    } catch (error) {
      console.error('Error deleting recipient:', error)
      alert('Failed to delete recipient')
    } finally {
      setSaving(false)
    }
  }

  // Get recipient being deleted (for modal)
  const recipientToDelete = showDeleteModal 
    ? recipients.find(r => r.id === showDeleteModal) 
    : null

  // Handle file upload
  const handleFileUpload = async (file: File) => {
    // Validate file type
    const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp']
    if (!allowedTypes.includes(file.type)) {
      setUploadError('Invalid file type. Please use PNG, JPEG, or WebP.')
      return
    }

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      setUploadError('File too large. Maximum size is 10MB.')
      return
    }

    setIsUploading(true)
    setUploadError(null)

    try {
      // 1. Get presigned URL from our API
      const response = await fetch('/api/admin/social/recipient-upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName: file.name,
          contentType: file.type,
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to get upload URL')
      }

      const { uploadUrl, publicUrl } = await response.json()

      // 2. Upload file directly to S3
      const uploadResponse = await fetch(uploadUrl, {
        method: 'PUT',
        body: file,
        headers: {
          'Content-Type': file.type,
        },
      })

      if (!uploadResponse.ok) {
        throw new Error('Failed to upload to S3')
      }

      // 3. Set the public URL in the form
      setFormData(prev => ({ ...prev, image_clean_url: publicUrl }))
    } catch (error) {
      console.error('Upload error:', error)
      setUploadError('Upload failed. Please try again or paste URL manually.')
    } finally {
      setIsUploading(false)
    }
  }

  // Handle drag events
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) {
      handleFileUpload(file)
    }
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      handleFileUpload(file)
    }
  }

  const clearUploadedImage = () => {
    setFormData(prev => ({ ...prev, image_clean_url: '' }))
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const closeAddModal = () => {
    setShowAddModal(false)
    setFormData(createEmptyFormData())
    setUploadError(null)
    setIsDragging(false)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  // Scan S3 for unlinked images
  const scanS3 = async () => {
    setIsScanning(true)
    try {
      const response = await fetch('/api/admin/social/scan-recipients')
      if (!response.ok) {
        throw new Error('Failed to scan S3')
      }
      const data = await response.json()
      setUnlinkedImages(data.unlinked || [])
      setHasScanned(true)
      setShowUnlinked(true)
    } catch (error) {
      console.error('Error scanning S3:', error)
      alert('Failed to scan S3 bucket')
    } finally {
      setIsScanning(false)
    }
  }

  // Open Add Modal with pre-filled image URL (for unlinked images)
  const openModalWithImage = (imageUrl: string) => {
    setFormData({
      ...createEmptyFormData(),
      image_clean_url: imageUrl,
    })
    setShowAddModal(true)
  }

  // After successfully adding a recipient, remove from unlinked list
  const removeFromUnlinked = (imageUrl: string) => {
    setUnlinkedImages(prev => prev.filter(url => url !== imageUrl))
  }

  return (
    <div className="p-6 lg:p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link 
              href="/admin/social"
              className="text-gray-400 hover:text-white text-sm"
            >
              Social Media
            </Link>
            <span className="text-gray-600">/</span>
            <span className="text-gray-300 text-sm">Recipients</span>
          </div>
          <h1 className="text-3xl font-bold text-white">👥 Recipients</h1>
          <p className="text-gray-400 mt-1">Manage AI-generated faces for all social content pipelines</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={scanS3}
            disabled={isScanning}
            className="px-4 py-2 bg-gray-700 text-gray-200 font-medium rounded-xl hover:bg-gray-600 transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isScanning ? (
              <>
                <div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                Scanning...
              </>
            ) : (
              <>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                Scan S3
              </>
            )}
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            className="px-4 py-2 bg-gradient-to-r from-orange-500 to-amber-500 text-white font-semibold rounded-xl hover:from-orange-400 hover:to-amber-400 transition-all shadow-lg shadow-orange-500/20 flex items-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Recipient
          </button>
        </div>
      </div>

      {/* Stats Row */}
      <div className="flex flex-wrap gap-2">
        <span className="px-3 py-1.5 bg-[#1a1f2e] rounded-full text-sm text-white font-medium border border-gray-700">
          Total: {stats.total}
        </span>
        {AGE_RANGES.map(age => (
          stats.byAge[age] > 0 && (
            <span 
              key={age}
              className="px-3 py-1.5 bg-[#1a1f2e] rounded-full text-sm text-gray-400 border border-gray-800"
            >
              {age}: {stats.byAge[age]}
            </span>
          )
        ))}
      </div>

      {/* Unlinked Images Section */}
      {hasScanned && unlinkedImages.length > 0 && showUnlinked && (
        <div className="bg-amber-500/5 border-2 border-amber-500/30 rounded-2xl p-5">
          {/* Section Header */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-amber-500/20 flex items-center justify-center">
                <svg className="w-5 h-5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-amber-300">
                  Unlinked Images in S3 ({unlinkedImages.length})
                </h3>
                <p className="text-sm text-amber-400/60">Click an image to add it as a recipient</p>
              </div>
            </div>
            <button
              onClick={() => setShowUnlinked(false)}
              className="p-2 text-amber-400/60 hover:text-amber-300 transition-colors"
              title="Hide section"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Unlinked Images Grid */}
          <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 gap-3">
            {unlinkedImages.map((url, index) => (
              <button
                key={url}
                onClick={() => openModalWithImage(url)}
                className="group relative aspect-square rounded-lg overflow-hidden bg-gray-800 border-2 border-transparent hover:border-amber-400 transition-all"
                title="Click to add as recipient"
              >
                <img
                  src={url}
                  alt={`Unlinked image ${index + 1}`}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    e.currentTarget.src = ''
                    e.currentTarget.alt = 'Failed to load'
                  }}
                />
                {/* Hover Overlay */}
                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <span className="text-xs text-white font-medium">+ Add</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Show collapsed indicator if section was hidden */}
      {hasScanned && unlinkedImages.length > 0 && !showUnlinked && (
        <button
          onClick={() => setShowUnlinked(true)}
          className="w-full py-2 px-4 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-400 text-sm hover:bg-amber-500/20 transition-all flex items-center justify-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          Show {unlinkedImages.length} unlinked image{unlinkedImages.length !== 1 ? 's' : ''} in S3
        </button>
      )}

      {/* Content */}
      {loading ? (
        <div className="text-center py-12 text-gray-500">Loading recipients...</div>
      ) : recipients.length === 0 ? (
        // Empty State
        <div className="bg-[#1a1f2e] rounded-2xl border border-gray-800/50 p-12 text-center">
          <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-gray-800 flex items-center justify-center">
            <span className="text-4xl">👥</span>
          </div>
          <h3 className="text-xl font-semibold text-white mb-2">No recipients yet</h3>
          <p className="text-gray-400 mb-6">
            Add AI-generated faces to use in your social media content
          </p>
          <button
            onClick={() => setShowAddModal(true)}
            className="px-6 py-3 bg-gradient-to-r from-orange-500 to-amber-500 text-white font-semibold rounded-xl hover:from-orange-400 hover:to-amber-400 transition-all"
          >
            Add First Recipient
          </button>
        </div>
      ) : (
        // Recipients Grid
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {recipients.map(recipient => (
            <div
              key={recipient.id}
              className="group relative bg-gray-800 rounded-xl overflow-hidden hover:ring-2 ring-orange-500 transition-all"
            >
              {/* Action Buttons (shows on hover) */}
              <div className="absolute top-2 right-2 z-10 flex gap-1 opacity-0 group-hover:opacity-100 transition-all">
                <button
                  onClick={() => openEditModal(recipient)}
                  className="p-1.5 rounded-lg bg-black/50 text-gray-400 hover:text-orange-400 hover:bg-orange-500/20"
                  title="Edit"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                  </svg>
                </button>
                <button
                  onClick={() => setShowDeleteModal(recipient.id)}
                  className="p-1.5 rounded-lg bg-black/50 text-gray-400 hover:text-red-400 hover:bg-red-500/20"
                  title="Delete"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>

              {/* Person Count Badge */}
              {(recipient.person_count || 1) > 1 && (
                <div className="absolute top-2 left-2 z-10 px-2 py-0.5 rounded-full bg-purple-500/80 text-white text-xs font-medium">
                  {recipient.person_count} people
                </div>
              )}

              {/* Image */}
              <div className="aspect-square bg-gray-900">
                {recipient.image_clean_url ? (
                  <img
                    src={recipient.image_clean_url}
                    alt={recipient.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-600">
                    <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                  </div>
                )}
              </div>

              {/* Info */}
              <div className="p-3">
                <p className="text-white font-medium truncate">{recipient.name}</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="px-2 py-0.5 bg-gray-700 rounded text-xs text-gray-300">
                    {recipient.age_range}
                  </span>
                  <span className="px-2 py-0.5 bg-gray-700 rounded text-xs text-gray-300 capitalize">
                    {recipient.gender}
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  Used {recipient.times_used} time{recipient.times_used !== 1 ? 's' : ''}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add/Edit Modal */}
      {(showAddModal || showEditModal) && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#1a1f2e] rounded-2xl border border-gray-800/50 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-gray-800/50 flex items-center justify-between sticky top-0 bg-[#1a1f2e] z-10">
              <h3 className="text-lg font-semibold text-white">
                {showEditModal ? 'Edit Recipient' : 'Add Recipient'}
              </h3>
              <button
                onClick={showEditModal ? closeEditModal : closeAddModal}
                className="text-gray-400 hover:text-white transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-4">
              {/* Image Upload Section */}
              <div>
                <label className="block text-sm text-gray-400 mb-2">Image *</label>
                
                {/* Show upload zone OR preview */}
                {formData.image_clean_url ? (
                  // Preview of uploaded/pasted image
                  <div className="relative w-32 h-32 rounded-xl overflow-hidden bg-gray-800 group">
                    <img
                      src={formData.image_clean_url}
                      alt="Preview"
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        e.currentTarget.src = ''
                        e.currentTarget.alt = 'Failed to load'
                      }}
                    />
                    {/* Clear button */}
                    <button
                      type="button"
                      onClick={clearUploadedImage}
                      className="absolute top-1 right-1 p-1.5 rounded-lg bg-black/60 text-gray-300 hover:text-red-400 hover:bg-red-500/20 opacity-0 group-hover:opacity-100 transition-all"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ) : (
                  // Upload zone
                  <div
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className={`relative border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all ${
                      isDragging
                        ? 'border-orange-500 bg-orange-500/10'
                        : 'border-gray-600 hover:border-gray-500 hover:bg-gray-800/50'
                    }`}
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/jpg,image/webp"
                      onChange={handleFileSelect}
                      className="hidden"
                    />
                    
                    {isUploading ? (
                      // Loading state
                      <div className="flex flex-col items-center gap-2">
                        <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
                        <p className="text-sm text-gray-400">Uploading...</p>
                      </div>
                    ) : (
                      // Default state
                      <div className="flex flex-col items-center gap-2">
                        <div className="w-12 h-12 rounded-full bg-gray-700 flex items-center justify-center">
                          <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                        </div>
                        <p className="text-sm text-gray-300">
                          Drop image or <span className="text-orange-400">click to upload</span>
                        </p>
                        <p className="text-xs text-gray-500">PNG, JPEG, or WebP (max 10MB)</p>
                      </div>
                    )}
                  </div>
                )}

                {/* Error message */}
                {uploadError && (
                  <p className="mt-2 text-sm text-red-400">{uploadError}</p>
                )}

                {/* Manual URL fallback */}
                <div className="mt-4">
                  <label className="block text-xs text-gray-500 mb-2">Or paste URL manually</label>
                  <input
                    type="text"
                    value={formData.image_clean_url}
                    onChange={(e) => setFormData(prev => ({ ...prev, image_clean_url: e.target.value }))}
                    placeholder="https://heartbeat-photos-prod.s3.amazonaws.com/..."
                    className="w-full px-4 py-2.5 bg-[#0f1419] border border-gray-700 rounded-xl text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-500/50"
                  />
                </div>
              </div>

              {/* Person Count */}
              <div>
                <label className="block text-sm text-gray-400 mb-2">How many people in this photo?</label>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => handlePersonCountChange(formData.person_count - 1)}
                    disabled={formData.person_count <= 1}
                    className="w-10 h-10 rounded-lg bg-gray-700 text-white font-bold hover:bg-gray-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    −
                  </button>
                  <span className="w-12 text-center text-xl font-semibold text-white">{formData.person_count}</span>
                  <button
                    type="button"
                    onClick={() => handlePersonCountChange(formData.person_count + 1)}
                    disabled={formData.person_count >= 10}
                    className="w-10 h-10 rounded-lg bg-gray-700 text-white font-bold hover:bg-gray-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    +
                  </button>
                  <span className="text-sm text-gray-500 ml-2">
                    {formData.person_count === 1 ? 'person' : 'people'}
                  </span>
                </div>
              </div>

              {/* Primary Person (Person 1) */}
              <div className={`space-y-4 ${formData.person_count > 1 ? 'p-4 bg-purple-500/5 border border-purple-500/20 rounded-xl' : ''}`}>
                {formData.person_count > 1 && (
                  <div className="flex items-center gap-2 mb-2">
                    <span className="w-6 h-6 rounded-full bg-purple-500 text-white text-xs font-bold flex items-center justify-center">1</span>
                    <span className="text-sm font-medium text-purple-300">Person 1 (Primary)</span>
                  </div>
                )}
                
                {/* Name */}
                <div>
                  <label className="block text-sm text-gray-400 mb-2">Name *</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="e.g., Sarah"
                    className="w-full px-4 py-3 bg-[#0f1419] border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-500/50"
                  />
                </div>

                {/* Age Range & Gender */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm text-gray-400 mb-2">Age Range *</label>
                    <select
                      value={formData.age_range}
                      onChange={(e) => setFormData(prev => ({ ...prev, age_range: e.target.value as AgeRange }))}
                      className="w-full px-4 py-3 bg-[#0f1419] border border-gray-700 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-orange-500/50"
                    >
                      {AGE_RANGES.map(age => (
                        <option key={age} value={age}>{age}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm text-gray-400 mb-2">Gender *</label>
                    <select
                      value={formData.gender}
                      onChange={(e) => setFormData(prev => ({ ...prev, gender: e.target.value as Gender }))}
                      className="w-full px-4 py-3 bg-[#0f1419] border border-gray-700 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-orange-500/50"
                    >
                      {GENDERS.map(gender => (
                        <option key={gender} value={gender} className="capitalize">{gender}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Ethnicity */}
                <div>
                  <label className="block text-sm text-gray-400 mb-2">Ethnicity (optional)</label>
                  <select
                    value={formData.ethnicity}
                    onChange={(e) => setFormData(prev => ({ ...prev, ethnicity: e.target.value }))}
                    className="w-full px-4 py-3 bg-[#0f1419] border border-gray-700 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-orange-500/50"
                  >
                    <option value="">Select ethnicity</option>
                    {ETHNICITIES.map(e => (
                      <option key={e} value={e}>{e}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Additional People (when person_count > 1) */}
              {formData.person_count > 1 && formData.people.map((person, index) => (
                <div key={index} className="p-4 bg-indigo-500/5 border border-indigo-500/20 rounded-xl space-y-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="w-6 h-6 rounded-full bg-indigo-500 text-white text-xs font-bold flex items-center justify-center">
                      {index + 2}
                    </span>
                    <span className="text-sm font-medium text-indigo-300">Person {index + 2}</span>
                  </div>

                  {/* Name */}
                  <div>
                    <label className="block text-sm text-gray-400 mb-2">Name *</label>
                    <input
                      type="text"
                      value={person.name}
                      onChange={(e) => updatePerson(index, 'name', e.target.value)}
                      placeholder="e.g., Michael"
                      className="w-full px-4 py-3 bg-[#0f1419] border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                    />
                  </div>

                  {/* Age Range & Gender */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm text-gray-400 mb-2">Age Range *</label>
                      <select
                        value={person.age_range}
                        onChange={(e) => updatePerson(index, 'age_range', e.target.value)}
                        className="w-full px-4 py-3 bg-[#0f1419] border border-gray-700 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                      >
                        {AGE_RANGES.map(age => (
                          <option key={age} value={age}>{age}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm text-gray-400 mb-2">Gender *</label>
                      <select
                        value={person.gender}
                        onChange={(e) => updatePerson(index, 'gender', e.target.value)}
                        className="w-full px-4 py-3 bg-[#0f1419] border border-gray-700 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                      >
                        {GENDERS.map(gender => (
                          <option key={gender} value={gender} className="capitalize">{gender}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Ethnicity */}
                  <div>
                    <label className="block text-sm text-gray-400 mb-2">Ethnicity (optional)</label>
                    <select
                      value={person.ethnicity}
                      onChange={(e) => updatePerson(index, 'ethnicity', e.target.value)}
                      className="w-full px-4 py-3 bg-[#0f1419] border border-gray-700 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                    >
                      <option value="">Select ethnicity</option>
                      {ETHNICITIES.map(e => (
                        <option key={e} value={e}>{e}</option>
                      ))}
                    </select>
                  </div>
                </div>
              ))}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 border-t border-gray-800/50 flex justify-end gap-3 sticky bottom-0 bg-[#1a1f2e]">
              <button
                onClick={showEditModal ? closeEditModal : closeAddModal}
                className="px-4 py-2 text-gray-400 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={showEditModal ? handleEditRecipient : handleAddRecipient}
                disabled={saving || !formData.name || !formData.image_clean_url}
                className="px-6 py-2 bg-gradient-to-r from-orange-500 to-amber-500 text-white font-semibold rounded-xl hover:from-orange-400 hover:to-amber-400 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? 'Saving...' : showEditModal ? 'Update Recipient' : 'Save Recipient'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && recipientToDelete && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#1a1f2e] rounded-2xl border border-gray-800/50 w-full max-w-md p-6">
            <div className="text-center">
              {/* Recipient Preview */}
              <div className="w-20 h-20 mx-auto mb-4 rounded-xl overflow-hidden bg-gray-800">
                {recipientToDelete.image_clean_url && (
                  <img
                    src={recipientToDelete.image_clean_url}
                    alt={recipientToDelete.name}
                    className="w-full h-full object-cover"
                  />
                )}
              </div>

              <h3 className="text-xl font-semibold text-white mb-2">Delete Recipient?</h3>
              <p className="text-gray-400 mb-6">
                Are you sure you want to delete <span className="text-white font-medium">{recipientToDelete.name}</span>? 
                This action cannot be undone.
              </p>

              {recipientToDelete.times_used > 0 && (
                <p className="text-amber-400 text-sm mb-4">
                  ⚠️ This recipient has been used {recipientToDelete.times_used} time{recipientToDelete.times_used !== 1 ? 's' : ''} in posts.
                </p>
              )}

              <div className="flex gap-3">
                <button
                  onClick={() => setShowDeleteModal(null)}
                  className="flex-1 px-4 py-2.5 bg-gray-800 text-gray-300 font-medium rounded-xl hover:bg-gray-700 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteRecipient}
                  disabled={saving}
                  className="flex-1 px-4 py-2.5 bg-red-500 text-white font-medium rounded-xl hover:bg-red-400 transition-colors disabled:opacity-50"
                >
                  {saving ? 'Deleting...' : 'Delete'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

