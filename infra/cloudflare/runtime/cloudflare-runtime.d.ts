declare module '@cloudflare/containers' {
  export class Container {
    defaultPort: number
    sleepAfter: string
    envVars: Record<string, string>
    pingEndpoint: string
  }
}

declare module 'cloudflare:workers' {
  export const env: Record<string, string | undefined>
}

interface DurableObjectNamespace<T = unknown> {
  getByName(name: string): {
    fetch(request: Request): Promise<Response>
  }
}
