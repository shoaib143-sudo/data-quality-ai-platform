import { describe, expect, it } from 'vitest'
import { assertBrowserExecutionPolicy } from '@/lib/browser-execution/policy'
import type { BrowserExecutionRequest } from '@/lib/browser-execution/contracts'

const base: BrowserExecutionRequest = {
  runId: 'run-1', agentRunId: 'agent-run-1', projectId: 'project-1', persona: 'governance_admin',
  purpose: 'verify governed action', mode: 'VERIFY_ONLY', startUrl: 'https://example.com/catalog', task: 'verify state', risk: 'READ',
  policy: { allowedDomains: ['example.com'], maxDurationMs: 60_000, maxActions: 20 },
}

describe('browser execution policy', () => {
  it('accepts an allowlisted HTTPS domain', () => {
    expect(assertBrowserExecutionPolicy(base).hostname).toBe('example.com')
  })

  it('rejects a domain outside the allowlist', () => {
    expect(() => assertBrowserExecutionPolicy({ ...base, startUrl: 'https://evil.example.net' })).toThrow('BROWSER_DOMAIN_NOT_ALLOWLISTED')
  })

  it('rejects URL embedded credentials', () => {
    expect(() => assertBrowserExecutionPolicy({ ...base, startUrl: 'https://user:secret@example.com' })).toThrow('BROWSER_URL_CREDENTIALS_DENIED')
  })

  it('rejects high risk autonomous execution before approval', () => {
    expect(() => assertBrowserExecutionPolicy({ ...base, mode: 'AUTONOMOUS', risk: 'HIGH' })).toThrow('BROWSER_HIGH_RISK_REQUIRES_APPROVAL')
  })

  it('honors explicit deny rules before allow rules', () => {
    expect(() => assertBrowserExecutionPolicy({ ...base, startUrl: 'https://admin.example.com', policy: { ...base.policy, deniedDomains: ['admin.example.com'] } })).toThrow('BROWSER_DOMAIN_DENIED')
  })
})
