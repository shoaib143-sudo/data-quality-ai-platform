import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const [page, manager] = await Promise.all([
  readFile(new URL('../app/catalog/physical-assets/page.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../app/catalog/physical-assets/physical-asset-manager.tsx', import.meta.url), 'utf8'),
])

assert.doesNotMatch(page, /current_catalog_source_assets[^\n]*identity_key/, 'The physical source projection must not depend on a column absent from production.')
assert.match(page, /current_asset_trust'\)\.select\('[^']*discovered_asset_id[^']*identity_key/, 'Stable identity must be recovered from governed trust evidence, not fabricated.')
assert.match(page, /\.filter\(item => item\.discovered_asset_id && item\.identity_key\)/, 'Only complete trust identity evidence may populate the mapping.')
assert.match(page, /identity_key: identityByDiscoveredAssetId\.get\(String\(asset\.id\)\) \?\? null/, 'Missing trust identity must remain unknown rather than synthesized server-side.')
assert.match(manager, /asset\.identity_key\?\?`qualified:\$\{asset\.asset_key\}`/, 'Existing explicit UI fallback may remain for assets without governed native identity.')
assert.doesNotMatch(page, /\.(insert|update|delete|upsert)\s*\(/, 'Schema compatibility correction must remain read-only.')

console.log('physical assets schema adversarial audit: PASS', {
  nonexistentColumnDependency: false,
  governedIdentityPreserved: true,
  serverProjectionReadOnly: true,
  missingIdentityFailsClosed: true,
})
