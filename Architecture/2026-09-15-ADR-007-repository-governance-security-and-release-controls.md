# ADR-007: Repository Governance, Security, and Release Controls

Date: 2026-09-15
Status: Accepted and implemented

## Context

The repository reached a point where code-level governance checks and GitHub administrative controls needed to be aligned into one enforceable release boundary. The goal was to prevent administrative settings from becoming weaker than the repository-controlled certification model.

The repository already contained extensive GitHub Actions certification, CodeQL advanced setup, dependency auditing, repository governance tests, runtime SLO verification, database reconstruction validation, and Vercel deployment checks. The remaining architectural concern was whether branch governance, merge methods, Actions permissions, dependency protection, and secret protection would enforce the same standard at the repository boundary.

## Decision

The repository governance boundary is defined by an active branch ruleset named `Protect main certification` targeting the default branch `main`.

The ruleset has no bypass actors and enforces:

- deletion restriction;
- force-push protection;
- linear history;
- pull-request-only changes;
- strict branch currency before merge;
- stale approval dismissal after new pushes;
- conversation resolution;
- zero required approvals temporarily for the current single-maintainer model;
- squash merge as the only allowed merge method.

The mandatory GitHub Actions certification set is:

1. `build`
2. `analyze`
3. `revalidate`
4. `certify`
5. `runtime-slo`
6. `clean-database-reconstruction`
7. `dependency-audit`
8. `repository-governance`

These checks are bound to the GitHub Actions integration rather than accepted as unscoped status names.

## Merge architecture

Repository merge configuration is standardized as follows:

- squash merge enabled;
- merge commits disabled;
- rebase merging disabled;
- automatic deletion of merged branches enabled;
- pull request branch update suggestions enabled;
- auto-merge enabled.

This keeps the persisted history linear while preserving pull-request review, certification, and traceability.

## GitHub Actions trust boundary

The administrative Actions posture is part of the architecture, not an optional convenience setting.

Required controls are:

- actions and reusable workflows may run, but every referenced action must be pinned to a full-length commit SHA;
- fork workflows from all external contributors require approval;
- default `GITHUB_TOKEN` permissions are read-only for repository contents and packages;
- GitHub Actions may not create or approve pull requests;
- workflow artifacts and logs are retained for 90 days.

Sensitive credentials must remain scoped to the minimum consuming step. Workflow-level or broadly scoped privileged credentials are rejected by repository governance tests.

## Security architecture

The repository security boundary includes:

- Private vulnerability reporting;
- Dependency graph;
- Automatic dependency submission;
- Dependabot alerts;
- Dependabot malware alerts;
- Dependabot security updates;
- Grouped security updates;
- CodeQL advanced setup;
- Copilot Autofix;
- Secret Protection;
- Push protection.

AI findings remains intentionally disabled and is outside this ADR until separately evaluated.

CodeQL remains on advanced setup with the following merge-blocking thresholds:

- security alerts: High or higher;
- standard alerts: Only errors.

## Release evidence policy

A merge or release is not considered certified merely because a workflow exits successfully. Required evidence must be attributable to the exact commit under review.

The current policy is:

- all eight required GitHub Actions checks must succeed on the exact pull request head;
- Vercel must succeed when applicable;
- missing live-database credentials are represented as `NOT_MEASURED`, never as `PASS`;
- administrative controls must not be weakened to obtain a green result;
- no bypass actor may be introduced as an operational shortcut.

## Implementation record

PR #511, `security: Harden GitHub repository configuration`, completed the repository-controlled portion of this decision and was merged into `main` at:

`e9a550c7b3beed793e3cf0396a83104550b017b6`

The merged source branch was deleted after completion.

## Consequences

### Positive

- Repository administration and CI certification now enforce the same trust model.
- Main cannot be changed through force pushes, direct merge methods, or unscoped checks.
- Dependency and secret detection operate earlier in the software supply chain.
- Exact-head certification improves auditability and reduces stale-check risk.
- Linear squash history simplifies release traceability.

### Trade-offs

- Single-maintainer operation currently uses zero mandatory approvals, so automated certification and conversation resolution carry more of the enforcement burden.
- Full-length action pinning requires deliberate maintenance when action versions are updated.
- Push protection may add friction to commits containing detected secrets, which is intentional.
- Advanced CodeQL setup requires workflow ownership and maintenance rather than relying on GitHub default setup.

## Non-decisions

This ADR does not:

- enable AI findings;
- change CodeQL from advanced setup to default setup;
- change application architecture, Supabase architecture, connector architecture, or profiling architecture;
- authorize bypass actors;
- redefine live-database evidence as passing when credentials are unavailable.

## Review trigger

Revisit this ADR when any of the following occurs:

- the maintainer model expands enough to require mandatory human approvals;
- required certification checks materially change;
- GitHub Actions trust or token permissions need to expand;
- AI findings is proposed for production use;
- repository ownership moves to an organization with centralized enterprise policies.
