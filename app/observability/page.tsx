import Link from 'next/link'
import { requireUser } from '@/lib/supabase/auth'

export default async function ObservabilityPage() {
  await requireUser()

  return (
    <main className="min-h-screen p-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <Link href="/dashboard" className="text-sm underline">← Back to dashboard</Link>
        <div>
          <h1 className="text-3xl font-semibold">Observability</h1>
          <p className="mt-2 text-muted-foreground">The Data Observability workspace will be implemented here.</p>
        </div>
        <section className="rounded-xl border p-6 text-sm text-muted-foreground">
          This protected module is intentionally scaffolded before the application services are connected.
        </section>
      </div>
    </main>
  )
}
