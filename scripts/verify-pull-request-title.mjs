import { readFile } from 'node:fs/promises'
import { validatePullRequestTitle } from '../lib/release-assurance/pull-request-title-policy.mjs'

const eventName = process.env.GITHUB_EVENT_NAME

if (eventName !== 'pull_request') {
  console.log('Pull request title policy skipped for non-PR event.')
  process.exit(0)
}

if (!process.env.GITHUB_EVENT_PATH) throw new Error('GITHUB_EVENT_PATH is required for pull_request events.')

const event = JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH, 'utf8'))
const result = validatePullRequestTitle(event?.pull_request?.title)

if (!result.valid) {
  console.error('Pull request title policy failed:')
  for (const failure of result.failures) console.error(`- ${failure}`)
  process.exit(1)
}

console.log(`Pull request title policy passed: ${event.pull_request.title}`)
