import type { BrowserExecutionProvider } from './contracts'
import { BrowserUseProvider } from './browser-use-provider'

export function createBrowserExecutionProviders(env: NodeJS.ProcessEnv = process.env) {
  const providers = new Map<string, BrowserExecutionProvider>()
  const browserUseKey = env.BROWSER_USE_API_KEY?.trim()
  if (browserUseKey) providers.set('browser-use', new BrowserUseProvider({ apiKey: browserUseKey }))
  return providers
}

export function requireBrowserExecutionProvider(
  providers: ReadonlyMap<string, BrowserExecutionProvider>,
  key: string,
) {
  const provider = providers.get(key)
  if (!provider) throw new Error(`Browser execution provider is unavailable: ${key}`)
  return provider
}
