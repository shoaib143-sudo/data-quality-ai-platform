import { NextResponse } from 'next/server'
import {
  dataNexusEnvironment,
  dataNexusPlatform,
  deploymentBuildTimestamp,
  deploymentCommitSha,
  deploymentReleaseId,
} from '@/lib/runtime/environment'

export const dynamic = 'force-dynamic'

export async function GET() {
  return NextResponse.json({
    commitSha: deploymentCommitSha(),
    environment: dataNexusEnvironment(),
    platform: dataNexusPlatform(),
    buildTimestamp: deploymentBuildTimestamp(),
    releaseId: deploymentReleaseId(),
  }, {
    headers: { 'Cache-Control': 'no-store' },
  })
}
