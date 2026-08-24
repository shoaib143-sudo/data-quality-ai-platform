import Link from 'next/link'
import { requireUser } from '@/lib/supabase/auth'

const modules = [
  { name: 'Datasets', href: '/datasets', description: 'Register and manage datasets.' },
  { name: 'Profiling', href: '/profiling', description: 'Run and review dataset profiling.' },
  { name: 'Data Quality', href: '/data-quality', description: 'Define and execute quality checks.' },
  { name: 'Observability', href: '/observability', description: 'Monitor data health and trends.' },
  { name: 'AI Agents', href: '/agents', description: 'Manage and run AI-powered data quality agents.' },
]

export default async function DashboardPage() {
  const user = await requireUser()

  return (
    <main className="min-h-screen p-8">
      <div className="mx-auto max-w-5xl space-y-8">
        <header>
          <h1 className="text-3xl font-semibold">Data Quality Platform</h1>
          <p className="mt-2 text-muted-foreground">Authenticated dashboard.</p>
          {user.email && (
            <p className="mt-1 text-sm text-muted-foreground">
              Signed in as {user.email}
            </p>
          )}
        </header>

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {modules.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-xl border p-5 transition hover:bg-muted"
            >
              <h2 className="font-medium">{item.name}</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                {item.description}
              </p>
            </Link>
          ))}
        </section>

        <form action="/auth/signout" method="post">
          <button className="rounded-md border px-4 py-2 text-sm">
            Sign out
          </button>
        </form>
      </div>
    </main>
  )
}
