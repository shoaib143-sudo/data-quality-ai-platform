'use client'

import { AlertTriangle, RefreshCw } from 'lucide-react'
import Link from 'next/link'
import { useEffect } from 'react'

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('Dashboard failed to load', error)
  }, [error])

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-12 text-slate-950">
      <section className="mx-auto max-w-2xl rounded-3xl border border-amber-200 bg-white p-7 shadow-sm sm:p-9">
        <div className="flex items-start gap-4">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-amber-50 text-amber-700">
            <AlertTriangle className="h-6 w-6" aria-hidden="true" />
          </span>
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-amber-700">Dashboard temporarily unavailable</p>
            <h1 className="mt-2 text-2xl font-black">We could not load all governance evidence.</h1>
            <p className="mt-3 leading-7 text-slate-600">
              Your data has not been changed. Retry the dashboard, or continue to a focused workspace while the underlying provider recovers.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={reset}
                className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
              >
                <RefreshCw className="h-4 w-4" aria-hidden="true" />
                Retry dashboard
              </button>
              <Link href="/catalog" className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50">
                Open catalog
              </Link>
              <Link href="/observability" className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50">
                View observability
              </Link>
            </div>
            {error.digest ? <p className="mt-5 text-xs text-slate-400">Reference: {error.digest}</p> : null}
          </div>
        </div>
      </section>
    </main>
  )
}
