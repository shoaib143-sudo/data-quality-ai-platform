import { createAdminClient } from '@/lib/supabase/admin'
import {
  ExportingTelemetryProvider,
  OtlpHttpJsonTelemetryExporter,
} from './otlp-telemetry-exporter'
import {
  DurableTelemetryProvider,
  type TelemetryPersistence,
  type TelemetryProvider,
} from './telemetry-provider'

function configuredOtlpEndpoint() {
  return process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT?.trim()
    || process.env.OTEL_EXPORTER_OTLP_ENDPOINT?.trim()
    || null
}

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

  const canonical = new DurableTelemetryProvider(persistence)
  const endpoint = configuredOtlpEndpoint()
  if (!endpoint) return canonical

  return new ExportingTelemetryProvider(
    canonical,
    new OtlpHttpJsonTelemetryExporter({
      endpoint,
      headers: process.env.OTEL_EXPORTER_OTLP_HEADERS ?? null,
      timeoutMs: process.env.OTEL_EXPORTER_OTLP_TIMEOUT
        ? Number(process.env.OTEL_EXPORTER_OTLP_TIMEOUT)
        : undefined,
      serviceName: process.env.OTEL_SERVICE_NAME?.trim() || 'datanexus-ai',
    }),
  )
}
