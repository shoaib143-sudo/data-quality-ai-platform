import { GovernanceProviderError } from '../sdk/errors.ts'

export type InformaticaClientConfig = {
  baseUrl: string
  accessToken: () => Promise<string>
  fetchImpl?: typeof fetch
  timeoutMs?: number
}

export class InformaticaApiClient {
  private readonly baseUrl: string
  private readonly accessToken: () => Promise<string>
  private readonly fetchImpl: typeof fetch
  private readonly timeoutMs: number

  constructor(config: InformaticaClientConfig) {
    let parsed: URL
    try { parsed = new URL(config.baseUrl) } catch { throw new GovernanceProviderError('VALIDATION_FAILED', 'Informatica base URL is invalid.') }
    if (parsed.protocol !== 'https:' && parsed.hostname !== 'localhost' && parsed.hostname !== '127.0.0.1') {
      throw new GovernanceProviderError('VALIDATION_FAILED', 'Informatica base URL must use HTTPS.')
    }
    if (parsed.username || parsed.password) throw new GovernanceProviderError('VALIDATION_FAILED', 'Informatica base URL must not contain embedded credentials.')
    const timeoutMs=config.timeoutMs??15_000
    if(!Number.isFinite(timeoutMs)||timeoutMs<=0||timeoutMs>60_000)throw new GovernanceProviderError('VALIDATION_FAILED','Informatica request timeout must be between 1 and 60000 milliseconds.')
    this.baseUrl = parsed.toString().replace(/\/$/, '')
    this.accessToken = config.accessToken
    this.fetchImpl = config.fetchImpl ?? fetch
    this.timeoutMs = Math.floor(timeoutMs)
  }

  async getJson(path: string): Promise<unknown> {
    let token: string
    try { token = (await this.accessToken()).trim() } catch {
      throw new GovernanceProviderError('AUTHENTICATION_FAILED', 'Unable to acquire Informatica access token.')
    }
    if (!token) throw new GovernanceProviderError('AUTHENTICATION_FAILED', 'Informatica access token is empty.')

    let response: Response
    try {
      response = await this.fetchImpl(`${this.baseUrl}/${path.replace(/^\//, '')}`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
        signal: AbortSignal.timeout(this.timeoutMs),
      })
    } catch (error) {
      const name = error instanceof Error ? error.name : ''
      throw new GovernanceProviderError(
        name === 'AbortError' || name === 'TimeoutError' ? 'TRANSIENT_FAILURE' : 'PROVIDER_UNAVAILABLE',
        name === 'AbortError' || name === 'TimeoutError' ? 'Informatica request timed out.' : 'Informatica provider is unavailable.',
        { details: { cause: error instanceof Error ? error.message : String(error) } },
      )
    }
    if (!response.ok) {
      if (response.status === 401) throw new GovernanceProviderError('AUTHENTICATION_FAILED', 'Informatica authentication failed.')
      if (response.status === 403) throw new GovernanceProviderError('AUTHORIZATION_DENIED', 'Informatica authorization was denied.')
      if (response.status === 404) throw new GovernanceProviderError('NOT_FOUND', 'Informatica resource was not found.')
      if (response.status === 429) throw new GovernanceProviderError('RATE_LIMITED', 'Informatica rate limit was reached.')
      if ([408, 500, 502, 503, 504].includes(response.status)) throw new GovernanceProviderError('TRANSIENT_FAILURE', `Informatica request failed with HTTP ${response.status}.`)
      throw new GovernanceProviderError('VALIDATION_FAILED', `Informatica request failed with HTTP ${response.status}.`)
    }
    try { return await response.json() } catch {
      throw new GovernanceProviderError('VALIDATION_FAILED', 'Informatica returned invalid JSON.')
    }
  }
}
