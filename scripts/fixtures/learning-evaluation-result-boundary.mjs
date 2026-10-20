let currentUserId = null
let authFailure = null
let policyRow = null
let policyFailure = null
let assignmentRow = null
let acknowledgementRow = null
let dispatchClaimRow = null
let dispatchOutcomeRow = null
let assignmentFailure = null
let acknowledgementFailure = null
let authorizationAllowed = true
let authorizationFailure = null
let authUsers = new Set()
let rpcResponse = { data: 'evaluation-result-id', error: null }
let calls = []

export function configure(input = {}) {
  currentUserId = input.userId ?? null
  authFailure = input.authFailure ?? null
  policyRow = structuredClone(input.policyRow ?? null)
  policyFailure = input.policyFailure ?? null
  assignmentRow = structuredClone(input.assignmentRow ?? null)
  acknowledgementRow = structuredClone(input.acknowledgementRow ?? null)
  dispatchClaimRow = structuredClone(input.dispatchClaimRow ?? null)
  dispatchOutcomeRow = structuredClone(input.dispatchOutcomeRow ?? null)
  assignmentFailure = input.assignmentFailure ?? null
  acknowledgementFailure = input.acknowledgementFailure ?? null
  authorizationAllowed = input.authorizationAllowed ?? true
  authorizationFailure = input.authorizationFailure ?? null
  authUsers = new Set(input.authUsers ?? [])
  rpcResponse = input.rpcResponse ?? { data: 'evaluation-result-id', error: null }
  calls = []
}

export function getCalls() { return structuredClone(calls) }

export async function requireApiUser() {
  calls.push({ type: 'auth' })
  if (authFailure) throw new Error(authFailure)
  if (!currentUserId) throw new Error('Authentication required.')
  return { id: currentUserId }
}

export async function authorizeProject(userId, projectId, capability) {
  calls.push({ type: 'authorize', userId, projectId, capability })
  if (authorizationFailure) throw new Error(authorizationFailure)
  if (!authorizationAllowed) throw new Error('You do not have permission to evaluate learning evidence.')
  return { userId, projectId, capability }
}

export function createAdminClient() {
  return {
    auth: {
      admin: {
        async getUserById(userId) {
          calls.push({ type: 'getUserById', userId })
          return authUsers.has(userId)
            ? { data: { user: { id: userId } }, error: null }
            : { data: { user: null }, error: { message: 'user not found' } }
        },
      },
    },
    schema(schemaName) {
      return {
        from(tableName) {
          const filters = []
          const query = {
            select(columns) { calls.push({ type: 'select', schemaName, tableName, columns }); return query },
            eq(column, value) { filters.push([column, value]); return query },
            async maybeSingle() {
              calls.push({ type: 'maybeSingle', schemaName, tableName, filters })
              const data = tableName === 'learning_evaluation_policies'
                ? policyRow
                : tableName === 'learning_evaluation_assignments'
                  ? assignmentRow
                  : tableName === 'learning_evaluation_assignment_acknowledgements'
                    ? acknowledgementRow
                    : tableName === 'learning_experiment_dispatch_claims'
                      ? dispatchClaimRow
                      : tableName === 'learning_experiment_dispatch_outcomes'
                        ? dispatchOutcomeRow
                    : null
              const failure = tableName === 'learning_evaluation_policies'
                ? policyFailure
                : tableName === 'learning_evaluation_assignments'
                  ? assignmentFailure
                  : tableName === 'learning_evaluation_assignment_acknowledgements'
                    ? acknowledgementFailure
                    : null
              return { data, error: failure ? { message: failure } : null }
            },
          }
          return query
        },
        async rpc(name, args) {
          calls.push({ type: 'rpc', schemaName, name, args })
          return rpcResponse
        },
      }
    },
  }
}
