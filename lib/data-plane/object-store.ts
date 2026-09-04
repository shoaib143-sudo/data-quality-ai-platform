import type { ObjectStore } from '@/lib/data-plane/contracts'
import { getDataPlaneProviderSelection } from '@/lib/data-plane/provider-selection'
import { SupabaseObjectStore } from '@/lib/data-plane/providers/supabase-object-store'

let supabaseStore: ObjectStore | null = null

export function getObjectStore(): ObjectStore {
  const { objectStore } = getDataPlaneProviderSelection()
  if (objectStore === 'supabase') {
    supabaseStore ??= new SupabaseObjectStore()
    return supabaseStore
  }
  throw new Error(`OBJECT_STORE_PROVIDER=${objectStore} is selected but no ${objectStore} object store implementation is configured.`)
}
