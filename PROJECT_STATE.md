# Data Quality AI Platform --- Project State

> Durable project checkpoint. Treat the repository, Supabase migration
> history, and this file as the primary continuity sources.

## 1. Project Identity

-   **Project:** `data-quality-ai-platform`
-   **Local path:**
    `C:\Users\DEMO-D16695\Downloads\demo-pwc-supabase-auth-hardened-v3`
-   **Git branch:** `main`
-   **GitHub remote:**
    `https://github.com/shoaib143-sudo/data-quality-ai-platform.git`
-   **Production URL:** `https://data-quality-ai-platform.vercel.app`
-   **Supabase project ref:** `tvjnavjxuehpesxcfvrx`

## 2. Current Production Checkpoint

The production dashboard is authenticated and currently shows:

-   Datasets
-   Profiling
-   Data Quality
-   Observability
-   AI Agents

The **AI Agents** card is visible in production and links to `/agents`.

This was also independently shown in the user-provided production screenshot.
The production dashboard currently renders five modules: Datasets, Profiling,
Data Quality, Observability, and AI Agents.

## 3. Git Checkpoint

Most recently verified Git history:

``` text
30a429b Add AI Agents dashboard
59fb657 Initial production-ready application
```

`30a429b` was verified as:

``` text
HEAD -> main
origin/main
```

The AI Agents dashboard change is therefore pushed to GitHub.

### Important untracked items observed

The following have existed as untracked files/directories and should NOT
be blindly committed:

``` text
pnpm-workspace.yml
supabase/
supabase_backup_before_history_fix/
supabase_backup_before_migration_repair/
```

Backups should remain separate from production commits unless explicitly
required.

## 4. Supabase Migration State

The project previously had a migration-history mismatch between local
files and the remote database.

That issue was repaired.

Current verified migration state:

``` text
Local migration:  20260825000000
Remote migration: 20260825000000
Status:           synchronized
```

The migration file involved is:

``` text
supabase/migrations/20260825000000_profiling_agent_hardening_v6.sql
```

A `.bak` copy previously existed:

``` text
supabase/migrations/20260825000000_profiling_agent_hardening_v6.sql.bak
```

The `.bak` file is not a valid Supabase migration filename and must not
be treated as a migration.

### Migration safety rule

Do NOT run migration repair, reset, or destructive schema operations
again unless current evidence shows they are necessary.

Before any future migration change:

1.  Check `git status`.
2.  Check `npx supabase migration list`.
3.  Back up relevant remote schema if appropriate.
4.  Review the generated SQL.
5.  Apply the smallest required change.
6.  Re-check migration history.
7.  Commit the migration separately from unrelated UI work.

## 5. Remote Schema Evidence Collected

Remote schema dumps were created during investigation:

``` text
supabase/remote_public_schema.sql
supabase/remote_app_schema.sql
supabase/remote_agent_schema.sql
```

These were used to inspect the actual remote database instead of
guessing.

### Public schema

Observed public functions include:

-   `create_file_dataset`
-   `create_organization`
-   `create_project`
-   `list_dataset_versions`
-   `list_my_datasets`
-   `list_my_organizations`
-   `list_my_projects`
-   `set_updated_at_dataset_registry`

### App schema

Confirmed:

``` text
app.member_role
app.organization_members
app.organizations
app.projects
```

Organization/project isolation is implemented through `app_private`
membership/admin checks and RLS policies.

## 6. Agent Schema

The remote `agent` schema has been independently re-verified against the live Supabase project.
The project is ACTIVE_HEALTHY in `ap-southeast-1`, running PostgreSQL 17.6.1.155.

### Enums

Observed:

``` text
agent.message_status
agent.run_status
agent.step_status
```

### `agent.agent_definitions`

Confirmed fields include:

``` text
id
agent_key
name
description
version
system_prompt
configuration
enabled
created_at
```

### `agent.agent_runs`

Confirmed fields include:

``` text
id
agent_definition_id
project_id
dataset_id
dataset_version_id
parent_run_id
correlation_id
status
input
output
error_code
error_message
started_at
completed_at
```

### `agent.agent_run_steps`

Confirmed fields include:

``` text
id
agent_run_id
step_name
step_order
status
attempt
input
output
started_at
completed_at
error_code
error_message
created_at
```

### `agent.agent_messages`

Confirmed fields include:

