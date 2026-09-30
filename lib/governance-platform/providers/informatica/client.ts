import { GovernanceProviderError } from '../sdk/errors'

export type InformaticaClientConfig = {
  baseUrl: string
  accessToken: () => Promise<string>
  fetchImpl?: typeof fetch
}

export class InformaticaApiClient {
  private readonly baseUrl: string
  private readonly accessToken: () => Promise<string>
  private readonly fetchImpl: typeof fetch

  constructor(config: InformaticaClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '')
    this.accessToken = config.accessToken
    this.fetchImpl = config.fetchImpl ?? fetch
  }

  async getJson(path: string): Promise<unknown> {
    const token = await this.accessToken()
    const response = await this.fetchImpl(`${this.baseUrl}/${path.replace(/^\//, '')}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    })
    if (response.ok) return response.json()
    if (response.status === 401) throw new GovernanceProviderError('AUTHENTICATION_FAILED', 'Informatica authentication failed.')
    if (response.status === 403) throw new GovernanceProviderError('AUTHORIZATION_DENIED', 'Informatica authorization was denied.')
    if (response.status === 404) throw new GovernanceProviderError('NOT_FOUND', 'Informatica resource was not found.')
    if (response.status === 429) throw new GovernanceProviderError('RATE_LIMITED', 'Informatica rate limit was reached.')
    if ([408, 500, 502, 503, 504].includes(response.status)) throw new GovernanceProviderError('TRANSIENT_FAILURE', `Informatica request failed with HTTP ${response.status}.`)
    throw new GovernanceProviderError('VALIDATION_FAILED', `Informatica request failed with HTTP ${response.status}.`)
  }
}
