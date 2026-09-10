'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ChevronDown, Clock3 } from 'lucide-react'

type RecentItem = { href: string; label: string; viewedAt: number; persona: string }

const storageKey = 'datanexus:landing-recently-viewed:v2'

function currentPersona() {
  const match = window.location.pathname.match(/^\/home\/([^/]+)/)
  return match?.[1] ?? 'unknown'
}

function readItems(persona = currentPersona()): RecentItem[] {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(storageKey) ?? '[]')
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((item): item is RecentItem => Boolean(
        item &&
        typeof item.href === 'string' &&
        typeof item.label === 'string' &&
        typeof item.viewedAt === 'number' &&
        typeof item.persona === 'string' &&
        item.persona === persona,
      ))
      .slice(0, 5)
  } catch {
    return []
  }
}

export function LandingRecentlyViewed() {
  const [items, setItems] = useState<RecentItem[]>([])

  useEffect(() => {
    const persona = currentPersona()
    setItems(readItems(persona))

    const onClick = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target.closest('a[data-track-recent="true"]') : null
      if (!(target instanceof HTMLAnchorElement)) return
      const href = target.getAttribute('href')
      if (!href || href.startsWith('#')) return
      const activePersona = currentPersona()
      const label = (target.getAttribute('data-recent-label') || target.textContent || href).replace(/\s+/g, ' ').trim().slice(0, 80)
      const existing = (() => {
        try {
          const parsed = JSON.parse(window.localStorage.getItem(storageKey) ?? '[]')
          return Array.isArray(parsed) ? parsed.filter((item): item is RecentItem => Boolean(item && typeof item.href === 'string' && typeof item.persona === 'string')) : []
        } catch {
          return [] as RecentItem[]
        }
      })()
      const nextAll = [
        { href, label, viewedAt: Date.now(), persona: activePersona },
        ...existing.filter(item => !(item.href === href && item.persona === activePersona)),
      ].slice(0, 40)
      window.localStorage.setItem(storageKey, JSON.stringify(nextAll))
      setItems(nextAll.filter(item => item.persona === activePersona).slice(0, 5))
    }

    document.addEventListener('click', onClick, true)
    return () => document.removeEventListener('click', onClick, true)
  }, [])

  return (
    <details className="group rounded-2xl border border-white/10 bg-white/[0.035]">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-3 text-sm font-semibold text-slate-200 outline-none focus-visible:ring-2 focus-visible:ring-cyan-400">
        <span className="flex items-center gap-2"><Clock3 className="h-4 w-4 text-cyan-300" />Recently viewed</span>
        <ChevronDown className="h-4 w-4 transition group-open:rotate-180" />
      </summary>
      <div className="space-y-1 border-t border-white/10 p-2">
        {items.length ? items.map(item => (
          <Link
            key={`${item.persona}:${item.href}`}
            href={item.href}
            className="block rounded-xl px-3 py-2 text-xs font-medium text-slate-300 hover:bg-white/[0.06] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
          >
            {item.label}
          </Link>
        )) : <p className="px-3 py-2 text-xs leading-5 text-slate-500">Items you open from this landing page will appear here.</p>}
      </div>
    </details>
  )
}
