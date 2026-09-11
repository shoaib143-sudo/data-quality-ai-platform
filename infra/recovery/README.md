# Recovery infrastructure contract

`platform-manifest.json` is a non-secret recovery inventory of production topology. It is used to detect recovery drift and to guide reconstruction of Supabase, Vercel, and Render components.

The manifest must never contain secret values, database passwords, access tokens, private keys, OAuth client secrets, signing keys, or service-role credentials. Secret values remain in their managed secret stores; only required secret names and ownership procedures belong in recovery documentation.

A topology match is necessary but not sufficient for recovery readiness. Each scope in `docs/recovery-assurance-v2.md` must be independently rehearsed and evidenced before the database policy can return `READY`.
