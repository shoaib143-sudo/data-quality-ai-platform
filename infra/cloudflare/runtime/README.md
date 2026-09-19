# DataNexus Cloudflare canary runtime

This directory defines the secondary DataNexus web runtime. It is intentionally active-passive with Vercel remaining primary.

The Worker ingress routes ordinary canary traffic to a single Next.js standalone Container instance and blocks production-authority endpoints at the edge. The container is expected to receive only canary-scoped configuration and secrets.

## Cost boundary

Cloudflare Containers require Workers Paid. Repository validation may run without activating the service. Do not run a live deploy until the account owner explicitly approves the paid-plan activation.

## Required deployment identity

A governed deployment must provide:

- `DATANEXUS_COMMIT_SHA`: exact 40-character Git commit SHA
- `DATANEXUS_RELEASE_ID`: release/deployment identifier
- `DATANEXUS_BUILD_TIMESTAMP`: ISO-8601 build time

Application secrets are intentionally not declared in this repository. They must be configured as Cloudflare secrets only after canary authority is reviewed.

## Canary authority

The ingress blocks:

- durable worker scheduler execution
- production R2 CORS mutation
- Supabase-to-R2 migration
- R2 reference cutover
- production approval automation

Additional production mutations remain protected by the application's own authorization controls and must not receive unrestricted production credentials by default.
