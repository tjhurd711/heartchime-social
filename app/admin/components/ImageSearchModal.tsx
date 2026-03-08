'use client'

import { useState, useEffect } from 'react'

// Inline SVG icons
const XIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
  </svg>
)

const ImageIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
  </svg>
)

const CheckIcon = () => (
  <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
  </svg>
)

const AlertCircleIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
)

interface ImageSearchModalProps {
  isOpen: boolean
  onClose: () => void
  onSelect: (imageUrl: string) => void
  initialQuery: string
}

export default function ImageSearchModal({ isOpen, onClose, onSelect, initialQuery }: ImageSearchModalProps) {
  const [imageUrl, setImageUrl] = useState('')
  const [previewError, setPreviewError] = useState(false)
  const [previewLoaded, setPreviewLoaded] = useState(false)

  const handleUse = () => {
    if (imageUrl.trim() && previewLoaded) {
      onSelect(imageUrl.trim())
      onClose()
    }
  }

  const handleUrlChange = (url: string) => {
    setImageUrl(url)
    setPreviewError(false)
    setPreviewLoaded(false)
  }

  // Reset on open
  useEffect(() => {
    if (isOpen) {
      setImageUrl('')
      setPreviewError(false)
      setPreviewLoaded(false)
    }
  }, [isOpen])

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) onClose()
    }
    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg w-full max-w-lg overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <ImageIcon />
            Add Cover Image
          </h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
            <XIcon />
          </button>
        </div>
        
        {/* Content */}
        <div className="p-4 space-y-4">
          {/* Instructions */}
          <div className="text-sm text-gray-600 bg-gray-50 p-3 rounded-lg">
            <p className="font-medium mb-1">How to add an image:</p>
            <ol className="list-decimal list-inside space-y-1">
              <li>Search Google Images for "{initialQuery}"</li>
              <li>Right-click the image → "Copy image address"</li>
              <li>Paste the URL below</li>
            </ol>
            <a 
              href={`https://www.google.com/search?q=${encodeURIComponent(initialQuery)}&tbm=isch`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block mt-2 text-amber-600 hover:underline"
            >
              → Open Google Images for "{initialQuery}"
            </a>
          </div>
          
          {/* URL Input */}
          <div>
            <label className="block text-sm font-medium mb-1">Image URL</label>
            <input
              type="text"
              value={imageUrl}
              onChange={(e) => handleUrlChange(e.target.value)}
              placeholder="https://..."
              className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>
          
          {/* Preview */}
          {imageUrl && (
            <div className="border rounded-lg overflow-hidden">
              {previewError ? (
                <div className="flex items-center justify-center gap-2 p-8 text-red-500 bg-red-50">
                  <AlertCircleIcon />
                  <span>Failed to load image. Check the URL.</span>
                </div>
              ) : (
                <div className="relative">
                  <img
                    src={imageUrl}
                    alt="Preview"
                    className="w-full max-h-64 object-contain bg-gray-100"
                    onLoad={() => setPreviewLoaded(true)}
                    onError={() => setPreviewError(true)}
                  />
                  {previewLoaded && (
                    <div className="absolute top-2 right-2 bg-green-500 rounded-full p-1">
                      <CheckIcon />
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
        
        {/* Footer */}
        <div className="flex justify-end gap-2 p-4 border-t">
          <button
            onClick={onClose}
            className="px-4 py-2 border rounded-lg hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={handleUse}
            disabled={!imageUrl.trim() || !previewLoaded}
            className="px-4 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 disabled:opacity-50"
          >
            Use Image
          </button>
        </div>
      </div>
    </div>
  )
}
