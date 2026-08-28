# DataNexus AI Capability Matrix

**Date captured:** 2026-08-28
**Status:** Strategic capability baseline

## Purpose

This document preserves the broad AI capability exploration discussed for DataNexus AI. It is intentionally broader than the first implementation scope. Capabilities should be prioritised by business value, criticality, evidence quality, risk, and readiness rather than discarded because they are not part of the current release.

The matrix is designed to answer five executive questions for every capability:

1. What problem does it fix?
2. How does AI help?
3. How does AI explain the problem?
4. How can AI predict risk?
5. What corrective action can AI recommend or, where governed, execute?

## Autonomy model

| Level | Meaning |
|---|---|
| Observe | AI monitors and collects evidence |
| Explain | AI explains what happened and why |
| Recommend | AI proposes rules, actions, or priorities |
| Human approved | AI prepares and executes an action only after approval |
| Governed autonomous | AI executes within explicit policy, permissions, risk and verification controls |
| Learning loop | AI verifies outcomes and improves future recommendations |

## Capability matrix

| # | Capability | Problem fixed | How AI contributes | Example | Business benefit | Initial priority |
|---:|---|---|---|---|---|---|
| 1 | Automated data profiling | Teams do not know dataset condition | AI summarises statistical and structural characteristics | Profile a customer table and identify nulls, duplicates, skew and cardinality | Faster assessment and lower manual effort | P0 |
| 2 | Column classification | Columns are poorly understood | AI infers semantic meaning from names, values and context | Identify `email_address` as contact PII | Better governance and discovery | P0 |
| 3 | Sensitive data detection | PII and sensitive fields are missed | AI detects semantic and content patterns | Detect passport numbers in a free text field | Reduced privacy exposure | P0 |
| 4 | Critical data element identification | Critical fields are not consistently identified | AI combines business context, usage and metadata | Identify customer_id as a CDE | Better prioritisation | P0 |
| 5 | Data quality rule suggestion | Rule creation is manual and slow | AI proposes rules from observed patterns and policy | Suggest `customer_id must be unique and non-null` | Faster quality engineering | P0 |
| 6 | Automated rule generation | Existing standards are difficult to operationalise | AI translates definitions into executable checks | Convert a policy statement into a completeness rule | Faster governance implementation | P1 |
| 7 | Data quality scoring | Raw checks are difficult to interpret | AI aggregates dimensions into meaningful scores | Give a critical dataset a 82/100 quality score | Executive visibility | P0 |
| 8 | Anomaly detection | Unusual behaviour is discovered late | AI learns normal distributions and behaviour | Detect an unusual 40% drop in transaction volume | Earlier intervention | P0 |
| 9 | Drift detection | Data changes silently over time | AI compares current and historical profiles | Detect a date column changing format | Prevent downstream failures | P0 |
| 10 | Schema drift detection | Upstream schema changes break pipelines | AI identifies structural changes and likely impact | New column added to an upstream table | Reduced pipeline incidents | P0 |
| 11 | Distribution drift | Statistical characteristics change without schema change | AI detects shifts in distributions | Average transaction amount changes materially | Early business risk detection | P1 |
| 12 | Duplicate detection | Duplicate records corrupt analytics | AI identifies exact and semantic duplicates | Detect repeated customer records with different spellings | Better trust in reporting | P0 |
| 13 | Missing data analysis | Nulls are treated as a simple metric | AI explains patterns and likely causes | Missing region values only for one source system | Targeted remediation | P0 |
| 14 | Outlier detection | Extreme values are missed | AI identifies context-sensitive outliers | One invoice is 100x normal value | Fraud and quality risk reduction | P1 |
| 15 | Data freshness monitoring | Stale datasets go unnoticed | AI learns expected arrival patterns | Daily dataset has not refreshed by expected time | Operational reliability | P0 |
| 16 | Data timeliness prediction | Teams react only after SLA breach | AI predicts likely SLA misses | Pipeline is trending toward a 2 hour delay | Proactive operations | P1 |
| 17 | Data completeness prediction | Missing data is discovered after consumption | AI predicts expected completeness | Next feed likely to arrive 25% incomplete | Proactive quality management | P1 |
| 18 | Root cause analysis | Engineers spend hours tracing failures | AI combines logs, lineage, metadata and quality results | Trace a failed dashboard metric to an upstream load | Faster incident resolution | P0 |
| 19 | Cross dataset correlation | Problems span multiple datasets | AI correlates related quality signals | Customer counts diverge between CRM and warehouse | Faster investigation | P0 |
| 20 | Cross system reconciliation | Systems disagree on important values | AI identifies mismatches and patterns | Finance total differs from operational ledger | Reduced reconciliation effort | P0 |
| 21 | Referential integrity investigation | Broken relationships are hard to diagnose | AI detects and explains orphan records | Orders reference missing customers | Better data integrity | P0 |
| 22 | Business rule violation detection | Business rules are distributed across documents and code | AI extracts and checks rules | Regulatory customer age requirement violated | Better compliance | P0 |
| 23 | Policy to rule translation | Policies remain documents instead of controls | AI converts policy language into candidate controls | Turn retention policy into a candidate monitoring rule | Operationalised governance | P1 |
| 24 | Standards interpretation | Standards are difficult to apply consistently | AI interprets standards in context | Map a naming standard to a proposed schema | Consistency | P1 |
| 25 | Regulatory requirement mapping | Regulations are disconnected from data | AI maps requirements to datasets and fields | Identify fields relevant to a regulatory reporting requirement | Reduced compliance effort | P1 |
| 26 | Data classification | Classification is incomplete or inconsistent | AI classifies data using metadata and content | Public, internal, confidential, restricted | Better security and governance | P0 |
| 27 | Business glossary generation | Definitions are missing | AI proposes definitions from usage and documentation | Generate a definition for `active_customer` | Better shared understanding | P1 |
| 28 | Data asset descriptions | Catalogues contain empty or weak descriptions | AI generates descriptions with evidence | Describe a customer transaction dataset | Better discovery | P0 |
| 29 | Metadata enrichment | Metadata is incomplete | AI fills candidate metadata fields | Suggest owner, domain, sensitivity and purpose | Lower governance overhead | P1 |
| 30 | Dataset ownership inference | Ownership is unclear | AI infers likely owners from usage and operational context | Identify likely business owner for a critical dataset | Faster accountability | P1 |
| 31 | Data lineage interpretation | Lineage exists but is hard to understand | AI explains upstream and downstream dependencies | Explain why a source change affects 12 reports | Better impact analysis | P1 |
| 32 | Impact analysis | Change impact is difficult to assess | AI combines lineage, criticality and usage | Predict reports affected by a schema change | Safer change management | P0 |
| 33 | Incident summarisation | Incident information is fragmented | AI creates concise evidence based summaries | Summarise a failed nightly load | Faster response | P0 |
| 34 | Incident classification | Incidents are inconsistently categorised | AI classifies severity, domain and root cause type | Categorise a PII exposure as high severity | Better triage | P0 |
| 35 | Incident prioritisation | Teams cannot address every issue immediately | AI ranks issues using criticality, risk and impact | Prioritise a regulatory CDE issue over a low risk dataset | Better resource allocation | P0 |
| 36 | Risk scoring | Risk is difficult to quantify consistently | AI combines quality, criticality, sensitivity and business impact | Raise risk for a failing financial CDE | Risk based governance | P0 |
| 37 | Predictive risk monitoring | Risks are detected too late | AI forecasts likely failures | Predict that quality will breach threshold next week | Proactive governance | P1 |
| 38 | Quality trend prediction | Trends are buried in historical data | AI forecasts quality trajectories | Dataset quality declining 5 points per month | Early intervention | P1 |
| 39 | Pipeline failure prediction | Failures are reactive | AI detects leading indicators | Increasing latency predicts tomorrow's pipeline failure | Reduced downtime | P1 |
| 40 | SLA risk prediction | SLA breaches are discovered after the fact | AI predicts probability of breach | 78% probability of missing reporting SLA | Better operational response | P1 |
| 41 | Remediation recommendation | Engineers need to determine corrective action | AI proposes evidence based fixes | Suggest source validation before downstream reload | Faster recovery | P0 |
| 42 | Remediation planning | Fixes require coordination | AI creates ordered remediation plans | Validate source, repair mapping, rerun pipeline, verify outputs | Reduced resolution time | P1 |
| 43 | Safe automated remediation | Low risk fixes consume manual effort | AI executes policy approved actions | Regenerate descriptions or apply approved metadata classification | Lower operating cost | P1 |
| 44 | Human approval workflow | Autonomous actions require control | AI presents evidence and proposed action for approval | Steward approves a proposed quality rule | Controlled automation | P0 |
| 45 | Verification after remediation | Fixes are not always validated | AI reruns relevant checks and compares outcomes | Confirm completeness returned above 99% | Prevent false closure | P0 |
| 46 | Rollback recommendation | Remediation can introduce new issues | AI identifies when rollback is safer | Revert a schema change after downstream failures | Lower remediation risk | P1 |
| 47 | Agent based investigation | Complex investigations require many tools | AI agent coordinates profiling, metadata, lineage and logs | Investigate why a job is stuck at 100% | Faster expert level investigation | P0 |
| 48 | Agent based quality analyst | Repetitive analysis consumes expert time | AI agent continuously reviews quality | Daily review of critical datasets | Scalable governance | P1 |
| 49 | Agent based data steward | Stewardship tasks are repetitive | AI agent proposes classifications, definitions and rules | Review newly onboarded columns | Increased steward capacity | P1 |
| 50 | Agent based incident investigator | Incident response requires multiple systems | Agent gathers evidence and forms a hypothesis | Correlate failed job, logs and source drift | Reduced MTTR | P0 |
| 51 | Agent based governance analyst | Policies need continuous interpretation | Agent maps policy requirements to data controls | Identify datasets affected by a new policy | Faster compliance | P1 |
| 52 | Agent based data architect | Architecture impact is difficult to assess | Agent evaluates lineage, dependencies and proposed changes | Assess impact of changing a shared customer table | Safer architecture changes | P1 |
| 53 | Agent based executive analyst | Executives need concise risk views | Agent converts technical signals into business summaries | Explain top five data risks this week | Better decision making | P1 |
| 54 | Natural language data investigation | Users need SQL and technical skills | AI converts questions into governed investigations | `Why did customer completeness fall?` | Democratise data intelligence | P0 |
| 55 | Natural language rule creation | Rule syntax creates friction | AI converts intent into candidate checks | `Customer email should be valid` | Faster control creation | P0 |
| 56 | Natural language root cause explanation | Technical failures are hard for business users | AI explains evidence in plain language | Explain why revenue reporting is delayed | Better collaboration | P0 |
| 57 | AI generated profiling reports | Profiling outputs contain too much detail | AI creates executive and technical summaries | Generate a one page dataset health report | Better communication | P0 |
| 58 | AI generated data quality narratives | Metrics lack context | AI explains changes and business significance | Explain why a 2% null increase matters for a regulatory field | Better prioritisation | P0 |
| 59 | AI generated governance recommendations | Teams lack a clear next step | AI recommends policies, controls and ownership | Recommend restricted classification and access review for detected PII | Better governance maturity | P1 |
| 60 | AI knowledge retrieval | Policies and data knowledge are scattered | RAG retrieves relevant evidence for investigations | Agent retrieves retention policy before recommending action | More grounded AI | P0 |
| 61 | Policy aware AI | Generic AI may violate governance | AI decisions are evaluated against explicit policies | Prevent autonomous modification of a regulatory dataset | Safer autonomy | P0 |
| 62 | Risk aware autonomy | All actions should not have the same autonomy level | AI adjusts autonomy using criticality and action risk | Metadata description can be autonomous while record deletion requires approval | Controlled autonomy | P0 |
| 63 | AI decision evidence | AI recommendations can be hard to trust | AI records evidence and reasoning summaries | Show which rules and observations supported a recommendation | Auditability and trust | P0 |
| 64 | AI action audit | Autonomous changes need accountability | Record agent, policy, action, target and outcome | Audit an automatically applied classification | Governance and compliance | P0 |
| 65 | AI confidence management | Confidence alone is difficult to operationalise | AI combines confidence with evidence, policy and historical success | Require approval for uncertain PII classification | Safer automation | P0 |
| 66 | Human feedback learning | AI recommendations improve through feedback | Capture approval, rejection and correction signals | Steward corrects a suggested classification | Continuous improvement | P1 |
| 67 | AI recommendation evaluation | AI quality can degrade silently | Measure recommendation precision and outcomes | Track how often suggested rules are accepted | Governed AI quality | P1 |
| 68 | AI agent performance monitoring | Agent failures can be difficult to see | Monitor tools, latency, errors, outcomes and token use | Identify agent repeatedly timing out on lineage queries | Reliable AI operations | P0 |
| 69 | Agent kill / emergency control | Long running or unsafe jobs need intervention | Operator can terminate governed execution | Kill a profiling job stuck for seven hours | Operational safety | P0 |
| 70 | Agent debugging and log extraction | Failed or stuck executions need evidence | AI and users can retrieve structured execution logs | Extract logs from a run stuck at 100% | Faster troubleshooting | P0 |
| 71 | Autonomous data quality monitoring | Manual monitoring does not scale | Agents continuously watch critical assets | Detect deterioration overnight and open an investigation | Continuous assurance | P1 |
| 72 | Data estate health index | Leaders lack one view of estate condition | AI aggregates quality, risk, criticality and incidents | Enterprise data health score | Executive visibility | P1 |
| 73 | Data risk heatmap | Risk is hard to visualise | AI groups risk by domain, asset and criticality | Show regulatory data risk hotspots | Better prioritisation | P1 |
| 74 | Data estate recommendations | Organisations do not know where to invest | AI identifies highest value improvements | Recommend fixing three upstream sources causing most downstream issues | Better ROI | P1 |
| 75 | Continuous governance improvement | Governance becomes static | Agents learn recurring patterns and propose control improvements | Recommend a new rule after repeated incidents | Maturing governance | P2 |

