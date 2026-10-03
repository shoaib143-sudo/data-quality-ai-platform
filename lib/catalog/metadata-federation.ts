export type FederationAuthority='SOURCE'|'EXTERNAL_CATALOG'|'DATANEXUS'
export type FederatedMetadataRecord={
  externalId:string
  sourceCatalog:string
  authority:FederationAuthority
  assetType:string
  namespace:string|null
  name:string
  description:string|null
  owners:string[]
  tags:string[]
  classifications:string[]
  sourceUrl:string|null
  observedAt:string|null
  attributes:Record<string,unknown>
}

function text(value:unknown){return typeof value==='string'?value.trim():''}
function strings(value:unknown){return Array.isArray(value)?[...new Set(value.map(text).filter(Boolean))]:[]}
function record(value:unknown){return value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{}}

export function normalizeFederatedMetadata(input:unknown,sourceCatalog:string):FederatedMetadataRecord[]{
  const root=record(input)
  const items=Array.isArray(input)?input:Array.isArray(root.items)?root.items:Array.isArray(root.assets)?root.assets:[root]
  return items.flatMap((raw,index)=>{
    const row=record(raw)
    const name=text(row.name??row.asset_name??row.table_name??row.displayName)
    if(!name)return []
    const namespace=text(row.namespace??row.schema??row.database??row.domain)||null
    const externalId=text(row.id??row.external_id??row.urn??row.qualifiedName)||`${sourceCatalog}:${namespace??'default'}:${name}:${index}`
    const authorityText=text(row.authority).toUpperCase()
    const authority:FederationAuthority=authorityText==='DATANEXUS'?'DATANEXUS':authorityText==='SOURCE'?'SOURCE':'EXTERNAL_CATALOG'
    return [{
      externalId,
      sourceCatalog,
      authority,
      assetType:text(row.assetType??row.asset_type??row.type)||'DATASET',
      namespace,
      name,
      description:text(row.description??row.business_description)||null,
      owners:strings(row.owners??row.owner_ids??(row.owner?[row.owner]:[])),
      tags:strings(row.tags??row.labels),
      classifications:strings(row.classifications??row.classification_codes),
      sourceUrl:text(row.url??row.source_url)||null,
      observedAt:text(row.observedAt??row.observed_at??row.updated_at)||null,
      attributes:record(row.attributes??row.metadata),
    }]
  })
}

export function federationConflictKey(record:FederatedMetadataRecord){
  return [record.namespace??'',record.name,record.assetType].map(value=>value.toLowerCase()).join('::')
}

export function detectFederationConflicts(records:FederatedMetadataRecord[]){
  const byKey=new Map<string,FederatedMetadataRecord[]>()
  for(const item of records){const key=federationConflictKey(item);byKey.set(key,[...(byKey.get(key)??[]),item])}
  return [...byKey.entries()].flatMap(([key,items])=>{
    const descriptions=new Set(items.map(item=>item.description).filter(Boolean))
    const owners=new Set(items.flatMap(item=>item.owners))
    const authorities=new Set(items.map(item=>item.authority))
    if(items.length<2||descriptions.size<=1&&authorities.size<=1)return []
    return [{key,records:items,descriptionConflict:descriptions.size>1,ownerVariants:[...owners],authorities:[...authorities]}]
  })
}


const authorityPriority:Record<FederationAuthority,number>={DATANEXUS:3,SOURCE:2,EXTERNAL_CATALOG:1}

export type FederatedMetadataResolution={
  key:string
  selected:FederatedMetadataRecord
  alternatives:FederatedMetadataRecord[]
  reason:string
  mergedTags:string[]
  mergedClassifications:string[]
}

export function resolveFederatedMetadata(records:FederatedMetadataRecord[]):FederatedMetadataResolution[]{
  const byKey=new Map<string,FederatedMetadataRecord[]>()
  for(const item of records){
    const key=federationConflictKey(item)
    byKey.set(key,[...(byKey.get(key)??[]),item])
  }
  return [...byKey.entries()].map(([key,items])=>{
    const ordered=[...items].sort((a,b)=>{
      const authorityDelta=authorityPriority[b.authority]-authorityPriority[a.authority]
      if(authorityDelta)return authorityDelta
      const observedA=a.observedAt?Date.parse(a.observedAt):0
      const observedB=b.observedAt?Date.parse(b.observedAt):0
      if(observedB!==observedA)return observedB-observedA
      return a.sourceCatalog.localeCompare(b.sourceCatalog)||a.externalId.localeCompare(b.externalId)
    })
    const selected=ordered[0]
    const alternatives=ordered.slice(1)
    const mergedTags=[...new Set(ordered.flatMap(item=>item.tags))].sort()
    const mergedClassifications=[...new Set(ordered.flatMap(item=>item.classifications))].sort()
    return {
      key,
      selected,
      alternatives,
      reason:alternatives.length
        ? `Selected ${selected.authority} authority from ${selected.sourceCatalog}; lower-priority records remain preserved as provenance.`
        : `Single authoritative record from ${selected.sourceCatalog}.`,
      mergedTags,
      mergedClassifications,
    }
  })
}
