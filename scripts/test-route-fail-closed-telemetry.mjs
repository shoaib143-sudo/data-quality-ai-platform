import assert from 'node:assert/strict'
import { FailClosedRouteTelemetryRouter } from '../lib/ai/fail-closed-route-telemetry-router.ts'

const context = {
  projectId: 'project-1',
  executionCorrelationId: '11111111-1111-4111-8111-111111111111',
  task: 'governance_reasoning',
  sensitivity: 'CONFIDENTIAL',
  risk: 'HIGH',
  traceContext: {
    traceId: '4bf92f3577b34da6a3ce929d0e0e4736',
    spanId: '00f067aa0ba902b7',
    traceFlags: '01',
  },
}

{
  const events = []
  const routeError = new Error('sensitive registry failure body that must not be exported')
  routeError.name = 'ModelRegistryUnavailableError'
  const router = new FailClosedRouteTelemetryRouter(
    { async route() { throw routeError } },
    {
      id: 'telemetry',
      async record(event) {
        events.push(event)
        return { eventId: 'evt-1', persisted: true }
      },
    },
  )

  await assert.rejects(router.route(context), (error) => error === routeError)
  assert.equal(events.length, 1)
  assert.equal(events[0].eventType, 'AI_ROUTE_DECISION')
  assert.equal(events[0].status, 'ERROR')
  assert.equal(events[0].attributes.route_source, 'FAIL_CLOSED')
  assert.equal(events[0].attributes.route_reason, 'ROUTER_ERROR')
  assert.equal(events[0].attributes.routing_error_name, 'ModelRegistryUnavailableError')
  assert.equal(events[0].correlationId, context.executionCorrelationId)
  assert.deepEqual(events[0].traceContext, context.traceContext)
  assert.equal(JSON.stringify(events[0]).includes(routeError.message), false)
}

{
  const routeError = new Error('canonical route failure')
  const telemetryError = new Error('telemetry unavailable')
  const router = new FailClosedRouteTelemetryRouter(
    { async route() { throw routeError } },
    { id: 'telemetry', async record() { throw telemetryError } },
  )

  await assert.rejects(router.route(context), (error) => error === routeError)
}

{
  const decision = {
    source: 'ENVIRONMENT_FALLBACK',
    reason: 'NO_ACTIVE_GOVERNED_CANDIDATE',
    provider: null,
    evidence: null,
  }
  let telemetryCalled = false
  const router = new FailClosedRouteTelemetryRouter(
    { async route() { return decision } },
    { id: 'telemetry', async record() { telemetryCalled = true; return { eventId: 'evt', persisted: true } } },
  )

  assert.equal(await router.route(context), decision)
  assert.equal(telemetryCalled, false, 'successful decisions remain owned by ObservableIntelligentRouter telemetry')
}

console.log('ADR-006 fail-closed route telemetry behavior passed.')
