# AI system authority model

`assessment != approval` and `historical approval != current-version approval`.

An AI system may be `ACTIVE` only when the latest decision for its exact current immutable version is a human `APPROVED` decision by a reviewer holding `policy.approve`. Registering a new version resets lifecycle state to `DRAFT`. Agent and system assessments are evidence only and cannot activate a system.
