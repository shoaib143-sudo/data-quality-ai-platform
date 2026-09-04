export type OcrExtractionResult = {
  text: string
  provider: 'OCR_SPACE'
  configured: boolean
  pages: number
  warnings: string[]
}

type OcrSpacePayload = {
  OCRExitCode?: number
  IsErroredOnProcessing?: boolean
  ErrorMessage?: string | string[] | null
  ErrorDetails?: string | null
  ParsedResults?: Array<{
    ParsedText?: string | null
    ErrorMessage?: string | null
    ErrorDetails?: string | null
  }>
}

const OCR_ENDPOINT = 'https://api.ocr.space/parse/image'

function messageList(value: unknown) {
  if (Array.isArray(value)) return value.map(String).filter(Boolean)
  if (typeof value === 'string' && value.trim()) return [value.trim()]
  return []
}

export function ocrSpaceConfigured() {
  return Boolean(process.env.OCR_SPACE_API_KEY?.trim())
}

export async function extractWithOcrSpace(input: {
  bytes: Uint8Array
  fileName: string
  contentType?: string | null
}): Promise<OcrExtractionResult> {
  const apiKey = process.env.OCR_SPACE_API_KEY?.trim()
  if (!apiKey) {
    return {
      text: '',
      provider: 'OCR_SPACE',
      configured: false,
      pages: 0,
      warnings: ['OCR.Space is selected as the free OCR provider but OCR_SPACE_API_KEY is not configured. Native document extraction still runs without this key.'],
    }
  }

  const controller = new AbortController()
  const configuredTimeout = Number(process.env.OCR_SPACE_TIMEOUT_MS)
  const timeoutMs = Number.isFinite(configuredTimeout) ? Math.min(180_000, Math.max(10_000, configuredTimeout)) : 90_000
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const form = new FormData()
    form.append('file', new Blob([Buffer.from(input.bytes)], { type: input.contentType || 'application/octet-stream' }), input.fileName)
    form.append('language', process.env.OCR_SPACE_LANGUAGE?.trim() || 'eng')
    form.append('isOverlayRequired', 'false')
    form.append('detectOrientation', 'true')
    form.append('scale', 'true')
    form.append('OCREngine', process.env.OCR_SPACE_ENGINE?.trim() === '1' ? '1' : '2')

    const response = await fetch(OCR_ENDPOINT, {
      method: 'POST',
      headers: { apikey: apiKey },
      body: form,
      cache: 'no-store',
      signal: controller.signal,
    })
    const payload = await response.json().catch(() => null) as OcrSpacePayload | null
    if (!response.ok) throw new Error(`OCR.Space returned HTTP ${response.status}.`)
    if (!payload) throw new Error('OCR.Space returned an unreadable response.')

    const warnings = [
      ...messageList(payload.ErrorMessage),
      ...messageList(payload.ErrorDetails),
      ...(payload.ParsedResults ?? []).flatMap((page) => [...messageList(page.ErrorMessage), ...messageList(page.ErrorDetails)]),
    ]
    const text = (payload.ParsedResults ?? []).map((page) => page.ParsedText ?? '').filter(Boolean).join('\n\n').trim()
    if (payload.IsErroredOnProcessing && !text) throw new Error(warnings.join(' ') || 'OCR.Space could not process the document.')

    return {
      text,
      provider: 'OCR_SPACE',
      configured: true,
      pages: payload.ParsedResults?.length ?? 0,
      warnings: [
        'OCR content was processed by the external OCR.Space service. Do not route restricted documents to external OCR unless your governance policy permits it.',
        ...warnings,
      ],
    }
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw new Error(`OCR.Space request timed out after ${timeoutMs}ms.`)
    throw error
  } finally {
    clearTimeout(timeout)
  }
}
