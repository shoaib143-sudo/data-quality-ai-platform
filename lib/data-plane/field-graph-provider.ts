import type { FieldGraphProvider } from '@/lib/data-plane/field-graph-contracts'
import { getDataPlaneProviderSelection } from '@/lib/data-plane/provider-selection'
import { PostgresFieldGraphProvider } from '@/lib/data-plane/providers/postgres-field-graph-provider'

let postgresProvider: FieldGraphProvider | null = null

export function getFieldGraphProvider(): FieldGraphProvider {
  const { graph } = getDataPlaneProviderSelection()
  if (graph === 'postgres') {
    postgresProvider ??= new PostgresFieldGraphProvider()
    return postgresProvider
  }

  throw new Error(`GRAPH_PROVIDER=${graph} is selected but no ${graph} field graph provider implementation is configured.`)
}
