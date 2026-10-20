import { NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/auth/require-api-user'
import { normalizeFederatedMetadata, detectFederationConflicts } from '@/lib/catalog/metadata-federation'

function text(value:unknown){return typeof value==='string'?value.trim():''}

export async function POST(request:Request){
  try{
    await requireApiUser()
    const body=await request.json()
    const sourceCatalog=text(body.sourceCatalog??body.source_catalog)
    if(!sourceCatalog)return NextResponse.json({error:'sourceCatalog is required.'},{status:400})
    const records=normalizeFederatedMetadata(body.records??body.payload??body,sourceCatalog)
    if(!records.length)return NextResponse.json({error:'No usable metadata records were found.'},{status:400})
    const conflicts=detectFederationConflicts(records)
    return NextResponse.json({
      mode:'DRY_RUN',
      persisted:false,
      sourceCatalog,
      recordCount:records.length,
      conflictCount:conflicts.length,
      records,
      conflicts,
      guidance:'Review authority and conflicts before any governed persistence or external synchronization.',
    })
  }catch(error){
    return NextResponse.json({error:error instanceof Error?error.message:'Metadata federation normalization failed.'},{status:400})
  }
}
