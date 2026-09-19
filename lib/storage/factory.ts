import type { ObjectStorage, StorageProvider } from './contracts'
import { R2StorageAdapter } from './r2'
import { SupabaseStorageAdapter } from './supabase'
import { isProductionEnvironment } from '@/lib/runtime/environment'

function productionR2CutoverApproved() {
  return process.env.STORAGE_R2_PRODUCTION_CUTOVER_APPROVED?.trim().toLowerCase() === 'true'
}

export function defaultStorageProvider(): StorageProvider {
  const value = (process.env.STORAGE_DEFAULT_PROVIDER ?? 'supabase').trim().toLowerCase()
  if (value !== 'supabase' && value !== 'r2') {
    throw new Error(`Unsupported STORAGE_DEFAULT_PROVIDER: ${value}`)
  }
  if (value === 'r2' && isProductionEnvironment() && !productionR2CutoverApproved()) {
    throw new Error('Production R2 storage cutover requires STORAGE_R2_PRODUCTION_CUTOVER_APPROVED=true.')
  }
  return value
}

export function createObjectStorage(provider: StorageProvider = defaultStorageProvider()): ObjectStorage {
  return provider === 'r2' ? new R2StorageAdapter() : new SupabaseStorageAdapter()
}
