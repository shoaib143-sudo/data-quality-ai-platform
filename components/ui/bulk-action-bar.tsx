'use client'

import type { ReactNode } from 'react'
import { CheckSquare2, X } from 'lucide-react'

export type BulkAction = {
  key: string
  label: string
  icon?: ReactNode
  onClick: () => void | Promise<void>
  disabled?: boolean
  destructive?: boolean
}

export function BulkActionBar({
  selectedCount,
  totalCount,
  actions,
  onClear,
  onSelectAll,
  busy = false,
  label = 'items',
}: {
  selectedCount: number
  totalCount?: number
  actions: BulkAction[]
  onClear: () => void
  onSelectAll?: () => void
  busy?: boolean
  label?: string
}) {
  if (selectedCount === 0) return null

  return (
    <div
      role="region"
      aria-label="Bulk actions"
      className="sticky bottom-4 z-30 mt-4 flex flex-wrap items-center gap-2 rounded-2xl border border-cyan-400/25 bg-[#071525]/95 p-2.5 shadow-[0_18px_60px_rgba(0,0,0,.42)] backdrop-blur-xl"
    >
      <div className="flex min-w-[150px] items-center gap-2 rounded-xl bg-cyan-400/10 px-3 py-2 text-sm font-bold text-cyan-100">
        <CheckSquare2 className="h-4 w-4" aria-hidden="true" />
        <span>{selectedCount} {label} selected</span>
      </div>
      {onSelectAll && totalCount !== undefined && selectedCount < totalCount ? (
        <button type="button" onClick={onSelectAll} disabled={busy} className="rounded-xl px-3 py-2 text-xs font-bold text-cyan-200 hover:bg-white/[0.06] disabled:opacity-50">
          Select all {totalCount}
        </button>
      ) : null}
      <div className="mx-1 hidden h-6 w-px bg-white/10 sm:block" aria-hidden="true" />
      {actions.map(action => (
        <button
          key={action.key}
          type="button"
          onClick={() => void action.onClick()}
          disabled={busy || action.disabled}
          className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold transition disabled:cursor-not-allowed disabled:opacity-40 ${action.destructive ? 'bg-rose-500/10 text-rose-200 hover:bg-rose-500/20' : 'bg-white/[0.06] text-slate-100 hover:bg-white/[0.1]'}`}
        >
          {action.icon}
          {action.label}
        </button>
      ))}
      <button type="button" onClick={onClear} disabled={busy} aria-label="Clear selection" className="ml-auto grid h-9 w-9 place-items-center rounded-xl text-slate-400 hover:bg-white/[0.06] hover:text-white disabled:opacity-50">
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  )
}
