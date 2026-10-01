# Prospective learning evaluation policy and baseline inventory

Date: 2026-09-30. Status: PREPARED, NOT ACTIVATED.
Implementation baseline: ab46b2fc7da5d66a7802ff822649e50d82d541f2.
Production activation: Release Governance run 36660080924 passed staging provenance, exact SHA, promotion and production health checks. Seven learning migrations applied in existing Supabase project. No paid branch is required.

## Live read-only inventory

Checked on 2026-09-30 after activation. agent.agent_run_outcome_coverage: 0 rows. agent.learning_prospective_outcomes: 0 rows. No manually inserted evidence, backfill, candidate activation or paid evaluation was performed.

| Governed agent | Enabled definition version | Historical runs | Proposed primary rubric |
| --- | --- | ---: | --- |
| profiling_agent | 2.0 | 72 | Correct independently recomputed metrics and complete profile evidence |
| data_quality_agent | 1.0 | 44 | Correct rule results and findings against independently labeled expected results |
| steward_agent | 1.0 | 4 | Evidence-supported stewardship recommendation and correct owner/handoff |
| governance_analyst_agent | 1.0 | 3 | Correct policy/control interpretation and evidence-supported risk assessment |
| architect_agent | 1.0 | 14 | Correct schema/lineage/contract interpretation with source evidence |
| investigator_agent | 1.0 | 7 | Supported root-cause analysis, correct uncertainty and actionable handoff |
| executive_agent | 1.0 | 4 | Accurate evidence-grounded summary and prioritized business recommendations |
| support_agent | 1.0 | 5 | Correct supported answer, escalation and no invented capabilities |

Counts are historical agent_runs, not verified real outcome samples. Definition versions are inventory values, not immutable per-run version proof. Freeze the actual resolved skill, prompt, model, runtime, tool and policy versions before evaluation. Disabled profiling version 1.0 has zero runs. native_supervisor_agent and governance_orchestrator_agent are additional enabled runtime definitions outside the canonical eight-agent registry; do not silently count them as governed specialists.

## Policy decisions prepared for review

Use one experiment per agent, skill and applicable mode, with project/dataset scope, immutable baseline and candidate versions, independent evaluator identity, rubric version and evidence references. Begin with GUIDED. Evaluate GOVERNED_AUTO and FULL_AUTONOMOUS only where current authorization permits; do not infer support from a mode name. Keep SUPERVISED/HANDSFREE aliases and their original provenance. OFF is a denominator/control state, not an active candidate experiment. Never pool agents or modes to hide missing evidence.

The primary metric should be a predeclared binary independently verified task-quality pass rate, supported by the rubric above. The outcome collector's effectiveness field alone is not a complete correctness rubric. Track groundedness, completeness, confidence/abstention, tool correctness, handoff quality, authority, safety, cost, latency and recovery separately. Appropriate policy denial can be correct behavior; it must remain visible and must not be mislabeled as successful task completion.

Proposed practical gain: at least 0.05 absolute increase in quality pass rate, with candidate score at least 0.80. These are review proposals, not runtime configuration. The existing code permits a tie for human review and defaults to 20 benchmark cases; neither proves improvement. Predeclare a fixed sample using estimated baseline rate and paired discordance, minimum detectable gain, power and multiplicity adjustment across planned agent/mode comparisons. Do not manufacture a universal statistically sufficient sample count. Freeze the sample and analysis plan before candidate results are visible. Inadequate power, a tie or missing evidence yields INCONCLUSIVE.

For a claim, require the predeclared practical gain and a confidence interval supporting a positive difference. Use a paired analysis only when baseline and candidate share the same immutable held-out case and independent scoring. Prospective production outcomes without paired bindings require a predeclared randomized or otherwise justified contemporaneous comparison, not a paired-test label. Do not execute a mutating business operation twice to create a pair. Account for correlated cases from the same dataset/project and adjust family-wise claims across multiple agents/modes. Confirm sustained improvement in a second locked evaluation window.

