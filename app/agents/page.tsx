export default function AgentsPage() {
  return (
    <main className="mx-auto max-w-6xl px-6 py-12">
      <h1 className="text-3xl font-semibold">AI Agents</h1>
      <p className="mt-2 text-muted-foreground">
        Manage and run AI-powered data quality agents.
      </p>

      <section className="mt-8 rounded-xl border p-6">
        <h2 className="text-xl font-semibold">Profiling Agent</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Analyze datasets, detect patterns and anomalies, and generate
          profiling results.
        </p>

        <div className="mt-6 flex items-center gap-3">
          <span className="rounded-full border px-3 py-1 text-sm">
            Enabled
          </span>
          <span className="text-sm text-muted-foreground">
            Version 2.0
          </span>
        </div>
      </section>
    </main>
  )
}
