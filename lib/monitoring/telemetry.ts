import 'server-only'

export type MonitorReadOperation = 'execution' | 'roots' | 'branch'

type MonitorMetric = {
  event: 'monitor.read'
  operation: MonitorReadOperation
  outcome: 'success' | 'error'
  durationMs: number
  payloadBytes: number
  status: number
  itemCount?: number
  truncated?: boolean
}

export function recordMonitorRead(operation: MonitorReadOperation, startedAt: number, body: unknown, status: number, detail?: {itemCount?: number; truncated?: boolean}) {
  const durationMs = Math.max(0, Date.now() - startedAt)
  const payloadBytes = new TextEncoder().encode(JSON.stringify(body)).byteLength
  const metric: MonitorMetric = {
    event: 'monitor.read',
    operation,
    outcome: status < 400 ? 'success' : 'error',
    durationMs,
    payloadBytes,
    status,
    ...(detail?.itemCount === undefined ? {} : {itemCount: detail.itemCount}),
    ...(detail?.truncated === undefined ? {} : {truncated: detail.truncated}),
  }
  console.info('MONITOR_METRIC', JSON.stringify(metric))
  return {
    'Server-Timing': `monitor;dur=${durationMs}`,
    'X-Monitor-Payload-Bytes': String(payloadBytes),
  }
}
