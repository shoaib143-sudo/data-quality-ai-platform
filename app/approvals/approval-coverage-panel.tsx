import type { ApprovalCoverageScope } from '@/lib/governance/approval-coverage-service'

function statusLabel(status: ApprovalCoverageScope['status']) {
  if (status === 'HEALTHY') return 'Healthy'
  if (status === 'MISSING_BUSINESS') return 'Missing Business approval'
  if (status === 'MISSING_GOVERNANCE') return 'Missing Governance approval'
  return 'Separation of duties blocked'
}

export function ApprovalCoveragePanel({ scopes, managedProjectCount }: {
  scopes: ApprovalCoverageScope[]
  managedProjectCount: number
}) {
  if (managedProjectCount === 0) return null

  const unhealthy = scopes.filter(scope => scope.status !== 'HEALTHY')

  return (
    <section className="rounded-xl border p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-cyan-500">Approval administration</p>
          <h2 className="mt-1 text-xl font-bold">Project and domain coverage</h2>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Coverage is derived from real dataset and non-synthetic critical-element domains. Business and Governance authority are shown separately, and a scope is healthy only when the two approval axes can be satisfied by different people.
          </p>
        </div>
        <div className="rounded-lg border px-3 py-2 text-sm">
          <span className="font-semibold">{scopes.length - unhealthy.length}</span> healthy · <span className="font-semibold">{unhealthy.length}</span> need attention
        </div>
      </div>

      {scopes.length === 0 ? (
        <p className="mt-4 rounded-lg border p-4 text-sm text-muted-foreground">
          No real approval domains are currently backed by datasets or non-synthetic critical data elements in projects you administer.
        </p>
      ) : (
        <div className="mt-5 space-y-3">
          {scopes.map(scope => (
            <article key={`${scope.projectId}:${scope.domain.toLowerCase()}`} className="rounded-lg border p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold">{scope.projectName} / {scope.domain}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Separation of duties: {scope.separationSatisfiable ? 'satisfiable' : 'not currently satisfiable'}
                  </p>
                </div>
                <span className="rounded-full border px-2 py-1 text-xs font-semibold">{statusLabel(scope.status)}</span>
              </div>

              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <div className="rounded-lg border p-3">
                  <p className="text-sm font-semibold">Business approvers</p>
                  {scope.businessApprovers.length === 0 ? (
                    <p className="mt-2 text-sm text-muted-foreground">No active Business approver.</p>
                  ) : scope.businessApprovers.map(approver => (
                    <div key={approver.userId} className="mt-2 text-sm">
                      <p>{approver.label}</p>
                      <p className="text-xs text-muted-foreground">{approver.sourceRoleKey ?? 'Direct authority'} · {approver.scope}</p>
                    </div>
                  ))}
                </div>

                <div className="rounded-lg border p-3">
                  <p className="text-sm font-semibold">Governance approvers</p>
                  {scope.governanceApprovers.length === 0 ? (
                    <p className="mt-2 text-sm text-muted-foreground">No active Governance approver.</p>
                  ) : scope.governanceApprovers.map(approver => (
                    <div key={approver.userId} className="mt-2 text-sm">
                      <p>{approver.label}</p>
                      <p className="text-xs text-muted-foreground">{approver.sourceRoleKey ?? 'Direct authority'} · {approver.scope}</p>
                    </div>
                  ))}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}
