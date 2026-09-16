import { NextResponse } from 'next/server'
import { createObjectStorage } from '@/lib/storage/factory'
import type { StorageReference } from '@/lib/storage/contracts'

export const dynamic = 'force-dynamic'

function allowedPreview() {
  return process.env.VERCEL_ENV === 'preview'
    && process.env.VERCEL_GIT_COMMIT_REF === 'r2-prereq-hardening-20260916'
}

async function runSmokeProbe() {
  if (!allowedPreview()) {
    return NextResponse.json({ error: 'R2 smoke probe is available only on the designated preview branch.' }, { status: 404 })
  }

  const storage = createObjectStorage('r2')
  const bucket = process.env.R2_BUCKET?.trim()
  if (!bucket) return NextResponse.json({ error: 'R2 bucket is not configured.' }, { status: 500 })

  const payload = `datanexus-r2-conformance:${crypto.randomUUID()}`
  const key = `_assurance/${Date.now()}-${crypto.randomUUID()}.txt`
  let reference: StorageReference | undefined
  const stages: Record<string, boolean> = {}

  try {
    reference = await storage.putObject({
      bucket,
      key,
      body: payload,
      contentType: 'text/plain',
    })
    stages.put = true

    const head = await storage.headObject(reference)
    stages.headExists = head.exists
    stages.headSizeMatches = head.sizeBytes === Buffer.byteLength(payload)

    const response = await storage.getObject(reference)
    const received = await response.text()
    stages.get = true
    stages.bodyMatches = received === payload

    await storage.deleteObject(reference)
    stages.delete = true

    const afterDelete = await storage.headObject(reference)
    stages.absentAfterDelete = !afterDelete.exists

    const passed = Object.values(stages).every(Boolean)
    return NextResponse.json({ passed, stages }, { status: passed ? 200 : 500 })
  } catch (error) {
    if (reference) {
      try {
        await storage.deleteObject(reference)
      } catch {
        // Best-effort cleanup only. Never mask the original conformance failure.
      }
    }
    return NextResponse.json({
      passed: false,
      stages,
      error: error instanceof Error ? error.message : 'R2 smoke probe failed.',
    }, { status: 500 })
  }
}

export async function GET() {
  return runSmokeProbe()
}

export async function POST() {
  return runSmokeProbe()
}
