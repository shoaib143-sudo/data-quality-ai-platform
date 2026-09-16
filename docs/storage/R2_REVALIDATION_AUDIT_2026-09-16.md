# R2 revalidation and adversarial audit — 2026-09-16

## Decision

Do not cut production writes over to R2 yet. Keep `STORAGE_DEFAULT_PROVIDER=supabase` until the remaining live-data and lifecycle gates below pass.

## Evidence revalidated

- Cloudflare R2 credentials are configured in Vercel as server-side variables for Production and Preview.
- The application keeps Supabase as the default provider until an explicit cutover.
- The R2 adapter is bucket-scoped and prefix-scoped.
- The dataset upload route no longer calls Supabase Storage directly.
- The latest storage assurance GitHub Actions run completed successfully with 12/12 contract, negative, and adversarial guards passing.
- Vercel preview builds for the hardened storage commits compile successfully.

## Best-practice cross-check

Current Cloudflare R2 guidance confirms:

- presigned URLs are bearer credentials and should be short-lived;
- presigned PUT URLs can and should bind Content-Type when the application constrains upload types;
- R2 is strongly consistent for object writes, reads, deletes, and listings;
- R2 S3 access should use scoped credentials and the account-specific HTTPS S3 endpoint.

Current Supabase guidance confirms the `storage` schema is metadata and must be treated as read-only. Migration and deletion must occur through supported APIs rather than direct manipulation of `storage.objects` or `storage.buckets`.

## Adversarial findings fixed in this pass

### A1 — Client-controlled bucket on cleanup

Previous state: the upload cleanup endpoint accepted `body.bucket`, creating an unnecessary bucket-selection trust boundary.

Fix: cleanup now derives the bucket exclusively from the configured provider. Client-supplied bucket values are ignored/unsupported.

### A2 — R2 adapter accepted arbitrary bucket references

Previous state: R2 calls could receive a bucket from the caller without enforcing the configured application bucket.

Fix: all R2 operations now fail closed unless the bucket exactly matches `R2_BUCKET`.

### A3 — R2 references were not prefix-enforced

Previous state: read/delete references were not explicitly constrained to `R2_PREFIX`.

Fix: R2 read, head, delete, and signed-download operations now reject references outside the configured prefix.

### A4 — Signed upload did not bind Content-Type

Previous state: the PUT presign only signed `host` even though the API collected Content-Type.

Fix: signed PUT operations now include Content-Type in the signed headers and return the required upload headers to the client.

### A5 — Server-side payload hashing could hash an empty payload for unsupported bodies

Previous state: non-string/non-Buffer bodies could be signed using an empty-body digest.

Fix: supported body types are explicitly hashed; unsupported body types fail closed.

### A6 — Endpoint/account mismatch was not rejected by the adapter

Fix: the adapter now requires the configured HTTPS R2 endpoint host to match `R2_ACCOUNT_ID`.

## Automated assurance now present

The branch includes `.github/workflows/storage-r2-assurance.yml` and `tests/storage-contract.test.mjs`.

Current automated checks cover:

1. provider-neutral contract presence;
2. equivalent adapter implementation boundary;
3. safe Supabase default before cutover;
4. no direct Supabase Storage dependency in the dataset upload route;
5. no `NEXT_PUBLIC_R2_*` credential exposure;
6. fail-closed bucket/provider/prefix/endpoint checks;
7. signed Content-Type and expiry bounds;
8. traversal/malformed key rejection;
9. unsupported server-side body rejection;
10. no client-controlled bucket during cleanup;
11. empty/oversized/unsupported upload rejection;
12. required signed upload headers returned to clients.

## Remaining production blockers

These gates are intentionally still open:

### G1 — Live R2 S3 smoke test

Must prove against the actual configured bucket:

`PUT -> HEAD -> GET -> DELETE -> HEAD(404)`

This is also the required validation of the manual SigV4 implementation against Cloudflare's live S3 endpoint.

### G2 — Browser CORS verification

The bucket CORS policy must explicitly allow the deployed DataNexus origins and the headers/methods required for presigned PUT. Wildcard production origins are not acceptable.

### G3 — Object registry

Create the application-owned `storage_objects` registry and stop treating provider/bucket/path supplied by clients as canonical object identity.

### G4 — Upload completion/integrity gate

An upload must not become profiling-ready until the backend verifies at least:

- object exists via HEAD;
- size equals the authorized size;
- expected content type/policy;
- checksum where available;
- object belongs to the expected project/dataset/version.

### G5 — Dataset Version integration

`catalog.dataset_versions` must reference the application-owned storage record rather than depending only on a provider-specific source URI.

### G6 — Profiling Row Access Adapter

The profiling reader must consume the provider-neutral storage reference and successfully stream an R2-backed CSV without R2-specific logic leaking into metric execution.

### G7 — End-to-end regression

Run the complete lifecycle for the same representative dataset through both providers and compare schema, rows, metric outputs, findings, quality score, and governance outputs.

### G8 — Live negative/failure injection

Still required against the real endpoint:

- expired/tampered signed URL;
- wrong Content-Type;
- wrong key/prefix;
- wrong bucket;
- missing object;
- R2 403/404/5xx/timeout handling;
- upload succeeds but DB completion fails;
- DB pending record exists but upload fails;
- duplicate completion/delete;
- concurrent same-name uploads.

### G9 — Rollback drill

Prove that changing the provider flag back to Supabase restores new-write behavior without schema restoration or emergency code changes.

## Additional production-hardening recommendation

The current R2 adapter implements AWS Signature Version 4 locally. Cloudflare's documented JavaScript path uses an S3-compatible SDK and presigner. Before production cutover, either:

1. complete the live conformance matrix above and retain the implementation with strong regression vectors; or
2. replace local signing with a pinned, lockfile-managed S3 SDK/presigner and rerun the same tests.

The second option reduces cryptographic/protocol maintenance risk and is preferred for long-lived production support.

## Release gate

Production R2 cutover is permitted only after G1-G9 are green. No Supabase Storage deletion is authorized by this audit.
