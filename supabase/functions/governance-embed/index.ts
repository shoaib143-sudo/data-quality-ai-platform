import 'jsr:@supabase/functions-js/edge-runtime.d.ts'

const model = new Supabase.ai.Session('gte-small')
const DIMENSIONS = 384

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  })
}

function bearerRole(req: Request) {
  const authorization = req.headers.get('authorization')?.trim() ?? ''
  if (!authorization.toLowerCase().startsWith('bearer ')) return null
  const token = authorization.slice(7).trim()
  const parts = token.split('.')
  if (parts.length !== 3) return null

  try {
    const encoded = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const padded = encoded.padEnd(encoded.length + ((4 - encoded.length % 4) % 4), '=')
    const claims = JSON.parse(atob(padded)) as Record<string, unknown>
    return typeof claims.role === 'string' ? claims.role : null
  } catch {
    return null
  }
}

Deno.serve(async (req: Request) => {
  // verify_jwt is enabled at the platform boundary. The explicit role check
  // ensures that an ordinary authenticated user token cannot invoke privileged
  // production governance embedding inference.
  if (bearerRole(req) !== 'service_role') {
    return json({ error: 'Service-role authorization is required.' }, 403)
  }

  if (req.method === 'GET') {
    return json({ status: 'healthy', model: 'gte-small', dimensions: DIMENSIONS })
  }
  if (req.method !== 'POST') return json({ error: 'Method not allowed.' }, 405)

  try {
    const body = await req.json().catch(() => ({})) as Record<string, unknown>
    if (body.action === 'health') {
      return json({ status: 'healthy', model: 'gte-small', dimensions: DIMENSIONS })
    }

    const input = typeof body.input === 'string' ? body.input.trim() : ''
    if (!input) return json({ error: 'input is required.' }, 400)
    if (input.length > 100_000) return json({ error: 'input exceeds the supported size.' }, 413)

    const embedding = await model.run(input, {
      mean_pool: true,
      normalize: true,
    })
    if (
      !Array.isArray(embedding)
      || embedding.length !== DIMENSIONS
      || embedding.some((value) => !Number.isFinite(Number(value)))
    ) {
      return json({ error: 'Embedding model returned an invalid vector.' }, 502)
    }

    return json({ embedding, model: 'gte-small', dimensions: DIMENSIONS })
  } catch (error) {
    console.error('[governance-embed]', error instanceof Error ? error.message : String(error))
    return json({ error: 'Embedding generation failed.' }, 500)
  }
})
