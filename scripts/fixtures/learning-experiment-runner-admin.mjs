// Test-only RPC substitute for the paired experiment runner.
let responses = []
let calls = []
export function setResponses(values) { responses = structuredClone(values); calls = [] }
export function getCalls() { return calls }
export function createAdminClient() {
  return {
    schema(name) {
      return {
        async rpc(fn, args) {
          calls.push({ schema: name, fn, args: structuredClone(args) })
          const response = responses.shift()
          if (!response) throw new Error('Unexpected experiment runner RPC')
          return response
        },
      }
    },
  }
}
