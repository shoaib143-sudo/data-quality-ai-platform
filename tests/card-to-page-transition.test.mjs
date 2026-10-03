import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const [linkSource, catalogSource, datasetSource, cssSource] = await Promise.all([
  readFile('components/navigation/card-to-page-link.tsx', 'utf8'),
  readFile('app/catalog/catalog-manager.tsx', 'utf8'),
  readFile('app/catalog/dataset/[datasetId]/page.tsx', 'utf8'),
  readFile('app/globals.css', 'utf8'),
])

test('card to page transition is progressive and dependency free', () => {
  assert.match(linkSource, /startViewTransition/)
  assert.match(linkSource, /prefers-reduced-motion: reduce/)
  assert.match(linkSource, /router\.push/)
  assert.doesNotMatch(linkSource, /framer-motion|motion\/react/)
})

test('catalog card and Dataset 360 share a stable transition identity', () => {
  assert.match(catalogSource, /cardTransitionName\('dataset',dataset\.id\)/)
  assert.match(datasetSource, /cardTransitionName\('dataset',dataset\.id\)/)
  assert.match(catalogSource, /CardToPageLink/)
  assert.match(datasetSource, /data-card-page-target/)
})

test('transition styling has reduced motion and unsupported browser fallback safety', () => {
  assert.match(cssSource, /::view-transition-old\(root\)/)
  assert.match(cssSource, /::view-transition-new\(root\)/)
  assert.match(cssSource, /@media \(prefers-reduced-motion: reduce\)/)
})
