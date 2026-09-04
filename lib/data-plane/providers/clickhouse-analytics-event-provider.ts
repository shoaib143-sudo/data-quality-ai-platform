import type { AnalyticsEvent, AnalyticsEventProvider } from '@/lib/data-plane/contracts'

type ClickHouseConfig = {
  endpoint: string
  database: string
  user: string
  password: string
  table: string
}

function requireEnv(name: string) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`${name} is not configured`)
  return value
}

function validTableName(value: string) {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(value)
}

function config(): ClickHouseConfig {
  const table = (process.env.CLICKHOUSE_ANALYTICS_EVENTS_TABLE ?? 'analytics_events').trim()
  if (!validTableName(table)) throw new Error('CLICKHOUSE_ANALYTICS_EVENTS_TABLE must be a simple SQL identifier')
  return {
    endpoint: requireEnv('CLICKHOUSE_ENDPOINT').replace(/\/$/, ''),
    database: (process.env.CLICKHOUSE_DATABASE ?? 'datanexus').trim(),
    user: requireEnv('CLICKHOUSE_USER'),
    password: requireEnv('CLICKHOUSE_PASSWORD'),
    table,
  }
}

function row(event: AnalyticsEvent) {
  return {
    schema_version: event.schemaVersion,
    project_id: event.projectId,
    event_id: event.eventId,
    event_type: event.eventType,
    occurred_at: event.occurredAt,
    aggregate_type: event.aggregateType,
    aggregate_id: event.aggregateId,
    aggregate_version: event.aggregateVersion == null ? null : String(event.aggregateVersion),
    correlation_id: event.correlationId ?? null,
    causation_id: event.causationId ?? null,
    actor_type: event.actorType ?? null,
    actor_id: event.actorId ?? null,
    payload_json: JSON.stringify(event.payload ?? {}),
  }
}

export class ClickHouseAnalyticsEventProvider implements AnalyticsEventProvider {
  readonly providerKey = 'clickhouse'

  async publish(events: AnalyticsEvent[]): Promise<void> {
    if (!events.length) return

    const settings = config()
    const url = new URL(settings.endpoint)
    url.searchParams.set('database', settings.database)
    url.searchParams.set('query', `INSERT INTO ${settings.table} FORMAT JSONEachRow`)

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-ndjson',
        'x-clickhouse-user': settings.user,
        'x-clickhouse-key': settings.password,
      },
      body: events.map((event) => JSON.stringify(row(event))).join('\n'),
      cache: 'no-store',
    })

    if (!response.ok) {
      const detail = (await response.text()).slice(0, 2000)
      throw new Error(`ClickHouse analytics publish failed (${response.status}): ${detail || response.statusText}`)
    }
  }
}
