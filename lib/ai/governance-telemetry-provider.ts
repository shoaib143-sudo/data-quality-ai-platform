import { createAdminClient } from '@/lib/supabase/admin'
import {
  DurableTelemetryProvider,
  type TelemetryPersistence,
  type TelemetryProvider,
} from './telemetry-provider'

export function createGovernanceTelemetryProvider(): TelemetryProvider {
  const supabase = createAdminClient()

  const persistence: TelemetryPersistence = {
    async insert(record) {
      const { data, error } = await supabase
        .schema('governance')
        .from('ai_telemetry_events')
        .insert(record)
        .select('id')
        .single()

      if (error) throw new Error(`Unable to persist AI telemetry: ${error.message}`)
      if (!data?.id) throw new Error('Unable to persist AI telemetry: no event id returned')
      return { id: data.id }
    },
  }

  return new DurableTelemetryProvider(persistence)
}
