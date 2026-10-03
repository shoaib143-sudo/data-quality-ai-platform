export type BiProvider='POWER_BI'|'TABLEAU'|'LOOKER'
export type BiAsset={provider:BiProvider;externalId:string;assetType:'WORKSPACE'|'REPORT'|'DASHBOARD'|'SEMANTIC_MODEL'|'DATASET'|'FIELD';name:string;container:string|null;upstream:string[];expression:string|null;metadata:Record<string,unknown>}
function text(v:unknown){return typeof v==='string'?v.trim():''}
function record(v:unknown){return v&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:{}}
function list(v:unknown){return Array.isArray(v)?v:[]}
function strings(v:unknown){return list(v).map(item=>typeof item==='string'?text(item):text(record(item).name??record(item).id??record(item).qualifiedName)).filter(Boolean)}
function providerItems(provider:BiProvider,input:unknown){
  if(Array.isArray(input))return input
  const root=record(input)
  const direct=list(root.items??root.assets??root.content)
  if(direct.length)return direct
  if(provider==='POWER_BI'){
    return [
      ...list(root.workspaces).map(item=>({...record(item),type:record(item).type??'WORKSPACE'})),
      ...list(root.reports).map(item=>({...record(item),type:record(item).type??'REPORT'})),
      ...list(root.dashboards).map(item=>({...record(item),type:record(item).type??'DASHBOARD'})),
      ...list(root.semanticModels??root.datasets).map(item=>({...record(item),type:record(item).type??'SEMANTIC_MODEL'})),
    ]
  }
  if(provider==='TABLEAU'){
    return [
      ...list(root.projects).map(item=>({...record(item),type:record(item).type??'WORKSPACE'})),
      ...list(root.workbooks).map(item=>({...record(item),type:record(item).type??'REPORT'})),
      ...list(root.datasources??root.dataSources).map(item=>({...record(item),type:record(item).type??'DATASET'})),
      ...list(root.fields).map(item=>({...record(item),type:record(item).type??'FIELD'})),
    ]
  }
  return [
    ...list(root.projects).map(item=>({...record(item),type:record(item).type??'WORKSPACE'})),
    ...list(root.dashboards).map(item=>({...record(item),type:record(item).type??'DASHBOARD'})),
    ...list(root.looks).map(item=>({...record(item),type:record(item).type??'REPORT'})),
    ...list(root.explores).map(item=>({...record(item),type:record(item).type??'SEMANTIC_MODEL'})),
    ...list(root.fields).map(item=>({...record(item),type:record(item).type??'FIELD'})),
  ]
}
export function normalizeBiMetadata(provider:BiProvider,input:unknown):BiAsset[]{
  const items=providerItems(provider,input)
  return items.flatMap((raw,index)=>{
    const row=record(raw)
    const name=text(row.name??row.displayName??row.title)
    if(!name)return []
    const typeRaw=text(row.assetType??row.asset_type??row.type??row.kind).toUpperCase().replace(/[ -]+/g,'_')
    const assetType:BiAsset['assetType']=typeRaw.includes('DASHBOARD')?'DASHBOARD':typeRaw.includes('REPORT')||typeRaw.includes('WORKBOOK')?'REPORT':typeRaw.includes('SEMANTIC')||typeRaw.includes('MODEL')||typeRaw.includes('EXPLORE')?'SEMANTIC_MODEL':typeRaw.includes('FIELD')||typeRaw.includes('COLUMN')||typeRaw.includes('MEASURE')?'FIELD':typeRaw.includes('WORKSPACE')||typeRaw.includes('PROJECT')?'WORKSPACE':'DATASET'
    return [{provider,externalId:text(row.id??row.external_id??row.luid??row.urn??row.qualifiedName)||provider.toLowerCase()+':'+index+':'+name,assetType,name,container:text(row.workspace??row.workspaceName??row.project??row.projectName??row.folder??row.container)||null,upstream:strings(row.upstream??row.sources??row.dataSources??row.data_sources??row.tables??row.connections),expression:text(row.expression??row.dax??row.m_expression??row.calculation??row.formula??row.sql)||null,metadata:record(row.metadata??row.attributes??row.properties)}]
  })
}