## Representative end to end examples

### Example 1: Critical customer dataset

A customer dataset arrives with a 12% increase in missing email addresses.

DataNexus AI can:

1. Detect the anomaly.
2. Recognise the dataset as critical.
3. Recognise email as sensitive customer data.
4. Compare historical profiles.
5. Trace the affected field through lineage.
6. Inspect relevant pipeline and execution logs.
7. Identify a likely upstream transformation change.
8. Explain the evidence and probable root cause.
9. Predict downstream impact.
10. Recommend a remediation plan.
11. Request human approval if the proposed action is high risk.
12. Execute approved remediation.
13. Reprofile the data.
14. Verify that the quality issue is resolved.
15. Record the full evidence and outcome.

### Example 2: Regulatory data

A regulatory reporting field changes distribution unexpectedly.

DataNexus AI identifies the drift, checks the field's regulatory classification, retrieves the applicable policy or standard, evaluates affected downstream reports, predicts reporting risk, and raises an evidence backed investigation. It does not modify production data or governance policy without the required approval.

### Example 3: Long running job

A profiling or agent run has been executing for seven hours.

The Monitoring page should provide a controlled operator action to terminate the job. Termination must persist the complete lifecycle state across the run, steps, and profiling records. The operator should also be able to extract diagnostic logs and understand why the job was still active.

