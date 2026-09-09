'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ChevronDown, Clock3 } from 'lucide-react'

type RecentItem = { href: string; label: string; viewedAt: number }

const storageKey = 'datanexus:landing-recently-viewed:v1'

function readItems(): RecentItem[] {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(storageKey) ?? '[]')
    if (!Array.isArray(parsed)) return []
    return parsed.filter((item): item is RecentItem => Boolean(item && typeof item.href === 'string' && typeof item.label === 'string' && typeof item.viewedAt === 'number')).slice(0, 5)
  } catch {
    return []
  }
}

export function LandingRecentlyViewed() {
  const [items, setItems] = useState<RecentItem[]>([])

  useEffect(() => {
    setItems(readItems())

    const onClick = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target.closest('a[data-track-recent="true"]') : null
      if (!(target instanceof HTMLAnchorElement)) return
      const href = target.getAttribute('href')
      if (!href || href.startsWith('#')) return
      const label = (target.getAttribute('data-recent-label') || target.textContent || href).replace(/\s+/g, ' ').trim().slice(0, 80)
      const next = [{ href, label, viewedAt: Date.now() }, ...readItems().filter(item => item.href !== href)].slice(0, 5)
      window.localStorage.setItem(storageKey, JSON.stringify(next))
      setItems(next)
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
            key={item.href}
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
