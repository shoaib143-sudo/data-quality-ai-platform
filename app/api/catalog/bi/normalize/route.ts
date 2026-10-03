import { NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/auth/require-api-user'
import { normalizeBiMetadata, type BiProvider } from '@/lib/connectors/bi-metadata'
const providers=new Set<BiProvider>(['POWER_BI','TABLEAU','LOOKER'])
function text(v:unknown){return typeof v==='string'?v.trim():''}
export async function POST(request:Request){
  try{
    await requireApiUser()
    const body=await request.json()
    const provider=text(body.provider).toUpperCase().replace(/[ -]+/g,'_') as BiProvider
    if(!providers.has(provider))return NextResponse.json({error:'Unsupported BI provider.'},{status:400})
    const assets=normalizeBiMetadata(provider,body.payload??body.assets??body)
    return NextResponse.json({mode:'DRY_RUN',persisted:false,provider,assetCount:assets.length,assets})
  }catch(error){
    return NextResponse.json({error:error instanceof Error?error.message:'BI metadata normalization failed.'},{status:400})
  }
}
