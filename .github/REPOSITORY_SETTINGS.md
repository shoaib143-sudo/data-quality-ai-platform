# GitHub repository settings baseline

This file is the auditable source of truth for settings that GitHub stores outside the repository. The repository governance workflow verifies the corresponding committed contracts. A repository administrator must apply and periodically attest the live settings.

## Main branch ruleset

Import or recreate `.github/rulesets/main.json` under **Settings → Rules → Rulesets** and keep it active.

Required controls:

* target the default branch;
* prohibit deletion and non-fast-forward updates;
* require linear history and pull requests;
* dismiss stale reviews and require every review thread to be resolved;
* require the branch to be current before merge;
* configure no bypass actors;
* require these checks:
  * `build`
  * `analyze`
  * `revalidate`
  * `certify`
  * `runtime-slo`
  * `clean-database-reconstruction`
  * `dependency-audit`
  * `repository-governance`

Zero approving reviews is a temporary single-maintainer exception. Increase it to one and require code-owner review as soon as an independent maintainer is available.

## Actions

Under **Settings → Actions → General**:

* set default workflow permissions to read repository contents;
* prevent GitHub Actions from creating or approving pull requests;
* allow only actions required by committed workflows;
* require actions to use full-length commit SHAs when the account plan supports the policy.

Sensitive credentials must be scoped to the single step that consumes them. Production or service-role credentials should use a protected environment with required reviewers when an independent reviewer is available.

## Security

Under **Settings → Code security**:

* enable the dependency graph;
* enable Dependabot alerts and security updates;
* enable code scanning;
* enable secret scanning and push protection;
* enable private vulnerability reporting.

Review open alerts after enabling each control. Do not dismiss alerts without recorded evidence.

## Merge and repository hygiene

Under **Settings → General**:

* use squash merge as the default integration method;
* disable merge commits when linear history is required;
* enable automatic deletion of head branches;
* enable branch updates for pull requests;
* keep the default branch named `main`.

## Quarterly attestation

A repository administrator should verify this baseline quarterly and after any ownership, plan, integration, or release-process change. Record exceptions with owner, reason, compensating control, and review date.