### Example 4: Job stuck at 100%

A job reaches 100% step progress but remains non terminal.

DataNexus AI should detect the lifecycle inconsistency, distinguish step completion from run completion, inspect logs and lifecycle records, identify the missing terminal transition, and recommend or execute a governed recovery action. The investigation should be auditable.

### Example 5: Unstructured policy to control

A policy document states that sensitive customer information must not be retained beyond a defined period.

The platform can extract the requirement, identify relevant data classes and datasets, map them to candidate controls, suggest quality or governance rules, identify gaps, and eventually allow a governed agent to continuously monitor compliance.

## Executive value proposition

The capabilities collectively position DataNexus AI as more than a profiling or data quality tool.

It should be able to:

- Understand the data estate.
- Explain data problems.
- Predict data risks.
- Connect technical problems to business and regulatory impact.
- Recommend corrective actions.
- Execute safe actions automatically.
- Route high risk actions through human approval.
- Maintain evidence and auditability.
- Learn from human feedback and verified outcomes.
- Operate governed AI agents across the data estate.
- Progressively move from intelligence to controlled autonomy.

## Prioritisation guidance

### P0: Foundation and immediate differentiation

Profiling, classification, sensitive data detection, critical data elements, quality scoring, anomaly detection, drift, freshness, root cause analysis, impact analysis, risk scoring, remediation recommendation, human approval, verification, natural language investigation, RAG, policy aware AI, risk aware autonomy, evidence, audit, confidence, agent monitoring, job termination, diagnostic logs, and lifecycle correctness.

### P1: Scale the intelligence layer

Predictive risk, predictive SLA monitoring, business glossary, metadata enrichment, lineage interpretation, remediation planning, agent specialists, governance recommendations, executive analytics, learning feedback, recommendation evaluation, data estate health, risk heatmaps, and enterprise recommendations.

### P2: Advanced autonomy

Continuous governance improvement, broader autonomous remediation, deeper cross estate learning, and progressively reduced human intervention where policy, evidence, historical success and verification justify it.

## Strategic principle

The final goal is not simply to add AI features to a data quality product. The goal is to build an AI powered system that progressively develops an understanding of the enterprise data estate and can safely investigate, explain, predict, recommend, act, verify, and improve under explicit governance controls.
