export type EmbeddingPurpose = 'query' | 'document'

export type EmbeddingRequest = {
  input: string
  purpose: EmbeddingPurpose
  model?: string | null
}

export type EmbeddingResult = {
  embedding: number[]
  providerId: string
  model: string | null
  dimensions: number
}

export interface EmbeddingProvider {
  readonly id: string
  embed(request: EmbeddingRequest): Promise<EmbeddingResult>
}

export type EmbeddingRuntime = {
  embedText(input: string, model?: string): Promise<number[]>
}

function requiredText(value: string, label: string) {
  const normalized = value.trim()
  if (!normalized) throw new Error(`${label} is required`)
  return normalized
}

function optionalText(value: string | null | undefined) {
  const normalized = value?.trim()
  return normalized ? normalized : null
}

function validateVector(values: number[]) {
  if (!Array.isArray(values) || values.length === 0) throw new Error('Embedding runtime returned an empty vector')
  if (values.some((value) => !Number.isFinite(value))) throw new Error('Embedding runtime returned non-finite values')
  return values
}

export class RuntimeEmbeddingProvider implements EmbeddingProvider {
  readonly id: string
  private readonly runtime: EmbeddingRuntime

  constructor(id: string, runtime: EmbeddingRuntime) {
    this.id = requiredText(id, 'provider id')
    this.runtime = runtime
  }

  async embed(request: EmbeddingRequest): Promise<EmbeddingResult> {
    const input = requiredText(request.input, 'embedding input')
    const model = optionalText(request.model)
    const embedding = validateVector(await this.runtime.embedText(input, model ?? undefined))

    return {
      embedding,
      providerId: this.id,
      model,
      dimensions: embedding.length,
    }
  }
}
