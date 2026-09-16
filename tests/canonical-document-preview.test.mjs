import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const [source, page] = await Promise.all([
  readFile(new URL('../lib/profiling/canonical-document-preview.ts', import.meta.url), 'utf8'),
  readFile(new URL('../app/profiling/page.tsx', import.meta.url), 'utf8'),
])

test('canonical preview reuses document readability gate and sensitive detection', () => {
  assert.match(source, /summarizeDocumentEvidence/)
  assert.match(source, /readableDocumentEvidence/)
  assert.match(source, /detectSensitiveTextEvidence/)
})

test('canonical preview reuses governed FILE loading including OCR fallback', () => {
  assert.match(source, /loadGovernedFileSource/)
  assert.match(source, /loadCanonicalDocumentPreviewFromSource/)
  assert.match(page, /canonicalPreview\.evidenceState !== 'READABLE'/)
  assert.match(page, /loadCanonicalDocumentPreviewFromSource/)
  assert.match(page, /connection_metadata/)
})

test('canonical preview hides unreadable persisted evidence instead of rendering glyph streams', () => {
  assert.match(source, /Binary or encoded glyph streams are intentionally hidden/)
  assert.match(source, /Unreadable binary\/glyph evidence hidden/)
})

test('preview source fallback fails closed when governed source access fails', () => {
  assert.match(page, /catch \{[\s\S]*fail-closed to persisted canonical evidence/)
  assert.doesNotMatch(page, /createAdminClient/)
})

test('canonical preview never invents extracted text', () => {
  assert.doesNotMatch(source, /fallback.*sample/i)
  assert.match(source, /No readable text sample was persisted for this document/)
})
