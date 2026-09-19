import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const form = fs.readFileSync(new URL('../app/datasets/register-dataset-form.tsx', import.meta.url), 'utf8')

test('browser upload flow supports both Supabase and direct R2 single uploads', () => {
  assert.match(form, /uploadPayload\.provider === 'r2'/)
  assert.match(form, /uploadPayload\.provider === 'supabase'/)
  assert.match(form, /provider === 'r2'/)
  assert.match(form, /method: 'PUT'/)
  assert.match(form, /headers: uploadPayload\.uploadHeaders \?\? \{\}/)
  assert.match(form, /uploadToSignedUrl/)
})

test('browser multipart flow uploads every bounded part directly to R2 and captures ETags', () => {
  assert.match(form, /uploadPayload\.uploadMode === 'multipart'/)
  assert.match(form, /multipart\?\.partSizeBytes/)
  assert.match(form, /multipart\?\.partCount/)
  assert.match(form, /action: 'authorize-part'/)
  assert.match(form, /file\.slice\(startByte, endByte\)/)
  assert.match(form, /putResponse\.headers\.get\('etag'\)/)
  assert.match(form, /completedParts\.push\(\{ partNumber, etag \}\)/)
  assert.match(form, /action: 'complete', parts: completedParts/)
})

test('all browser uploads pass server verification before source registration', () => {
  const verifyIndex = form.indexOf("'/api/datasets/source/upload-file/complete'")
  const registerIndex = form.indexOf("'/api/datasets/source/register'")
  assert.ok(verifyIndex > 0)
  assert.ok(registerIndex > verifyIndex)
  assert.match(form, /verificationPayload\.ready !== true/)
})

test('dataset registration preserves governed storage-object linkage', () => {
  assert.match(form, /sourceStorageObjectId/)
  assert.match(form, /setSourceStorageObjectId\(storageObjectId\)/)
  assert.match(form, /storageObjectId: sourceStorageObjectId/)
  assert.match(form, /setSourceStorageObjectId\(null\)/)
})

test('failed unverified multipart uploads abort parts and tombstone through governed cleanup', () => {
  assert.match(form, /if \(cleanupTarget && !ready\)/)
  assert.match(form, /upload-file\/multipart/)
  assert.match(form, /method: 'DELETE'/)
  assert.match(form, /storageObjectId: cleanupTarget\.storageObjectId/)
  assert.match(form, /provider: cleanupTarget\.provider/)
  assert.match(form, /path: cleanupTarget\.path/)
})

test('browser provider-neutral upload flow never references R2 credentials', () => {
  assert.doesNotMatch(form, /R2_ACCESS_KEY_ID|R2_SECRET_ACCESS_KEY|R2_ACCOUNT_ID/)
})