Safety limits: zero authority expansion, unauthorized action, source-data remediation or prohibited regression. Stop immediately on such evidence, leakage, missing version identity, altered rubric, conflicting mode or broken provenance. Suspend the experiment on unavailable independent scoring or incomplete cost/latency accounting. Existing runtime budgets remain enforced. Additional external evaluation budget is zero until a specific positive cap is approved. Freeze per-run cost/token cap, total experiment cap, latency limit, stop timeout and rollback version before a canary; no unspecified paid model calls.

## Execution sequence

1. Inventory the selected project's currently authorized assets and agent modes through the application's actor-authorized surfaces. Record an explicit allowlist; no PUB Gold dependency.
2. Lock baseline identity, independent evaluator, rubric and outcome taxonomy. Calibrate evaluator against reviewed examples, including negative cases, before seeing candidate outcomes.
3. Observe newly completed normal baseline runs through the governed runtime. Existing terminal triggers capture coverage; delayed VERIFIED outcomes flow through the collector. Do not insert prospective rows or change old run statuses to generate samples.
4. Reconcile eligible terminal-run denominator with verified outcomes, pending verification, exclusions and missing evidence. Keep ineffective, partial, failed, cancelled, rejected, policy-blocked, rolled-back and unknown outcomes visible.
5. Create a narrowly scoped improvement proposal from verified failures, without changing allowlists, privileges, approval requirements or mutation boundaries.
6. Register an immutable manifest with TRAINING and HELD_OUT partitions. Separate datasets/time windows and reject duplicates or training overlap. Bind each held-out evaluation to independent baseline/candidate evidence.
7. Run essential negative/adversarial checks in disposable CI or private testing schema. Synthetic results remain excluded from live evidence. No new deployment or paid branch is needed for policy preparation.
8. Review the exact candidate, experiment scope, sample/analysis plan, independent evaluator, budgets, stop conditions and rollback. A document or green benchmark does not activate the candidate.
9. Run the approved controlled candidate within existing authority. Verify outcomes independently and compare at the locked analysis point; do not repeatedly peek until a favorable result.
10. Classify each agent/mode separately as IMPROVED, REGRESSED or INCONCLUSIVE. Review promotion and rollback with current authorization. Preserve both unfavorable and favorable evidence.

## Activation record required before candidate execution

All fields must be concretely bound, not inferred:
- Project ID and authorized dataset/version allowlist.
- Agent key, skill, supported mode and workload window.
- Baseline version/hash; candidate version/hash; rollback version/reference.
- Independent evaluator identity, rubric/calibration evidence and verification authority.
- Manifest ID/hash, temporal cutoff, training/held-out separation and binding references.
- Primary metric, practical gain, sample calculation, fixed sample/window, statistical method, correlation and multiplicity handling.
- Quality/safety thresholds, abstention/failure treatment and denominator reconciliation.
- Per-run and total cost/token caps, latency limit, timeout and immediate stop rules.
- Approval reference, experiment operator, rollback operator and retention/deletion policy.

## Read-only monitoring queries

Run under an appropriately authorized operator. Aggregate output avoids customer payloads.

```sql
select agent_key, run_mode, count(*) as terminal_runs,
       count(*) filter (where production_eligible) as eligible_runs,
       count(*) filter (where synthetic_or_test_detected) as synthetic_runs
from agent.agent_run_outcome_coverage
group by agent_key, run_mode order by agent_key, run_mode;

select agent_key, agent_version, run_mode, outcome_type,
       count(*) as verified_outcomes
from agent.learning_prospective_outcomes
group by agent_key, agent_version, run_mode, outcome_type
order by agent_key, agent_version, run_mode, outcome_type;
```

Missing groups must appear as unmeasured in Command Center, never as perfect scores. Use denominator view and source evidence to assess completeness; counts alone do not prove business effectiveness.

## Current completion boundary

Infrastructure and implementation: activated and release checks passed.
Policy preparation and live inventory: complete.
Prospective baseline: zero captured outcomes at this inspection.
Candidate comparison and proven improvement: not yet available.
Exact blockers to live candidate execution: no selected project/dataset allowlist, immutable candidate, independent evaluator or frozen sample/budget record. Preparation approval does not supply these values.
