import type { ObjectStorage, StorageProvider } from './contracts'
import { R2StorageAdapter } from './r2'
import { SupabaseStorageAdapter } from './supabase'
import { isProductionEnvironment } from '@/lib/runtime/environment'

function productionR2CutoverApproved() {
  return process.env.STORAGE_R2_PRODUCTION_CUTOVER_APPROVED?.trim().toLowerCase() === 'true'
}

function productionR2BulkUploadsApproved() {
  return process.env.STORAGE_R2_BULK_UPLOADS_APPROVED?.trim().toLowerCase() === 'true'
}

function parseProvider(value: string, envName: string): StorageProvider {
  const normalized = value.trim().toLowerCase()
  if (normalized !== 'supabase' && normalized !== 'r2') {
    throw new Error(`Unsupported ${envName}: ${normalized}`)
  }
  return normalized
}

export function defaultStorageProvider(): StorageProvider {
  const value = parseProvider(process.env.STORAGE_DEFAULT_PROVIDER ?? 'supabase', 'STORAGE_DEFAULT_PROVIDER')
  if (value === 'r2' && isProductionEnvironment() && !productionR2CutoverApproved()) {
    throw new Error('Production R2 storage cutover requires STORAGE_R2_PRODUCTION_CUTOVER_APPROVED=true.')
  }
  return value
}

export function bulkStorageProvider(): StorageProvider {
  const fallback = defaultStorageProvider()
  const value = parseProvider(process.env.STORAGE_BULK_PROVIDER ?? fallback, 'STORAGE_BULK_PROVIDER')
  if (value === 'r2' && isProductionEnvironment() && !productionR2BulkUploadsApproved() && !productionR2CutoverApproved()) {
    throw new Error('Production R2 bulk uploads require STORAGE_R2_BULK_UPLOADS_APPROVED=true or full R2 cutover approval.')
  }
  return value
}

export function createObjectStorage(provider: StorageProvider = defaultStorageProvider()): ObjectStorage {
  return provider === 'r2' ? new R2StorageAdapter() : new SupabaseStorageAdapter()
}
