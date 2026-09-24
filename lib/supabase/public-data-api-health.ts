export type SupabasePublicDataApiProbeResult = {
  ok: boolean
  httpStatus: number | null
}

export type SupabasePublicDataApiProbeOptions = {
  url: string
  publishableKey: string
  timeoutMs?: number
  fetchImpl?: typeof fetch
}

const DEFAULT_TIMEOUT_MS = 5_000

export async function probeSupabasePublicDataApi(
  options: SupabasePublicDataApiProbeOptions,
): Promise<SupabasePublicDataApiProbeResult> {
  const controller = new AbortController()
  const timeout = setTimeout(
    () => controller.abort(),
    Math.max(250, Math.min(10_000, options.timeoutMs ?? DEFAULT_TIMEOUT_MS)),
  )

  try {
    // Probe a purpose-built zero-data RPC instead of /rest/v1/ root.
    // Supabase's new API gateway reserves the root metadata endpoint for secret
    // keys, while publishable keys are valid on ordinary Data API resources.
    const response = await (options.fetchImpl ?? fetch)(
      `${options.url.replace(/\/$/, '')}/rest/v1/rpc/public_data_api_health`,
      {
        method: 'POST',
        headers: {
          apikey: options.publishableKey,
          authorization: `Bearer ${options.publishableKey}`,
          'content-type': 'application/json',
        },
        body: '{}',
        cache: 'no-store',
        signal: controller.signal,
      },
    )

    return {
      ok: response.ok,
      httpStatus: response.status,
    }
  } catch {
    return {
      ok: false,
      httpStatus: null,
    }
  } finally {
    clearTimeout(timeout)
  }
}
