export type InvestigationModelConfig = {
  apiKey: string
  baseUrl: string
  model: string
}

function getConfig(): InvestigationModelConfig | null {
  const apiKey = process.env.AI_MODEL_API_KEY?.trim()
  if (!apiKey) return null

  return {
    apiKey,
    baseUrl: (process.env.AI_MODEL_BASE_URL ?? 'https://api.openai.com/v1').replace(/\/$/, ''),
    model: process.env.AI_MODEL_NAME?.trim() || 'gpt-4.1-mini',
  }
}

function extractJson(content: string) {
  const trimmed = content.trim()
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)
  return JSON.parse(fenced ? fenced[1] : trimmed)
}

export async function enrichInvestigationWithModel(input: Record<string, unknown>) {
  const config = getConfig()
  if (!config) return null

  const response = await fetch(`${config.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${config.apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: config.model,
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: [
            'You are the DataNexus AI Data Profiling Investigation Agent.',
            'Interpret persisted profiling evidence without inventing facts.',
            'Separate observed evidence from hypotheses.',
            'Never claim a root cause is proven unless the evidence proves it.',
            'Never recommend modifying, deleting, or changing production data automatically.',
            'Return JSON with: executive_summary, probable_root_causes, business_issue, business_impact, risk, recommendations, confidence, evidence_gaps.',
            'Each recommendation must include action, priority, approval_required, rationale.',
          ].join(' '),
        },
        {
          role: 'user',
          content: JSON.stringify(input),
        },
      ],
    }),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`AI investigation provider returned ${response.status}: ${text.slice(0, 500)}`)
  }

  const payload = await response.json() as {
    choices?: Array<{ message?: { content?: string } }>
  }
  const content = payload.choices?.[0]?.message?.content
  if (!content) throw new Error('AI investigation provider returned no content.')

  const result = extractJson(content)
  if (!result || typeof result !== 'object' || Array.isArray(result)) {
    throw new Error('AI investigation provider returned an invalid JSON object.')
  }

  return {
    provider: 'openai_compatible',
    model: config.model,
    result: result as Record<string, unknown>,
  }
}
