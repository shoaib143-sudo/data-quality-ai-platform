import { CANONICAL_GOVERNANCE_SCHEMA_VERSION } from '../../canonical/model.ts'
import { INFORMATICA_PROVIDER_VERSION } from './manifest.ts'
import type { ProviderCompatibilityProfile } from '../compatibility.ts'

export const informaticaCompatibility:ProviderCompatibilityProfile={
 provider:'informatica',
 apiFamily:'Informatica Data Governance and Catalog public REST API',
 documentedRelease:'November 2025',
 adapterVersion:INFORMATICA_PROVIDER_VERSION,
 canonicalSchemaVersion:CANONICAL_GOVERNANCE_SCHEMA_VERSION,
 status:'DOCUMENTED_NOT_LIVE_VERIFIED',
 documentedCapabilities:[
  {capability:'catalog.asset.read',operations:['READ'],status:'ENABLED',source:'Informatica public REST API documentation',notes:['Endpoint path remains tenant configured until live conformance verification.']},
  {capability:'catalog.business_asset.create',operations:['CREATE'],status:'DOCUMENTED_NOT_ENABLED',source:'Informatica Cloud Services November 2025 What’s New',notes:['Manage Assets API supports creating all business assets.']},
  {capability:'catalog.asset.relationship.update',operations:['UPDATE'],status:'DOCUMENTED_NOT_ENABLED',source:'Informatica Cloud Services November 2025 What’s New',notes:['Relationships can be created by PATCH update; legacy Manage Relationships API is being deprecated.']},
 ],
}
