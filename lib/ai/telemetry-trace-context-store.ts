import { AsyncLocalStorage } from 'node:async_hooks'
import type { TelemetryTraceContext } from './telemetry-provider'

const telemetryTraceContextStorage = new AsyncLocalStorage<TelemetryTraceContext | null>()

export function runWithTelemetryTraceContext<T>(
  traceContext: TelemetryTraceContext | null,
  callback: () => T,
): T {
  return telemetryTraceContextStorage.run(traceContext, callback)
}

export function currentTelemetryTraceContext(): TelemetryTraceContext | null {
  return telemetryTraceContextStorage.getStore() ?? null
}
