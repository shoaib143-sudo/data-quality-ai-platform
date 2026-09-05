import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { withSupabase } from 'npm:@supabase/server@^1'

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

export default {
  fetch: withSupabase({ auth: 'secret' }, async (req: Request) => {
    if (req.method === 'GET') {
      return json({ status: 'healthy', model: 'gte-small', dimensions: DIMENSIONS })
    }
    if (req.method !== 'POST') return json({ error: 'Method not allowed.' }, 405)

    try {
      const body = await req.json().catch(() => ({})) as Record<string, unknown>
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
  }),
}
