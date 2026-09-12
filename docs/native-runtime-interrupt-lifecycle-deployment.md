# Native runtime interrupt lifecycle deployment

The database migration is backward-compatible with the existing interrupt tables and RPC signature. The scheduled worker tolerates per-interrupt processor RPC failures as reported failures, so a brief application-before-migration deployment window does not silently mutate or revive runs.
