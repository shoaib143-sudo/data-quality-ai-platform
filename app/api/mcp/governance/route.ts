import { handleGovernanceMcpRequest } from '@/lib/governance-platform/mcp/handler'

export const runtime='nodejs'
export const dynamic='force-dynamic'

export async function POST(request:Request){return handleGovernanceMcpRequest(request)}
