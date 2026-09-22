import Link from 'next/link'
import { ArrowLeft, Home, Search, Sparkles } from 'lucide-react'

export default function NotFound(){
  return <main id="main-content" className="dn-page grid min-h-screen place-items-center px-4 py-12 text-slate-100">
    <section className="dn-surface w-full max-w-2xl p-7 sm:p-9" aria-labelledby="not-found-title">
      <p className="text-xs font-black uppercase tracking-[.16em] text-cyan-300">Resource unavailable</p>
      <h1 id="not-found-title" className="mt-3 text-3xl font-black text-white">DataNexus could not find this governed resource.</h1>
      <p className="mt-4 max-w-xl text-sm leading-7 text-slate-400">The resource may have moved, been removed, or no longer be available in your current governed context. No data was changed.</p>
      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <Link href="/home" className="dn-control inline-flex min-h-11 items-center justify-center gap-2 px-4 py-3 text-sm font-bold text-slate-200 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"><Home className="h-4 w-4"/>My workspace</Link>
        <Link href="/search" className="dn-control inline-flex min-h-11 items-center justify-center gap-2 px-4 py-3 text-sm font-bold text-cyan-200 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"><Search className="h-4 w-4"/>Search DataNexus</Link>
        <Link href="/journeys" className="dn-control inline-flex min-h-11 items-center justify-center gap-2 px-4 py-3 text-sm font-bold text-violet-200 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"><Sparkles className="h-4 w-4"/>Guided journey</Link>
      </div>
      <Link href="/catalog" className="mt-6 inline-flex items-center gap-2 text-xs font-bold text-slate-500 hover:text-slate-300"><ArrowLeft className="h-3.5 w-3.5"/>Browse governed catalog</Link>
    </section>
  </main>
}