``` text
id
source_agent_run_id
target_agent_run_id
message_type
correlation_id
payload
status
created_at
delivered_at
processed_at
```

### `agent.agent_artifacts`

Confirmed fields include:

``` text
id
agent_run_id
artifact_type
artifact_version
name
payload
storage_uri
content_hash
created_at
```

### `agent.tool_definitions`

The table exists and is part of the agent registry. Live verification confirmed
the exact columns are:

``` text
id
agent_definition_id
tool_key
name
description
version
input_schema
output_schema
execution_config
enabled
created_at
```

## 7. Security Principles

The application must preserve the existing organization/project
isolation.

Rules:

-   Never bypass RLS for normal authenticated user operations.
-   Do not expose service-role credentials to the browser.
-   Use authenticated Supabase access for user-scoped reads/writes.
-   Agent runs must remain project-scoped.
-   Tool execution must be explicitly authorized.
-   Service/executor access should be isolated from end-user access.
-   Do not weaken existing RLS merely to make the UI work.

## 8. Current Application Architecture

Current dashboard modules:

``` text
/app/dashboard
/app/datasets
/app/profiling
/app/data-quality
/app/observability
/app/agents
```

Authentication routes/components are already present.

The dashboard uses authenticated user enforcement and links to the
module pages.

## 9. AI Agents Current State

### Completed

-   AI Agents dashboard card added.
-   `/agents` route created.
-   Production deployment verified.
-   AI Agents card visible in production.

### Current limitation

`/app/agents/page.tsx` is currently a static placeholder.

It currently presents:

``` text
AI Agents
Manage and run AI-powered data quality agents.

Profiling Agent
Analyze datasets, detect patterns and anomalies, and generate profiling results.

Enabled
Version 2.0
```

It is NOT yet connected to the real agent registry.

### Next implementation target

Replace the placeholder with:

``` text
AI Agents
    |
    +-- agent.agent_definitions
    |
    +-- agent.tool_definitions
    |
    +-- Run Agent
    |
    +-- agent.agent_runs
          |
          +-- agent.agent_run_steps
          +-- agent.agent_messages
          +-- agent.agent_artifacts
```

The implementation must use the actual remote schema and existing RLS
policies.

## 10. Live Re-verification Findings

### Migration history

Resolved and independently re-verified against the live project.

``` text
Local CLI history: 20260825000000
Remote Supabase history: 20260825000000
Migration name: profiling_agent_hardening_v6
```

### Agent registry discrepancy — IMPORTANT

The live database contains **two enabled rows** with the same `agent_key`
`profiling_agent`:

``` text
Profiling Agent | version 1.0 | enabled | 8 tools
Profiling Agent | version 2.0 | enabled | 12 tools
```

This is real live database state and was not represented in the earlier
checkpoint. It must be resolved deliberately before building execution
selection logic. We must not guess which version should be canonical.

### Agent RLS — independently verified

All six agent tables have RLS enabled. Authenticated users currently have
SELECT policies on enabled agent/tool definitions and project-scoped SELECT
policies for runs, steps, messages, and artifacts. Anonymous users do not
have SELECT privilege on these tables.

### Security advisor findings — OPEN

The live Supabase security advisor currently reports WARN-level findings for:

- `public.create_file_dataset(...)` — authenticated users can execute a
  `SECURITY DEFINER` function.
- `public.create_organization(...)` — authenticated users can execute a
  `SECURITY DEFINER` function.
- `public.create_project(...)` — authenticated users can execute a
  `SECURITY DEFINER` function.
- Leaked password protection is disabled.

These are not automatically defects; the intended security model must be
verified before changing them. They are now explicit open security-review
items.

### Performance advisor findings — informational/warnings

The live performance advisor reports duplicate indexes, including duplicate
indexes in `agent.agent_runs`, `agent.agent_run_steps`, and other schemas,
and unused-index notices. These are not part of the immediate agent UI
implementation and must not be deleted blindly.

### `pg_net`

A previous schema diff warned about dropping `pg_net`. Live database verification
now shows **no installed `pg_net` extension**. Therefore the prior diff warning
was not evidence that an installed production `pg_net` extension should be
removed. Do not add or remove extensions based solely on that historical diff.

### Supabase CLI

Verified CLI version:

``` text
2.115.0
```

`supabase db query` without local Supabase/Docker attempted to connect
to:

``` text
127.0.0.1:54322
```

Therefore local `db query` should not be used as a substitute for remote
inspection unless the local Supabase stack is running.

