# Governed learning activation — production entry and rollback runbook

Date: 2026-10-20
Status: PREPARED, NOT EXECUTED
Scope: post-merge operational hardening only. This document does not authorize production deployment, authority assignment, provider spend, promotion, or a live prospective experiment.

## Preconditions

Production entry is blocked unless all of the following are true on one exact source SHA:

1. repository-wide required CI is green;
2. the release SHA is recorded before deployment;
3. the Supabase migration set reconstructs cleanly;
4. no evaluator, assigner, or promotion authority is granted implicitly by migration;
5. the provider/model spend policy is explicitly approved if non-zero;
6. the held-out benchmark manifest is SEALED and version-pinned;
7. baseline, candidate, and rollback definitions resolve to immutable executable artifacts;
8. rollback target remains recoverable and independently addressable.

## Deployment sequence

The governed sequence is:

1. record current production Vercel SHA and current Supabase migration state;
2. deploy the approved application SHA through the normal release path;
3. apply only the approved migration `20261020120000_learning_runner_activation_bindings.sql`;
4. verify the three activation tables exist with RLS enabled;
5. verify direct browser mutation is denied;
6. verify service-role table access is SELECT-only and writes require validation RPCs;
7. verify no promotion-authority row was created;
8. verify no evaluator capabilities were assigned by deployment;
9. run Supabase security/performance advisors;
10. run production provenance checks from source SHA → build → DB schema → runtime;
11. run read-only/fail-closed negative journeys before any prospective experiment.

Do not proceed to live evaluation if any step produces ambiguous evidence.

## Rollback triggers

Rollback or hold immediately if any of the following occurs:

- deployed SHA differs from approved SHA;
- migration checksum/source differs from reviewed migration;
- unexpected authority or capability assignment appears;
- RLS or RPC execution grants are broader than expected;
- an immutable artifact can be updated, deleted, or rebound;
- HELD_OUT replay accepts training data, stale dataset versions, or unsealed manifests;
- proposer/evaluator separation fails;
- evaluator current authorization cannot be proven;
- synthetic execution creates reservations, settlements, cost events, tokens, or provider traffic;
- prospective execution occurs without an explicitly approved non-zero/zero budget policy;
- baseline/candidate executable identity cannot be reconstructed exactly.

## Rollback procedure

Application rollback:
- redeploy the previously recorded production Vercel SHA using the governed release mechanism.

Database rollback:
- do not drop evidence tables blindly;
- stop activation first;
- revoke/hold any newly assigned evaluator or promotion capabilities;
- preserve append-only evidence for audit;
- use an explicitly reviewed compensating migration if schema rollback is required.

Experiment rollback:
- cancel dispatch;
- reject late results;
- retain terminal evidence;
- restore the bound rollback agent definition;
- do not promote the candidate;
- record the stop reason and exact evidence identifiers.

## Post-deployment verification

Required production evidence:

- exact release SHA;
- exact migration identity;
- table/RLS/RPC grant snapshot;
- zero unexpected authority assignments;
- object lifecycle immutability check;
- replay binding integrity check;
- current proposer/evaluator authorization check;
- negative/failure-path results;
- Supabase advisor results;
- Vercel deployment identity;
- rollback target verification.

## Authority boundary

The following remain explicit governance decisions and are not part of deployment:

- who receives `agent.learning.evaluate`;
- who receives `agent.learning.assign_evaluator`;
- who receives promotion authority;
- which evaluator is independent for a real experiment;
- which benchmark dataset is approved;
- what statistical decision rule is locked;
- whether any non-zero provider/model spend is allowed.

## Completion terminology

- IMPLEMENTED: source merged and exact-head CI green.
- PRODUCTION_VERIFIED: application + DB deployed and live provenance/security/negative checks pass.
- EMPIRICALLY_SELF_IMPROVING: a separately authorized real prospective experiment demonstrates sustained improvement without authority, safety, latency, or cost regression.
