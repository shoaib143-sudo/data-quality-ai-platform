import { LoaderCircle } from 'lucide-react'
import type { ReactNode } from 'react'

export function WorkspaceLoadingState({
  title = 'Loading workspace',
  detail = 'Retrieving governed evidence and current execution state.',
}: {
  title?: string
  detail?: string
}) {
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-12 text-slate-950">
      <section className="mx-auto max-w-3xl rounded-3xl border border-slate-200 bg-white p-7 shadow-sm sm:p-9" role="status" aria-live="polite">
        <div className="flex items-start gap-4">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-blue-50 text-blue-700">
            <LoaderCircle className="h-6 w-6 animate-spin motion-reduce:animate-none" aria-hidden="true" />
          </span>
          <div>
            <h1 className="text-xl font-black">{title}</h1>
            <p className="mt-2 text-sm leading-6 text-slate-600">{detail}</p>
          </div>
        </div>
      </section>
    </main>
  )
}

export function WorkspaceEmptyState({
  title,
  detail,
  action,
}: {
  title: string
  detail: string
  action?: ReactNode
}) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-5 py-7 text-center">
      <p className="font-bold text-slate-800">{title}</p>
      <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-500">{detail}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  )
}
