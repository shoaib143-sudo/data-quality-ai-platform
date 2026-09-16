import type { ObjectStorage, StorageProvider } from './contracts'
import { R2StorageAdapter } from './r2'
import { SupabaseStorageAdapter } from './supabase'

export function defaultStorageProvider(): StorageProvider {
  const value = (process.env.STORAGE_DEFAULT_PROVIDER ?? 'supabase').trim().toLowerCase()
  if (value !== 'supabase' && value !== 'r2') {
    throw new Error(`Unsupported STORAGE_DEFAULT_PROVIDER: ${value}`)
  }
  return value
}

export function createObjectStorage(provider: StorageProvider = defaultStorageProvider()): ObjectStorage {
  return provider === 'r2' ? new R2StorageAdapter() : new SupabaseStorageAdapter()
}
