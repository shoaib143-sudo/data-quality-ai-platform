# Privacy Test Plan

## Scope

Automate tests for data minimization, purpose/scope controls, masking/redaction, retention, deletion, export where supported, sensitive-data access, logs/traces, AI context construction, retrieval, memory, embeddings, caches, backups, and test evidence.

## Required cases

- Sensitive fields excluded from contexts that do not require them
- Unauthorized personas cannot infer protected values through direct or indirect queries
- Deleted/expired data is not returned by active retrieval/memory paths according to product policy
- Masking is preserved through UI, API, logs, exports, agent/tool output, and evidence
- Cross-project and cross-organization isolation
- Prompt/model output cannot leak secrets or unrelated sensitive records
- Test artifacts do not persist real-user credentials or production-sensitive content

Privacy gates are binary for unauthorized disclosure.
