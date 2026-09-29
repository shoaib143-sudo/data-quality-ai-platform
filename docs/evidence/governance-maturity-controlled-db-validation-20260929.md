# Governance Maturity Controlled Database Validation

Date: 2026-09-29

Environment: isolated Supabase project `DataNexus UX E2E Controlled`.

Purpose: validate DN-GMA-1.0 persistence before any production database change.

## Results

The first controlled migration attempt exposed an invalid PL/pgSQL function body delimiter in `governance.start_maturity_assessment_cycle`. The feature migration was corrected to use a valid dollar-quoted body and a regression contract was added.

The corrected migration applied successfully.

Database validation confirmed:

* all four maturity persistence tables exist;
* row-level security is enabled on all four tables;
* anonymous and authenticated roles cannot execute the reassessment-cycle function;
* the server service role can execute the reassessment-cycle function;
* the reassessment function archives the prior cycle and leaves exactly one active cycle;
* a maturity value outside 0 through 5 is rejected by the database constraint;
* validation data was removed after the test.

The database performance advisor identified an unindexed evidence-to-response foreign key. The feature migration was hardened with `maturity_evidence_response_idx`, and the feature-specific advisor warning cleared after the controlled index migration.

The security advisor reports RLS-with-no-policy informational notices for these tables. This is intentional for this design: direct browser roles have no table grants and persistence access is routed through authenticated server APIs with organization-scope checks.

## Release boundary

This validation used the isolated E2E-controlled project. No production DataNexus database migration, merge, or production promotion is authorized by this evidence.
