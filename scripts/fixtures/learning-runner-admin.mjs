// Test-only canonical database substitute. No application or live database writes.
let responses = [], calls = []
export function setResponses(values) { responses = structuredClone(values); calls = [] }
export function getCalls() { return calls }
const take = () => { const response = responses.shift(); if (!response) throw new Error('Unexpected database query'); return response }
export function createAdminClient() {
  return { schema(schema) { return {
    from(table) {
      const call = { schema, table, filters: [] }; calls.push(call)
      const query = {
        select(columns) { call.columns = columns; return query },
        eq(key, value) { call.filters.push([key, value]); return query },
        async maybeSingle() { return take() },
      }
      return query
    },
    async rpc(name, args) { calls.push({ schema, rpc: name, args }); return take() },
  } } }
}
