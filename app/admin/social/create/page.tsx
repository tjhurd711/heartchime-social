'use client'

import Link from 'next/link'

interface CreatePathCard {
  icon: string
  title: string
  description: string
  href: string
  accentClasses: string
}

const createPaths: CreatePathCard[] = [
  {
    icon: '🎬',
    title: 'Use a Template',
    description: 'Pick from your library of trend-based templates. Fast, structured, repeatable.',
    href: '/admin/social/templates',
    accentClasses: 'from-amber-500/20 to-yellow-500/10 border-amber-500/40 hover:border-amber-400/60 hover:shadow-amber-500/20',
  },
  {
    icon: '✏️',
    title: 'Custom Post',
    description: 'Build a one-off post by hand. Pick post type, hook, era, demographics — full control.',
    href: '/admin/social/evergreen/create',
    accentClasses: 'from-orange-500/20 to-pink-500/10 border-orange-500/35 hover:border-orange-400/60 hover:shadow-orange-500/20',
  },
]

export default function SocialCreateChooserPage() {
  return (
    <div className="p-6 lg:p-8 space-y-6">
      <div>
        <Link
          href="/admin/social"
          className="text-gray-400 hover:text-white text-sm flex items-center gap-1 mb-2"
        >
          ← Back to Social Dashboard
        </Link>
        <h1 className="text-3xl lg:text-4xl font-semibold text-white font-serif">Choose Creation Flow</h1>
        <p className="text-gray-400 mt-2 max-w-2xl">
          Start with a reusable template or build a custom evergreen post from scratch.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 lg:gap-6">
        {createPaths.map((path) => (
          <Link
            key={path.title}
            href={path.href}
            className={`group rounded-2xl border bg-gradient-to-br ${path.accentClasses} bg-[#1a1f2e] p-6 lg:p-8 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl`}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-3">
                <span className="text-3xl lg:text-4xl leading-none">{path.icon}</span>
                <h2 className="text-2xl lg:text-3xl text-white font-semibold font-serif group-hover:text-amber-100 transition-colors">
                  {path.title}
                </h2>
                <p className="text-gray-300 leading-relaxed">{path.description}</p>
              </div>
              <span className="text-gray-500 group-hover:text-white text-xl transition-colors" aria-hidden="true">
                →
              </span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
