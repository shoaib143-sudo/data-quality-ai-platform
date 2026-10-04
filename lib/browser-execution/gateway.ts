import { BrowserUseProvider } from './browser-use-provider'
import { assertBrowserExecutionPolicy } from './policy'
import type { BrowserExecutionProvider, BrowserExecutionRequest, BrowserExecutionResult } from './contracts'

const providers = new Map<string, BrowserExecutionProvider>([['browser-use', new BrowserUseProvider()]])

export function registerBrowserExecutionProvider(provider: BrowserExecutionProvider) {
  providers.set(provider.key, provider)
}

export async function executeGovernedBrowserRequest(input: {
  request: BrowserExecutionRequest
  providerKey?: string
  authorize: (request: BrowserExecutionRequest) => Promise<{ allowed: boolean; reason?: string }>
}): Promise<BrowserExecutionResult> {
  assertBrowserExecutionPolicy(input.request)
  const decision = await input.authorize(input.request)
  if (!decision.allowed) throw new Error(`BROWSER_EXECUTION_NOT_AUTHORIZED:${decision.reason ?? 'policy denied'}`)
  const provider = providers.get(input.providerKey ?? 'browser-use')
  if (!provider) throw new Error('BROWSER_EXECUTION_PROVIDER_UNAVAILABLE')
  return provider.execute(input.request)
}

export function getBrowserExecutionProvider(providerKey = 'browser-use') {
  const provider = providers.get(providerKey)
  if (!provider) throw new Error('BROWSER_EXECUTION_PROVIDER_UNAVAILABLE')
  return provider
}
