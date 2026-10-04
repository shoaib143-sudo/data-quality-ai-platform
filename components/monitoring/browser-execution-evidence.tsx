type BrowserEvidence = {
  provider: string
  sessionId: string
  status: string
  liveViewUrl: string | null
  evidenceCount: number
}

export function BrowserExecutionEvidence({ execution }: { execution: BrowserEvidence | null }) {
  if (!execution) return null
  const liveUrl = execution.liveViewUrl
  return <section aria-label="Visual execution evidence" className="rounded-2xl border border-slate-700/60 bg-slate-950/60 p-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-cyan-200/70">Visual execution</p>
        <p className="mt-1 text-sm font-semibold text-white">{execution.provider} · {execution.status}</p>
        <p className="mt-1 text-xs text-slate-400">Session {execution.sessionId} · {execution.evidenceCount} evidence records</p>
      </div>
      {liveUrl ? <a href={liveUrl} target="_blank" rel="noreferrer" className="rounded-lg border border-cyan-300/40 px-3 py-2 text-xs font-bold text-cyan-100">Open live browser</a> : null}
    </div>
  </section>
}
