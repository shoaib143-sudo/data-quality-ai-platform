# GitHub Structure and Release Governance Audit

Audit date: 2026-09-20

Repository: `shoaib143-sudo/data-quality-ai-platform`

## Current baseline

- Default branch: `main`
- Open PRs targeting `main`: PR #913 only at audit time
- Non-main branches: approximately 70
- GitHub Actions workflows: 132
- Automatic Vercel deployments: globally disabled in `vercel.json` while deployment flooding is being controlled
- Active ruleset: `Protect main certification`

## Findings

### Ruleset drift

The committed contract in `.github/rulesets/main.json` requires:

- `build`
- `analyze`
- `revalidate`
- `certify`
- `runtime-slo`
- `clean-database-reconstruction`
- `dependency-audit`
- `repository-governance`

The live ruleset currently exposes only:

- `build`
- `analyze`
- `dependency-audit`
- `repository-governance`

The live ruleset also reports non-strict status checks and zero approving reviews. Zero approvals are a documented temporary single-maintainer exception. The missing required checks and strictness are configuration drift that should be reconciled before routine merge flow is reopened.

### Branch hygiene

Branches use useful prefixes, but the repository retains many dated snapshots, backups, recovery branches, rebases, and duplicate test branches. Branch deletion must be evidence-based:

1. Confirm no open PR depends on the branch.
2. Confirm the work is merged, superseded, duplicate, or explicitly abandoned.
3. Preserve active recovery, certification, and release branches.
4. Record deletion candidates before deleting refs.

### Workflow surface

The 132 workflow files should be managed in four tiers:

1. Required pull-request gates.
2. Post-merge exact-main certification.
3. Scheduled operational jobs.
4. Manual diagnostics and historical certification.

High-frequency workflows should use concurrency groups and cancel superseded pull-request runs. Redundant workflows should be retired only after checking required status names and downstream references.

### Vercel deployment control

PR #719 implemented selective Hobby deployment rules for `main` and explicit UI/preview branch patterns. The current `main` configuration is stricter:

```json
{
  "git": {
    "deploymentEnabled": false
  }
}
```

Keep this global suppression during the deployment-flood audit. Restore selective deployments only when the production release path is explicitly reopened and the exact-preview verification workflow is confirmed compatible.

## Recommended execution order

1. Reconcile the live ruleset with `.github/rulesets/main.json`.
2. Build a branch inventory with age, latest commit, PR relationship, ancestry, and deletion recommendation.
3. Remove only proven stale or redundant branch refs.
4. Consolidate workflow triggers and verify required check names after each change.
5. Re-enable selective Vercel deployments only for the approved release phase.
6. Increase required approvals to one and enable code-owner review when an independent maintainer is available.

Tracking issue: #915.


## Reconciliation update

Reconciled against current `main` and repository history on 2026-09-20.

### Work already implemented

- The 132-workflow inventory is an explicit governed ceiling, enforced by `scripts/verify-github-governance.mjs`; it is not an accidental unbounded count.
- Repository Governance validates unique workflow names, immutable action references, least-privilege permissions, required workflow contracts, the committed ruleset contract, Dependabot coverage, and security policy requirements.
- The merge-critical fast-path model is already implemented and enforced by `scripts/verify-fast-path-ci.mjs`: pull requests run lightweight blocking sentinels while full certification remains on merged `main`.
- The six required workflow contracts already use PR/ref-scoped concurrency groups and cancel only superseded pull-request runs.
- All eight committed required check contexts are implemented:
  - `build` in `quality-gate.yml`
  - `analyze` in `codeql-security.yml`
  - `revalidate` in `p0-p4-revalidation.yml`
  - `certify`, `runtime-slo`, and `clean-database-reconstruction` in `v6-operational-certification.yml`
  - `dependency-audit` in `dependency-review.yml`
  - `repository-governance` in `repository-governance.yml`
- No exact duplicate workflow blobs were found.
- Prior workflow-consolidation work, including PR #545, deliberately folded temporary completion workflows into governed workflows and established the workflow-count ceiling.
- Five verified duplicate branch refs were removed while retaining the canonical UX and sensitive-governance refs.
- PR #917 targets `main` and is quality-gate work, so it remains eligible under the temporary merge freeze.

### Remaining configuration-only gap

The live ruleset still requires only `build`, `analyze`, `dependency-audit`, and `repository-governance`, with strict status checks disabled. The committed contract requires all eight contexts and strict status checks. Since the missing contexts now have verified workflow producers, the remaining work is a live GitHub ruleset reconciliation, not new workflow implementation.

Do not mass-disable or consolidate workflows solely from the raw count. Any future consolidation must preserve required context names, the PR fast path, full post-merge certification, permission boundaries, and the governed ceiling.
