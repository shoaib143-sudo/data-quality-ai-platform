# DataNexus System Invariants

## Core examples

```text
Profile SUCCEEDED
=> metrics persisted
AND required findings/scoring completed
AND dataset version matches
AND UI/API/DB reconcile
```

```text
READY_TO_EXECUTE
=> required approvals satisfied
AND execution payload complete
AND fingerprint valid
AND policy valid
AND executor authorized
AND target exists
```

```text
Agent action reported SUCCEEDED
=> authoritative side effect exists
AND audit evidence exists
AND target scope matches approved scope
```

```text
Cross-project request without authority
=> no protected data disclosed
AND no protected mutation committed
```

```text
Remediation SUCCEEDED
=> intended change persisted
AND unrelated governed state unchanged
AND evidence links pre/post state
AND reprofile result is attributable to the correct version
```

## Numerical examples

- 0 <= quality score <= 100
- null_count <= row_count
- distinct_count <= row_count
- profiled columns equal the intended discovered-column set

The registry should add feature-specific invariants. Violating an invariant fails certification even if an endpoint returned success.
