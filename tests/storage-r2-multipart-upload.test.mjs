import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const contracts = fs.readFileSync(new URL('../lib/storage/contracts.ts', import.meta.url), 'utf8')
const r2 = fs.readFileSync(new URL('../lib/storage/r2.ts', import.meta.url), 'utf8')
const upload = fs.readFileSync(new URL('../app/api/datasets/source/upload-file/route.ts', import.meta.url), 'utf8')
const multipart = fs.readFileSync(new URL('../app/api/datasets/source/upload-file/multipart/route.ts', import.meta.url), 'utf8')
const completion = fs.readFileSync(new URL('../app/api/datasets/source/upload-file/complete/route.ts', import.meta.url), 'utf8')

test('storage contracts expose R2 multipart initiation, part authorization, completion, and abort', () => {
  for (const operation of [
    'createMultipartUpload',
    'createMultipartPartAuthorization',
    'completeMultipartUpload',
    'abortMultipartUpload',
  ]) {
    assert.match(contracts, new RegExp(operation))
    assert.match(r2, new RegExp(operation))
  }
  assert.match(contracts, /MultipartUploadPart/)
  assert.match(contracts, /MultipartUploadSession/)
})

test('R2 multipart implementation signs the S3 multipart query contract', () => {
  assert.match(r2, /method: 'GET' \| 'PUT' \| 'HEAD' \| 'DELETE' \| 'POST'/)
  assert.match(r2, /operationParams: Record<string, string> = \{\}/)
  assert.match(r2, /queryParams: Record<string, string> = \{\}/)
  assert.match(r2, /\{ uploads: '' \}/)
  assert.match(r2, /partNumber: String\(partNumber\)/)
  assert.match(r2, /\{ uploadId \}/)
  assert.match(r2, /CompleteMultipartUpload/)
})

test('R2 multipart validation is bounded and fail closed', () => {
  assert.match(r2, /partNumber < 1 \|\| partNumber > 10_000/)
  assert.match(r2, /parts\.length < 1 \|\| parts\.length > 10_000/)
  assert.match(r2, /parts must be contiguous and ordered/)
  assert.match(r2, /\^\[0-9a-f\]\{32\}\$/i)
  assert.match(r2, /multipart initiation response did not include an upload id/)
  assert.match(r2, /multipart completion failed with status/)
})

test('large R2 uploads use multipart without weakening Supabase upload ceilings', () => {
  assert.match(upload, /SUPABASE_HARD_MAX_BYTES = 1024 \* 1024 \* 1024/)
  assert.match(upload, /R2_HARD_MAX_BYTES = 5 \* 1024 \* 1024 \* 1024 \* 1024/)
  assert.match(upload, /R2_MULTIPART_THRESHOLD_BYTES = 100 \* 1024 \* 1024/)
  assert.match(upload, /R2_MAX_PARTS = 10_000/)
  assert.match(upload, /provider === 'r2' && size > R2_MULTIPART_THRESHOLD_BYTES/)
  assert.match(upload, /upload_mode: 'MULTIPART'/)
  assert.match(upload, /multipart_part_count: partCount/)
  assert.match(upload, /uploadMode: 'multipart'/)
  assert.match(upload, /uploadMode: 'single'/)
})

test('multipart initiation cleans up R2 parts if registry activation fails', () => {
  assert.match(upload, /abortMultipartUpload/)
  assert.match(upload, /\.catch\(\(\) => undefined\)/)
  assert.match(upload, /Unable to activate multipart dataset upload/)
})

test('multipart control endpoint derives bucket, key, and upload id from governed registry state', () => {
  assert.match(multipart, /from\('storage_objects'\)/)
  assert.match(multipart, /\.eq\('project_id', projectId\)/)
  assert.match(multipart, /authorizeProject\(user\.id, projectId, 'source\.manage'\)/)
  assert.doesNotMatch(multipart, /body\.bucket/)
  assert.doesNotMatch(multipart, /body\.key/)
  assert.doesNotMatch(multipart, /body\.uploadId/)
})

test('multipart part authorization is bounded by the registered part count', () => {
  assert.match(multipart, /action === 'authorize-part'/)
  assert.match(multipart, /row\.state !== 'UPLOADING'/)
  assert.match(multipart, /partNumber > partCount/)
  assert.match(multipart, /createMultipartPartAuthorization/)
  assert.match(multipart, /SIGNED_PART_TTL_SECONDS = 15 \* 60/)
})

test('multipart completion is retry-safe and still requires normal object verification before READY', () => {
  assert.match(multipart, /const existing = await storage\.headObject/)
  assert.match(multipart, /const recoveredCompletedObject = existing\.exists/)
  assert.match(multipart, /if \(!recoveredCompletedObject\)/)
  assert.match(multipart, /state: 'UPLOADED'/)
  assert.match(multipart, /verificationEndpoint: '\/api\/datasets\/source\/upload-file\/complete'/)
  assert.doesNotMatch(multipart, /state: 'READY'/)
  assert.match(completion, /state: 'VERIFYING'/)
  assert.match(completion, /state: 'READY'/)
})

test('multipart abort cannot remove completed governed objects', () => {
  assert.match(multipart, /row\.state === 'READY' \|\| row\.state === 'DELETED'/)
  assert.match(multipart, /completed object and cannot be aborted/)
  assert.match(multipart, /state: 'FAILED'/)
  assert.match(multipart, /failure_stage: 'MULTIPART_ABORTED'/)
})

test('multipart browser capability never exposes R2 credentials', () => {
  assert.doesNotMatch(upload, /NEXT_PUBLIC_R2_/)
  assert.doesNotMatch(multipart, /R2_ACCESS_KEY_ID|R2_SECRET_ACCESS_KEY|NEXT_PUBLIC_R2_/)
  assert.match(multipart, /uploadUrl: authorization\.url/)
})
