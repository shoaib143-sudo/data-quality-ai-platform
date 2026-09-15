const allowedPrefix = /^(build|chore|ci|docs|feat|fix|perf|refactor|revert|security|test)(\([a-z0-9][a-z0-9-]*\))?!?: [A-Z0-9]/

export function validatePullRequestTitle(title) {
  const failures = []
  const normalized = typeof title === 'string' ? title.trim() : ''

  if (!normalized) failures.push('title is required')
  if (normalized.length > 120) failures.push('title must not exceed 120 characters')
  if (/^(draft|wip)\b/i.test(normalized)) failures.push('draft and WIP titles are not merge-ready')
  if (normalized && !allowedPrefix.test(normalized)) {
    failures.push('title must use an allowed type, optional scope, and a capitalized summary')
  }
  if (normalized.endsWith('.')) failures.push('title must not end with a period')

  return { valid: failures.length === 0, failures }
}
