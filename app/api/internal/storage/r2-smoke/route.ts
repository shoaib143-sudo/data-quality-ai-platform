import { NextResponse } from 'next/server'
import { createObjectStorage } from '@/lib/storage/factory'
import { requireInternalBearer } from '@/lib/security/internal-bearer'
import type { StorageReference } from '@/lib/storage/contracts'

// requireInternalBearer validates the CRON_SECRET using constant-time comparison.
export const dynamic = 'force-dynamic'

function allowedPreview() {
  const allowedRef = process.env.R2_SMOKE_ALLOWED_REF?.trim()
  const currentRef = process.env.VERCEL_GIT_COMMIT_REF?.trim()
  return process.env.VERCEL_ENV === 'preview'
    && Boolean(allowedRef)
    && Boolean(currentRef)
    && currentRef === allowedRef
}

function previewOrigin() {
  const host = process.env.VERCEL_BRANCH_URL?.trim() || process.env.VERCEL_URL?.trim()
  return host ? `https://${host}` : undefined
}

function allowsOrigin(header: string | null, origin: string) {
  if (!header) return false
  return header === '*' || header.split(',').map((value) => value.trim()).includes(origin)
}

async function runSmokeProbe(request: Request) {
  if (!allowedPreview()) {
    return NextResponse.json({ error: 'R2 smoke probe is not enabled for this preview branch.' }, { status: 404 })
  }
  if (!requireInternalBearer(request)) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 })
  }

  const storage = createObjectStorage('r2')
  const bucket = process.env.R2_BUCKET?.trim()
  const origin = previewOrigin()
  if (!bucket) return NextResponse.json({ error: 'R2 bucket is not configured.' }, { status: 500 })
  if (!origin) return NextResponse.json({ error: 'Preview origin is not configured.' }, { status: 500 })

  const payload = `datanexus-r2-conformance:${crypto.randomUUID()}`
  const expectedSizeBytes = Buffer.byteLength(payload)
  const key = `_assurance/${Date.now()}-${crypto.randomUUID()}.txt`
  const browserKey = `_assurance/browser-${Date.now()}-${crypto.randomUUID()}.txt`
  let reference: StorageReference | undefined
  let browserReference: StorageReference | undefined
  const stages: Record<string, boolean> = {}
  const diagnostics: Record<string, number | null | string> = { expectedSizeBytes, origin }

  try {
    reference = await storage.putObject({ bucket, key, body: payload, contentType: 'text/plain' })
    stages.put = true

    const head = await storage.headObject(reference)
    diagnostics.headSizeBytes = head.sizeBytes ?? null
    diagnostics.headContentType = head.contentType ?? ''
    stages.headExists = head.exists
    stages.headSizeMatches = head.sizeBytes === expectedSizeBytes

    const response = await storage.getObject(reference)
    const received = await response.text()
    stages.get = true
    stages.bodyMatches = received === payload

    await storage.deleteObject(reference)
    stages.delete = true
    const afterDelete = await storage.headObject(reference)
    stages.absentAfterDelete = !afterDelete.exists

    const uploadAuthorization = await storage.createUploadAuthorization({
      bucket,
      key: browserKey,
      contentType: 'text/plain',
      expiresInSeconds: 120,
    })
    if (!uploadAuthorization.url) throw new Error('R2 presigned upload URL was not returned.')

    const preflight = await fetch(uploadAuthorization.url, {
      method: 'OPTIONS',
      headers: {
        origin,
        'access-control-request-method': 'PUT',
        'access-control-request-headers': 'content-type',
      },
    })
    const preflightAllowOrigin = preflight.headers.get('access-control-allow-origin')
    const preflightAllowMethods = preflight.headers.get('access-control-allow-methods') ?? ''
    const preflightAllowHeaders = preflight.headers.get('access-control-allow-headers') ?? ''
    diagnostics.corsPreflightStatus = preflight.status
    diagnostics.corsAllowOrigin = preflightAllowOrigin ?? ''
    stages.corsPreflight = preflight.ok
      && allowsOrigin(preflightAllowOrigin, origin)
      && preflightAllowMethods.toUpperCase().split(',').map((value) => value.trim()).includes('PUT')
      && preflightAllowHeaders.toLowerCase().split(',').map((value) => value.trim()).includes('content-type')

    const browserPut = await fetch(uploadAuthorization.url, {
      method: 'PUT',
      headers: { ...(uploadAuthorization.requiredHeaders ?? {}), origin },
      body: payload,
    })
    diagnostics.presignedPutStatus = browserPut.status
    stages.presignedPut = browserPut.ok && allowsOrigin(browserPut.headers.get('access-control-allow-origin'), origin)

    browserReference = {
      provider: 'r2',
      bucket: uploadAuthorization.bucket,
      key: uploadAuthorization.key,
      contentType: 'text/plain',
    }
    const browserHead = await storage.headObject(browserReference)
    stages.presignedHead = browserHead.exists && browserHead.sizeBytes === expectedSizeBytes

    const downloadAuthorization = await storage.createDownloadAuthorization({ reference: browserReference, expiresInSeconds: 120 })
    if (!downloadAuthorization.url) throw new Error('R2 presigned download URL was not returned.')
    const browserGet = await fetch(downloadAuthorization.url, { headers: { origin } })
    const browserBody = await browserGet.text()
    diagnostics.presignedGetStatus = browserGet.status
    stages.presignedGet = browserGet.ok
      && browserBody === payload
      && allowsOrigin(browserGet.headers.get('access-control-allow-origin'), origin)

    await storage.deleteObject(browserReference)
    stages.presignedDelete = true
    const browserAfterDelete = await storage.headObject(browserReference)
    stages.presignedAbsentAfterDelete = !browserAfterDelete.exists

    const passed = Object.values(stages).every(Boolean)
    return NextResponse.json({ passed, stages, diagnostics }, { status: passed ? 200 : 500 })
  } catch (error) {
    for (const candidate of [reference, browserReference]) {
      if (!candidate) continue
      try {
        await storage.deleteObject(candidate)
      } catch {
        // Best-effort cleanup only. Never mask the original conformance failure.
      }
    }
    return NextResponse.json({
      passed: false,
      stages,
      diagnostics,
      error: error instanceof Error ? error.message : 'R2 smoke probe failed.',
    }, { status: 500 })
  }
}

export async function GET(request: Request) {
  return runSmokeProbe(request)
}

export async function POST(request: Request) {
  return runSmokeProbe(request)
}