For remote schema inspection, `npx supabase db dump --linked` was
successfully used.

## 11. Working Rules

1.  Verify before changing.
2.  Do not guess database columns, RLS policies, or migration state.
3.  Keep database changes separate from UI changes where practical.
4.  Make small, recoverable changes.
5.  Test before committing.
6.  Commit meaningful milestones.
7.  Push completed milestones to GitHub.
8.  Re-check `git status` after each milestone.
9.  Re-check Supabase migration history after migration changes.
10. Keep backup directories outside normal production commits.
11. Never expose secrets, service-role keys, or credentials in source
    control.
12. Prefer evidence from the repository and remote schema over
    assumptions.

## 12. Checkpoint / Save Cadence

At every meaningful milestone:

``` text
1. Inspect current Git state
2. Make the smallest change
3. Run relevant checks/tests
4. Review diff
5. Commit
6. Push to origin/main
7. Verify git status
8. Verify deployment when applicable
9. Update this PROJECT_STATE.md
```

For risky database changes:

``` text
1. Create/verify a recoverable checkpoint
2. Back up relevant schema
3. Review SQL
4. Apply change
5. Verify remote schema
6. Verify migration history
7. Update PROJECT_STATE.md
8. Commit and push
```

## 13. Current Work Queue

### Priority 1 --- Agent registry

-   Inspect exact `agent.tool_definitions` columns.
-   Inspect exact agent RLS policies.
-   Connect `/agents` to `agent.agent_definitions`.
-   Display enabled agents from the database.

### Priority 2 --- Tool registry

-   Display tools associated with an agent.
-   Verify tool authorization and project scope.
-   Do not expose internal/service credentials.

### Priority 3 --- Agent execution

-   Add project/dataset selection.
-   Create `agent.agent_runs`.
-   Execute through a secure server-side mechanism.
-   Track run status.
-   Persist steps/messages/artifacts as appropriate.

### Priority 4 --- Observability

-   Display run history.
-   Display current/previous run status.
-   Display errors and outputs.
-   Preserve organization/project isolation.

### Priority 5 --- Production hardening

-   End-to-end authenticated tests.
-   RLS tests.
-   Unauthorized cross-organization access tests.
-   Error handling.
-   Build verification.
-   Production smoke test.

## 14. Re-verification Status

The last confirmed production state is:

``` text
Git:
30a429b Add AI Agents dashboard

Supabase:
20260825000000 local == remote

Production:
https://data-quality-ai-platform.vercel.app/dashboard

UI:
AI Agents card visible
```

This is the recovery baseline.

## 15. Remaining Verification Gap

The local Windows working tree was re-checked during the current session. The
following is the latest user-provided evidence:

``` text
git status --short
 M .gitignore
 M PROJECT_STATE.md
?? pnpm-workspace.yml
?? supabase/
```

A full untracked-files check showed the following intentionally relevant files
under `supabase/`:

``` text
?? supabase/migrations/20260825000000_profiling_agent_hardening_v6.sql
?? supabase/remote_agent_schema.sql
?? supabase/remote_app_schema.sql
?? supabase/remote_profiling_schema.sql
?? supabase/remote_public_schema.sql
?? supabase/verify_agent_schema.sql
?? supabase/verify_profiling_schema.sql
```

The `supabase/.temp/` contents are ignored by `.gitignore` and were confirmed
with `git check-ignore -v`. The two local backup directories are also ignored:

``` text
supabase_backup_before_history_fix/
supabase_backup_before_migration_repair/
```

`PROJECT_STATE_v1.md` is intentionally ignored and must be ignored going forward.
It is a disposable alternate project-state draft and is not the continuity
source. `PROJECT_STATE.md` is the authoritative continuity document.

The current `.gitignore` changes are not yet committed. The `supabase/`
production-relevant migration and schema/verification files are currently
untracked and therefore are not yet in GitHub. This must be resolved deliberately
before claiming that the repository contains all required Supabase project files.

Required local verification at the start of the next session remains:

``` powershell
git status --short
git status --short --untracked-files=all
git log --oneline -5
git rev-parse HEAD
git rev-parse origin/main
npx supabase migration list
Get-Content .\app\dashboard\page.tsx
Get-Content .\app\agents\page.tsx
Get-Content .\PROJECT_STATE.md
```

## 16. Last Known Good State

Before implementing agent execution, inspect:

