# Native runtime interrupt lifecycle invariants

1. A rejected decision cannot resume.
2. An expired interrupt cannot resume.
3. Timeout action is not caller-controlled.
4. Approval/manual-review timeout escalates.
5. Dependency/external-input timeout cancels.
6. Late decisions are audited without changing terminal outcome.
7. Terminal evidence is append-only.
8. Run cancellation uses the canonical agent-run cancellation fields.
