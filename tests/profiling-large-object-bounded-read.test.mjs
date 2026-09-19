import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const adapter = fs.readFileSync(new URL('../lib/profiling/file-source-adapter.ts', import.meta.url), 'utf8')
const resolver = fs.readFileSync(new URL('../lib/profiling/provider-neutral-file-source.ts', import.meta.url), 'utf8')
const governed = fs.readFileSync(new URL('../lib/profiling/governed-file-source.ts', import.meta.url), 'utf8')
const fileProfile = fs.readFileSync(new URL('../lib/profiling/file-profile.ts', import.meta.url), 'utf8')
const metrics = fs.readFileSync(new URL('../lib/profiling/metric-engine.ts', import.meta.url), 'utf8')
const reuse = fs.readFileSync(new URL('../lib/profiling/evidence-reuse.ts', import.meta.url), 'utf8')
const registration = fs.readFileSync(new URL('../app/api/datasets/register/route.ts', import.meta.url), 'utf8')

test('R2 resolver observes object size before issuing read authorization', () => {
  assert.match(resolver, /const head = await storage\.headObject\(reference\)/)
  assert.match(resolver, /if \(!head\.exists\)/)
  assert.match(resolver, /storage_size_bytes: head\.sizeBytes/)
  assert.match(resolver, /storage_size_bytes_authority: head\.sizeBytes === undefined \? 'UNKNOWN' : 'SOURCE_OBSERVED'/)
})

test('large streamable sources use bounded byte-range sampling instead of full buffering', () => {
  assert.match(adapter, /RANGE_SAMPLE_EXTENSIONS/)
  assert.match(adapter, /FILE_RANGE_SAMPLE_BYTES/)
  assert.match(adapter, /headers\.range = `bytes=0-\$\{rangeSampleBytes - 1\}`/)
  assert.match(adapter, /response\.status !== 206/)
  assert.match(adapter, /await response\.body\?\.cancel\(\)\.catch/)
  assert.match(adapter, /Large FILE source did not honor the bounded byte-range request/)
  assert.match(adapter, /content_hash_authority:prefixSampled\?'SOURCE_PREFIX_SHA256':'SOURCE_BYTES_SHA256'/)
  assert.match(adapter, /source_observation_scope:prefixSampled\?'BOUNDED_PREFIX_SAMPLE':'FULL_OBJECT_BYTES'/)
})

test('large non-streamable objects become metadata-only rather than allocating the full object', () => {
  assert.match(adapter, /!RANGE_SAMPLE_EXTENSIONS\.has\(canonicalExtension\)/)
  assert.match(adapter, /content_hash_authority: 'OBJECT_METADATA_FINGERPRINT'/)
  assert.match(adapter, /source_observation_scope: 'METADATA_ONLY'/)
  assert.match(adapter, /Large JSON documents require JSONL\/NDJSON or a partitioned snapshot/)
  assert.match(governed, /if \(observationScope === 'METADATA_ONLY'\) return loaded/)
})

test('sampled or metadata-only source fingerprints can never drive evidence reuse', () => {
  assert.match(fileProfile, /const fullSourceBytesObserved = contentHashAuthority === 'SOURCE_BYTES_SHA256'/)
  assert.match(fileProfile, /contentHash: fullSourceBytesObserved \? loaded\.contentHash : null/)
  assert.match(reuse, /contentHashAuthority !== 'SOURCE_BYTES_SHA256'/)
  assert.match(reuse, /eligible: false/)
})

test('metric execution resolves R2 FILE sources provider-neutrally', () => {
  assert.match(metrics, /resolveProviderNeutralFileConfig/)
  assert.match(metrics, /sanitizeProviderNeutralFileResult/)
  assert.match(metrics, /maxBytes: sampling\.technicalMaxFileBytes/)
  assert.match(metrics, /content_hash: contentHashAuthority === 'SOURCE_BYTES_SHA256' \? loaded\.contentHash : null/)
})

test('dataset registration persists observed object size for automatic sampling decisions', () => {
  assert.match(registration, /size_bytes: verifiedStorageObject\?\.size_bytes \?\? null/)
  assert.match(registration, /source_size_bytes: verifiedStorageObject\?\.size_bytes \?\? null/)
  assert.match(registration, /source_size_bytes_authority: verifiedStorageObject\?\.size_bytes == null \? 'UNKNOWN' : 'SOURCE_OBSERVED'/)
})
