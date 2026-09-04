import type { GraphProvider } from '@/lib/data-plane/contracts'
import { getDataPlaneProviderSelection } from '@/lib/data-plane/provider-selection'
import { PostgresGraphProvider } from '@/lib/data-plane/providers/postgres-graph-provider'

let postgresProvider: GraphProvider | null = null

export function getGraphProvider(): GraphProvider {
  const { graph } = getDataPlaneProviderSelection()
  if (graph === 'postgres') {
    postgresProvider ??= new PostgresGraphProvider()
    return postgresProvider
  }

  throw new Error(`GRAPH_PROVIDER=${graph} is selected but no ${graph} graph provider implementation is configured.`)
}
