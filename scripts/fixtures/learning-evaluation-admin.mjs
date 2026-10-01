// Test-only substitute for the server admin client. Never imported by application code.
let responses = []
let calls = []
export function setResponses(values) { responses = structuredClone(values); calls = [] }
export function getCalls() { return calls }
export function createAdminClient() {
  return { schema(name) {
    return { from(table) {
      const call = { schema: name, table, filters: [], orders: [] }; calls.push(call)
      const query = {
        select(columns) { call.columns = columns; return query },
        eq(key, value) { call.filters.push([key, value]); return query },
        order(key, value) { call.orders.push([key, value]); return query },
        async limit(count) {
          call.limit = count
          const response = responses.shift()
          if (!response) throw new Error('Unexpected database query')
          return response
        },
      }
      return query
    } }
  } }
}
