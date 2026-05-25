'use client'

interface ProfileImageUploaderProps {
  imageUrl: string | null
  onFileSelected: (file: File | null) => void | Promise<void>
}

export function ProfileImageUploader({ imageUrl, onFileSelected }: ProfileImageUploaderProps) {
  return (
    <div className="space-y-2">
      <label className="block text-sm text-gray-300">Profile image upload</label>
      <input
        type="file"
        accept="image/png,image/jpeg,image/jpg,image/webp,image/avif,image/heic,image/heif"
        onChange={(event) => {
          const file = event.target.files?.[0] || null
          onFileSelected(file)
        }}
        className="w-full rounded-lg border border-gray-700 bg-[#0f1729] px-3 py-2 text-sm text-gray-100 file:mr-3 file:rounded-md file:border-0 file:bg-gray-700 file:px-3 file:py-1.5 file:text-sm file:text-gray-100 hover:file:bg-gray-600"
      />
      <div className="rounded-xl border border-gray-800 bg-[#0b111f] p-3">
        {imageUrl ? (
          <img src={imageUrl} alt="Voicemail profile preview" className="h-20 w-20 rounded-full object-cover" />
        ) : (
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gray-800 text-xs text-gray-400">
            No image
          </div>
        )}
      </div>
    </div>
  )
}
