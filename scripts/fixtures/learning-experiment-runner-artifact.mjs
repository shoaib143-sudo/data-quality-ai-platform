let responses = []
let calls = []
export function setArtifactResponses(values) { responses = structuredClone(values); calls = [] }
export function getArtifactCalls() { return calls }
export async function persistAgentRunResultArtifact(input) {
  calls.push(structuredClone(input))
  const response = responses.shift()
  if (!response) throw new Error('Unexpected artifact persistence call')
  if (response.error) throw new Error(response.error)
  return response
}
