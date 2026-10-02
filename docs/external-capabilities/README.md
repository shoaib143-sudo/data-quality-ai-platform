# External Capabilities

External agent tooling is optional, non-authoritative, disabled by default, and governed by `lib/agents/external-capability-policy.ts`.

## Rules

1. Pin and review provenance before execution.
2. Do not provide production secrets.
3. Browser targets require explicit host allowlisting.
4. External findings are advisory evidence only.
5. Persistent writes are denied unless a future governed policy explicitly permits them.
6. OpenViking remains benchmark-only until retrieval quality and governance gates pass.
7. Existing DataNexus governed memory remains authoritative; generic third-party memory is deferred.
8. Scientific skill collections are not part of the default runtime.

The adapters intentionally contain no vendor SDK dependency. This keeps the capability boundary replaceable and prevents installation from silently expanding runtime authority.
