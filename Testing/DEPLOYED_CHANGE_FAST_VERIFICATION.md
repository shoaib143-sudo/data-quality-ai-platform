# Deployed Change Fast Verification

## Objective

Verify the exact deployed revision as soon as possible after a runtime change.

## Pipeline

```text
PR runtime change
 -> exact Vercel Preview SHA
 -> fast contract checks
 -> deployed Preview smoke/E2E
 -> merge only after PASS
 -> Production exact-main deployment
 -> production smoke
```

Documentation-only changes under `Testing/**`, `docs/**`, or Markdown files do not trigger this application-verification workflow.

## Exact revision invariant

Preview verification must match the pull request head SHA. Production verification must independently match the merged `main` SHA. Preview success does not replace production smoke.

## Authentication and permissions

The Preview gate does not require Vercel API credentials in GitHub Actions. It uses the repository-scoped `github.token` with read-only `deployments` permission and consumes the deployment/status records published by the existing Vercel GitHub integration. The workflow runs in the ordinary `pull_request` security context and does not use `pull_request_target`.

No Vercel token, team ID, or project ID should be added solely for this gate. Secrets must never be committed to the repository.

## Failure behavior

The workflow times out rather than waiting indefinitely for a deployment. A missing, failed, or canceled exact-SHA Preview fails the gate. This prevents certification against stale deployments.

## Next expansion

The smoke endpoints are the bootstrap gate. The automated DataNexus harness will replace/extend them with affected-feature browser E2E, synthetic personas, isolated certification data, and machine reconciliation evidence.
