'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import Image from 'next/image'

interface NavItem {
  name: string
  href: string
  icon: React.ReactNode
}

const socialNavigation: NavItem[] = [
  {
    name: 'Dashboard',
    href: '/admin/social',
    icon: <span className="text-base">📊</span>,
  },
  {
    name: 'Recipients',
    href: '/admin/social/recipients',
    icon: <span className="text-base">👥</span>,
  },
  {
    name: 'Evergreen',
    href: '/admin/social/evergreen',
    icon: <span className="text-base">🌲</span>,
  },
  {
    name: 'Posts',
    href: '/admin/social/evergreen',
    icon: <span className="text-base">📋</span>,
  },
  {
    name: 'Create',
    href: '/admin/social/evergreen/create',
    icon: <span className="text-base">➕</span>,
  },
  {
    name: 'Hooks',
    href: '/admin/social/evergreen/hooks',
    icon: <span className="text-base">📝</span>,
  },
  {
    name: 'Live Now',
    href: '/admin/social/live-now',
    icon: <span className="text-base">⚡</span>,
  },
  {
    name: 'Live Past',
    href: '/admin/social/live-past',
    icon: <span className="text-base">📅</span>,
  },
  {
    name: 'AI UGC',
    href: '/admin/social/ai-ugc',
    icon: <span className="text-base">🤖</span>,
  },
]

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [pin, setPin] = useState('')
  const [pinAuthenticated, setPinAuthenticated] = useState(false)
  const [pinError, setPinError] = useState('')
  const [sidebarOpen, setSidebarOpen] = useState(false)

  useEffect(() => {
    const storedAuth = localStorage.getItem('admin_authenticated')
    if (storedAuth === 'true') {
      setPinAuthenticated(true)
    }
  }, [])

  const handlePinSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setPinError('')

    if (pin.length !== 4) {
      setPinError('PIN must be 4 digits')
      return
    }

    try {
      const response = await fetch('/api/admin/verify-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }),
      })

      const data = await response.json()

      if (data.success) {
        localStorage.setItem('admin_authenticated', 'true')
        setPinAuthenticated(true)
        setPin('')
      } else {
        setPinError('Incorrect PIN')
        setPin('')
      }
    } catch (error) {
      setPinError('Error verifying PIN')
      console.error('PIN verification error:', error)
    }
  }

  const handleLogout = () => {
    localStorage.removeItem('admin_authenticated')
    setPinAuthenticated(false)
    router.push('/admin')
  }

  const isActive = (href: string) => {
    if (href === '/admin') {
      return pathname === '/admin'
    }
    return pathname.startsWith(href)
  }

  // PIN Gate
  if (!pinAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 bg-[#0f1419]">
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute -top-40 -right-40 w-80 h-80 bg-amber-500/10 rounded-full blur-3xl" />
          <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-orange-500/10 rounded-full blur-3xl" />
        </div>
        <div className="relative max-w-md w-full">
          <div className="text-center mb-8">
            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-lg shadow-amber-500/20">
              <Image src="/heartchime_icon.png" alt="Heartchime" width={40} height={40} className="rounded-lg" style={{ width: 'auto', height: 'auto' }} />
            </div>
            <h1 className="text-3xl font-bold text-white mb-2">Admin Access</h1>
            <p className="text-gray-400">Enter your PIN to continue</p>
          </div>

          <div className="bg-[#1a1f2e] rounded-2xl p-8 border border-gray-800/50 shadow-2xl">
            <form onSubmit={handlePinSubmit} className="space-y-6">
              <div>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={4}
                  value={pin}
                  onChange={(e) => {
                    const value = e.target.value.replace(/\D/g, '')
                    setPin(value)
                    setPinError('')
                  }}
                  className="w-full px-4 py-4 text-center text-3xl tracking-[1em] rounded-xl bg-[#0f1419] border border-gray-700 text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500/50 transition-all"
                  placeholder="••••"
                  autoFocus
                />
                {pinError && (
                  <p className="mt-3 text-red-400 text-sm text-center">{pinError}</p>
                )}
              </div>
              <button
                type="submit"
                className="w-full bg-gradient-to-r from-amber-500 to-orange-500 text-white font-semibold py-4 rounded-xl hover:from-amber-400 hover:to-orange-400 transition-all text-lg shadow-lg shadow-amber-500/20"
              >
                Unlock Dashboard
              </button>
            </form>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0f1419]">
      {/* Mobile sidebar backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed top-0 left-0 z-50 h-full w-72 bg-[#1a1f2e] border-r border-gray-800/50 transform transition-transform duration-300 ease-in-out lg:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="p-6 border-b border-gray-800/50">
            <Link href="/admin" className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-lg shadow-amber-500/20">
                <Image src="/heartchime_icon.png" alt="Heartchime" width={28} height={28} className="rounded-lg" style={{ width: 'auto', height: 'auto' }} />
              </div>
              <div>
                <h1 className="text-lg font-bold text-white">Heartchime</h1>
                <p className="text-xs text-gray-500">Admin Dashboard</p>
              </div>
            </Link>
          </div>

          {/* Navigation */}
          <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
            {socialNavigation.map((item) => (
              <div key={item.name}>
                <Link
                  href={item.href}
                  onClick={() => setSidebarOpen(false)}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                    isActive(item.href)
                      ? 'bg-amber-500/10 text-amber-400'
                      : 'text-gray-400 hover:bg-gray-800/50 hover:text-white'
                  }`}
                >
                  {item.icon}
                  {item.name}
                </Link>
              </div>
            ))}
          </nav>

          {/* User section */}
          <div className="p-4 border-t border-gray-800/50">
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-gray-400 hover:bg-red-500/10 hover:text-red-400 transition-all"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              Logout
            </button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="lg:pl-72">
        {/* Mobile header */}
        <header className="lg:hidden sticky top-0 z-30 bg-[#1a1f2e]/80 backdrop-blur-xl border-b border-gray-800/50">
          <div className="flex items-center justify-between px-4 py-4">
            <button
              onClick={() => setSidebarOpen(true)}
              className="p-2 rounded-lg text-gray-400 hover:bg-gray-800/50 hover:text-white transition-all"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center">
                <Image src="/heartchime_icon.png" alt="Heartchime" width={20} height={20} className="rounded" style={{ width: 'auto', height: 'auto' }} />
              </div>
              <span className="font-semibold text-white">Heartchime</span>
            </div>
            <div className="w-10" /> {/* Spacer for centering */}
          </div>
        </header>

        {/* Page content */}
        <main className="min-h-screen">
          {children}
        </main>
      </div>
    </div>
  )
}

