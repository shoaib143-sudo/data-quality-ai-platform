export type BiProvider='POWER_BI'|'TABLEAU'|'LOOKER'
export type BiAsset={provider:BiProvider;externalId:string;assetType:'WORKSPACE'|'REPORT'|'DASHBOARD'|'SEMANTIC_MODEL'|'DATASET'|'FIELD';name:string;container:string|null;upstream:string[];expression:string|null;metadata:Record<string,unknown>}
function text(v:unknown){return typeof v==='string'?v.trim():''}
function record(v:unknown){return v&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:{}}
function list(v:unknown){return Array.isArray(v)?v:[]}
function strings(v:unknown){return list(v).map(text).filter(Boolean)}
export function normalizeBiMetadata(provider:BiProvider,input:unknown):BiAsset[]{
  const root=record(input)
  const items=Array.isArray(input)?input:list(root.items??root.assets??root.reports??root.content)
  return items.flatMap((raw,index)=>{
    const row=record(raw)
    const name=text(row.name??row.displayName??row.title)
    if(!name)return []
    const typeRaw=text(row.assetType??row.asset_type??row.type??row.kind).toUpperCase().replace(/[ -]+/g,'_')
    const assetType:BiAsset['assetType']=typeRaw.includes('DASHBOARD')?'DASHBOARD':typeRaw.includes('REPORT')||typeRaw.includes('WORKBOOK')?'REPORT':typeRaw.includes('SEMANTIC')||typeRaw.includes('MODEL')||typeRaw.includes('EXPLORE')?'SEMANTIC_MODEL':typeRaw.includes('FIELD')||typeRaw.includes('COLUMN')||typeRaw.includes('MEASURE')?'FIELD':typeRaw.includes('WORKSPACE')||typeRaw.includes('PROJECT')?'WORKSPACE':'DATASET'
    return [{provider,externalId:text(row.id??row.external_id??row.luid??row.urn)||provider.toLowerCase()+':'+index+':'+name,assetType,name,container:text(row.workspace??row.project??row.folder??row.container)||null,upstream:strings(row.upstream??row.sources??row.dataSources??row.data_sources),expression:text(row.expression??row.dax??row.m_expression??row.calculation??row.sql)||null,metadata:record(row.metadata??row.attributes)}]
  })
}
