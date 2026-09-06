# Modules 9 and 10 evidence boundary

Modules 9 and 10 use production database evidence as the authority boundary.

Workflow and remediation decisions are authoritative only when the workflow instance pins the exact workflow definition semantics and the acting human satisfies the current step capability. Workflow actions and state-transition evidence are append-only. Automated remediation state remains a mutable state machine, but every transition is captured as immutable evidence.

Data-contract versions are immutable semantic proposals. `ACTIVE` is not sufficient for authority. An effective contract version must also carry governed `APPROVED` authority with human reviewer evidence. Legacy active rows without that evidence are retained as unverified baselines and are not treated as governing authority. Re-evaluation may refresh the canonical evaluation row, while every evaluation and re-evaluation is preserved in append-only event history.

These controls deliberately do not clear external lineage or enterprise governance-corpus blockers.