``` powershell
Select-String -Path .\supabase\remote_agent_schema.sql `
  -Pattern 'CREATE TABLE|CREATE POLICY|ALTER TABLE.*ENABLE ROW LEVEL SECURITY|GRANT|REVOKE' |
  Select-Object LineNumber, Line

Select-String -Path .\supabase\remote_agent_schema.sql `
  -Pattern 'tool_definitions|tool_key|tool_name|tool_type|configuration|input_schema|output_schema' |
  Select-Object LineNumber, Line
```

Then implement the agent registry against the verified schema.

## 17. Session Continuity

When continuing this project in a new session:

1.  Read `PROJECT_STATE.md`.
2.  Check `git status`.
3.  Check `git status --short --untracked-files=all`.
4.  Check `git log --oneline -5`.
5.  Check `git rev-parse HEAD` and `git rev-parse origin/main`.
6.  Check `npx supabase migration list`.
7.  Inspect the relevant current source files.
8.  Verify the database schema before changing database-dependent code.
9.  Determine deliberately which `supabase/` files should be committed; do not
    assume that untracked schema dumps are already present on GitHub.
10. Continue from **Current Work Queue**, not from assumptions.

## 18. Latest Local Repository / Ignore-State Evidence

The current `.gitignore` contains these additional intentional rules:

``` text
# Supabase local state
supabase/.temp/

# Local Supabase backup snapshots
supabase_backup_before_history_fix/
supabase_backup_before_migration_repair/

# Alternate project-state draft
PROJECT_STATE_v1.md
```

`git check-ignore -v` explicitly confirmed that these paths are ignored by the
above rules. The earlier PowerShell error

``` text
supabase/.temp/: The term 'supabase/.temp/' is not recognized as a name of a
cmdlet, function, script file, or executable program.
```

was only a shell-command/path-entry mistake; it is not evidence of a Supabase
problem. Use commands such as `Get-ChildItem .\supabase\.temp` or Git
ignore checks rather than entering a directory path by itself at the PowerShell
prompt.

The latest visible Supabase file inventory is:

``` text
supabase/remote_agent_schema.sql
supabase/remote_app_schema.sql
supabase/remote_profiling_schema.sql
supabase/remote_public_schema.sql
supabase/verify_agent_schema.sql
supabase/verify_profiling_schema.sql
supabase/migrations/20260825000000_profiling_agent_hardening_v6.sql
```

The backup directories contain copies of the remote schema dumps and the
hardening migration used during repair/history work. They are intentionally
excluded from production commits.

## 19. Dependency / Package-Manager Continuity Note

A dependency override instruction was supplied during the current session:

``` yaml
overrides:
  hono: 4.12.25
```

This must be preserved when continuing package/dependency work. The exact file
containing this override was not established by the evidence captured in this
checkpoint, so do not assume its location without inspecting the repository.

`pnpm-workspace.yml` is currently untracked and must be inspected before deciding
whether it belongs in the production repository.

## 20. Supabase Grant / Secret-Scan Interpretation

A repository-wide PowerShell search for strings such as `password`,
`secret`, `service_role`, `anon_key`, `access_token`, `Bearer`, and `token`
was run against `supabase\*.sql`. The visible results were database GRANT
statements in the remote/verification schema dumps, including grants to the
PostgreSQL `service_role` role.

Important distinction: these results are schema metadata showing database
privileges; they are not service-role credentials or API keys. No credential
value should be copied into source control. Continue to treat actual service
role keys, anon keys, passwords, access tokens, and other secrets as forbidden
in Git.

## 21. Immediate Next-Session Starting Point

Before implementing the real AI Agent registry UI, do not perform another
migration repair/reset. First establish the repository checkpoint:

``` powershell
git status --short --untracked-files=all
git diff -- .gitignore PROJECT_STATE.md
git log --oneline -5
git rev-parse HEAD
git rev-parse origin/main
npx supabase migration list
```

Then inspect the exact agent schema/policies from the already captured schema
dumps and the live project as required. The next implementation target remains
connecting `/app/agents` to the real `agent.agent_definitions` registry, while
resolving the duplicate enabled `profiling_agent` versions deliberately before
adding execution-selection logic.

Do not claim the full repository is backed up on GitHub until the currently
untracked `supabase/` files and the intended `.gitignore` / `PROJECT_STATE.md`
changes have been deliberately reviewed, committed, pushed, and verified.
