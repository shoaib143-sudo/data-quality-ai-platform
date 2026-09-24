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
    // Probe a real, read-only Data API resource instead of /rest/v1/ root.
    // Supabase's new API gateway requires a secret key for the root metadata
    // endpoint, while publishable keys are valid on resource routes.
    const response = await (options.fetchImpl ?? fetch)(
      `${options.url.replace(/\/$/, '')}/rest/v1/agent_definitions?select=id&limit=0`,
      {
        method: 'GET',
        headers: {
          apikey: options.publishableKey,
          authorization: `Bearer ${options.publishableKey}`,
          'accept-profile': 'agent',
        },
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
