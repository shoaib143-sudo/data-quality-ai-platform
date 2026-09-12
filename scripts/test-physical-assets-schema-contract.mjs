import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const source = await readFile(new URL('../app/catalog/physical-assets/page.tsx', import.meta.url), 'utf8')

const assetsSelect = source.match(/from\('current_catalog_source_assets'\)\.select\('([^']+)'\)/)?.[1] ?? ''
const trustSelect = source.match(/from\('current_asset_trust'\)\.select\('([^']+)'\)/)?.[1] ?? ''

assert.ok(assetsSelect, 'Physical Assets must query current_catalog_source_assets.')
assert.ok(!assetsSelect.split(',').includes('identity_key'), 'current_catalog_source_assets must not request nonexistent identity_key.')
assert.ok(assetsSelect.split(',').includes('id'), 'Physical asset projection must retain discovered asset identity.')
assert.ok(trustSelect.split(',').includes('discovered_asset_id'), 'Trust projection must expose discovered_asset_id for authoritative identity linkage.')
assert.ok(trustSelect.split(',').includes('identity_key'), 'Trust projection must retain governed stable identity evidence.')
assert.match(source, /identityByDiscoveredAssetId = new Map/, 'Physical assets must derive identity from trust evidence by discovered asset id.')
assert.match(source, /identity_key: identityByDiscoveredAssetId\.get\(String\(asset\.id\)\) \?\? null/, 'Enriched assets must fail closed to null when no trust identity exists.')
assert.match(source, /<PhysicalAssetManager assets=\{assets\} trust=\{trustRows\}/, 'Manager must receive the schema-safe enriched asset projection and unchanged trust evidence.')

console.log('physical assets schema contract: PASS')
