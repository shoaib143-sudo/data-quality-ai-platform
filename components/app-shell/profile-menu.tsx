'use client'

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, LogOut, Settings, UserRound } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

type SessionIdentity = { email: string }

const focus = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#061426]'

export function ProfileMenu() {
  const [identity, setIdentity] = useState<SessionIdentity | null>(null)
  const [open, setOpen] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const containerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const supabase = createClient()
    let active = true
    void supabase.auth.getSession().then(({ data }) => {
      const email = data.session?.user.email
      if (active) setIdentity(email ? { email } : null)
    })
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      const email = session?.user.email
      if (active) setIdentity(email ? { email } : null)
      if (!session) setOpen(false)
    })
    return () => {
      active = false
      subscription.subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const displayName = useMemo(() => identity?.email?.split('@')[0] || 'DataNexus user', [identity])

  if (!identity) return null

  async function logout() {
    if (signingOut) return
    setSigningOut(true)
    const supabase = createClient()
    await supabase.auth.signOut()
    window.location.assign('/login')
  }

  const itemClass = `flex w-full items-center gap-3 px-4 py-3 text-left text-sm font-semibold text-slate-300 hover:bg-white/[0.05] hover:text-white ${focus}`

  return (
    <div ref={containerRef} className="fixed right-4 top-4 z-[110]">
      <button
        type="button"
        onClick={() => setOpen(value => !value)}
        className={`inline-flex h-10 items-center gap-2 rounded-xl border border-white/10 bg-[#08182b]/95 px-2.5 text-slate-300 shadow-[0_10px_28px_rgba(0,0,0,.28)] backdrop-blur hover:border-cyan-400/25 hover:text-white ${focus}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Open profile menu"
      >
        <span className="grid h-7 w-7 place-items-center rounded-lg border border-cyan-400/20 bg-cyan-400/10 text-cyan-200">
          <UserRound className="h-4 w-4" aria-hidden="true" />
        </span>
        <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
      </button>

      {open ? (
        <div role="menu" aria-label="Profile" className="mt-2 w-[min(20rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-white/10 bg-[#08182b]/98 shadow-[0_24px_70px_rgba(0,0,0,.45)] backdrop-blur-xl">
          <div className="border-b border-white/[0.08] px-4 py-4">
            <p className="truncate text-sm font-bold text-white">{displayName}</p>
            <p className="mt-1 truncate text-xs text-slate-500">{identity.email}</p>
          </div>
          <div className="py-1">
            <Link href="/profile" onClick={() => setOpen(false)} role="menuitem" className={itemClass}>
              <UserRound className="h-4 w-4 text-cyan-300" aria-hidden="true" />Profile
            </Link>
            <Link href="/settings" onClick={() => setOpen(false)} role="menuitem" className={itemClass}>
              <Settings className="h-4 w-4 text-cyan-300" aria-hidden="true" />Settings
            </Link>
          </div>
          <div className="border-t border-white/[0.08] py-1">
            <button type="button" role="menuitem" onClick={logout} disabled={signingOut} className={itemClass + ' disabled:cursor-wait disabled:opacity-60'}>
              <LogOut className="h-4 w-4 text-rose-300" aria-hidden="true" />{signingOut ? 'Signing out…' : 'Log out'}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
