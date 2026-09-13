# Persona UI Implementation and Release Discussion Summary

**Date:** 2026-09-14 (Asia/Singapore)  
**Status:** Active release handoff

## Summary

The extended persona UI discussion converged on a single release objective: make DataNexus feel like one coherent governed product while giving each of the thirteen personas a landing experience aligned to the work that persona performs.

The work was divided into ordered batches so visual changes would not obscure authorization or governance regressions.

## User experience decisions

The reference landing-page treatment is the visual baseline for the persona experiences and broader product. Spacing, dark navy surfaces, card treatment, typography hierarchy, controls and information density should be consistent across DataNexus.

Landing content must vary by persona. Senior Leadership is intentionally business-oriented and non-technical. Operational, governance, risk, privacy, administrative, technical, metadata and quality personas receive progressively different emphasis according to their core questions and application areas.

The Data Trust section requires a Data Domain selector. **Data Domain** is the canonical term rather than mixing domain/product nomenclature.

Every meaningful UI affordance should lead to useful underlying information or an appropriate governed action. False affordances are defects. The solution is not to widen authorization merely to make an affordance work.

## AI Agent discussion outcome

The original design exposed DataNexus AI Agent in more than one place. This violated the no-duplicate-information rule and consumed valuable right-side dashboard space.

The accepted interaction is one small floating icon on the left. Clicking it opens a hovering in-page chat panel. The panel may expand but remains an overlay and must not permanently reduce dashboard space.

The AI conversation is persona-aware and evidence-aware. It is not a source of governance authority. Missing evidence must be represented as unavailable rather than guessed.

## Implementation batches

### Foundation and authorization

PR #398 hardened mutation visibility and execution capability boundaries and is merged.

PR #401, Batch 1, established the shared DataNexus visual system and is merged.

### Data Domain and landing scope

PR #402, Batch 2, implemented Data Domain selection and scope integrity and is merged.

PR #400 represented a narrower earlier Data Domain path and was closed as superseded to avoid duplicate release paths.

### Persona compositions

PR #405, Batch 3, replaces generic landing framing with persona-specific presentation driven by canonical presentation policies. At this capture point it has been refreshed directly onto merged Batch 2 and the protected workflow suite is running.

### Floating AI Agent

PR #407, Batch 4, implements the single floating persona-aware AI Agent, removes the duplicate sidebar surface, adds persona bootstrap and governed evidence context, and includes a deterministic behavior contract. It will be refreshed onto the exact Batch 3 merge before release.

### Whole-product theme

PR #409, Batch 5, applies the DataNexus page shell across the product and adds representative workspace theme verification. It will be refreshed onto the exact Batch 4 merge before release.

## Release discipline

Concurrent changes repeatedly advanced `main` during this work. Rather than force stale branches through protection, each affected batch was rebuilt on the latest accepted production baseline and rerun through protected CI.

This is intentional release behavior. A batch is not considered ready merely because an earlier head was green.

The current release sequence is:

`#405 -> #407 -> #409 -> production deployment -> thirteen-persona authenticated acceptance`

## What remains open

The remaining work is integration and acceptance rather than a redesign of the persona model:

- complete and merge Batch 3 after protected checks;
- refresh, validate and merge Batch 4;
- refresh, validate and merge Batch 5;
- deploy the resulting main revision;
- execute the real authenticated task matrix for all thirteen personas;
- verify Data Domain behavior, persona content, drilldowns, AI overlay, responsive behavior and theme;
- preserve expected-denial evidence and remediate genuine defects narrowly;
- keep Living Tree PR #363 as a separate acceptance track.

## Important non-claims

This discussion summary does not claim that all thirteen personas have passed production testing.

It does not claim that the current stacked UI branches are already deployed.

It does not include service-account passwords or other credentials.

It does not treat automated CI as a substitute for authenticated production acceptance.

## Architecture cross-reference

The durable architecture decisions and exact release-state handoff are captured in:

`Architecture/2026-09-14-persona-ui-release-architecture-and-implementation-handoff.md`
