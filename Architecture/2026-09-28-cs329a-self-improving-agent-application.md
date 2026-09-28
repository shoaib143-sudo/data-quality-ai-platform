# CS329A application to the eight DataNexus agents

Source: Stanford CS329A, https://cs329a.stanford.edu/ and the nine-part video playlist https://www.youtube.com/playlist?list=PLangBM27OtEA.

The course describes verifier-guided inference, feedback from tools and code, multi-step planning, agent evolution, memory, and evaluation. These are research patterns, not permission to alter production policies autonomously.

| Course pattern | DataNexus capability today | Status | Disposition |
| --- | --- | --- | --- |
| Verified feedback and episodic memory | All eight agents can consume project-scoped verified outcomes and approved positive cases | PARTIAL | KEEP; measure retrieval quality and reject unverified cases |
| Candidate generation and independent verification | Skill scorecards produce governed candidates; independent benchmarks compare candidate and baseline | PARTIAL | BUILD_NOW: require benchmark time to follow candidate evidence cutoff |
| Agent evolution | Human review, controlled canary, rollback, and audit govern skill releases | PARTIAL | KEEP; never self-promote or expand authority |
| Test-time compute and search | Bounded reasoning and specialist handoffs exist | GAP_DEFERRED | BENCHMARK_LATER against latency, cost, and outcome quality per skill |
| Long-horizon evaluation | Scorecards, adversarial failures, and canary evidence exist | PARTIAL | BUILD_LATER: representative held-out suites and drift checks for each agent |
| Model weight training or RL | No governed training pipeline | GAP_DEFERRED | BUILD_LATER only with privacy-safe datasets, explicit authority, and independent evaluation |

The shared candidate benchmark gate now rejects evidence observed before the candidate's evidence cutoff. The database trigger enforces the same temporal rule for persisted benchmarks. This closes an ordering gap across profiling, data quality, steward, governance analyst, architect, investigator, executive, and support agents. It does not claim that the agents already retrain their weights or that live production learning is activated.

Next implementation slices: measure verified-case retrieval against labeled tasks; add per-agent held-out and failure-path evaluations; compare bounded candidate strategies against a baseline; surface the evidence and regression metrics in Command Center; keep current project scope, approval, canary, and rollback controls.
