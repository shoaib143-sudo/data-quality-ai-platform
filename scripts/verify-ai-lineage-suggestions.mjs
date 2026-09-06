import fs from 'node:fs'

const migrationFiles=[
  'supabase/migrations/20260906090000_govern_ai_lineage_suggestions.sql',
  'supabase/migrations/20260906090100_govern_ai_lineage_promotion.sql',
  'supabase/migrations/20260906090200_fix_ai_lineage_architect_agent_key.sql',
  'supabase/migrations/20260906090300_fix_ai_lineage_promotion_row_assignment.sql',
  'supabase/migrations/20260906090400_reapply_ai_lineage_promotion_expanded_rows.sql',
]
const migration=migrationFiles.map(path=>fs.readFileSync(path,'utf8')).join('\n')
const finalPromotion=fs.readFileSync('supabase/migrations/20260906090400_reapply_ai_lineage_promotion_expanded_rows.sql','utf8')
const route=fs.readFileSync('app/api/lineage/suggestions/route.ts','utf8')
const workspace=fs.readFileSync('app/lineage/ai-lineage-suggestions.tsx','utf8')
const page=fs.readFileSync('app/lineage/suggestions/page.tsx','utf8')
const all=`${migration}\n${route}\n${workspace}\n${page}`.toLowerCase()

function requireText(needle,label){if(!all.includes(needle.toLowerCase()))throw new Error(`AI lineage suggestion contract missing: ${label}`)}
function requireMigration(needle,label){if(!migration.toLowerCase().includes(needle.toLowerCase()))throw new Error(`AI lineage migration missing: ${label}`)}
function requireFinalPromotion(needle,label){if(!finalPromotion.toLowerCase().includes(needle.toLowerCase()))throw new Error(`AI lineage final promotion migration missing: ${label}`)}

for(const [needle,label] of [
  ["'lineage'::text",'LINEAGE suggestion type'],
  ["when 'lineage' then 'lineage.manage'",'lineage.manage human review capability'],
  ['governance.generate_ai_lineage_suggestions','metadata inference generator'],
  ["d.agent_key='architect_agent'",'canonical enabled architect agent key'],
  ['metadata-lineage-heuristics-v1','pinned inference model'],
  ["'metadata_only',true",'metadata-only evidence'],
  ["'observed_lineage',false",'not-observed evidence boundary'],
  ["'source_authoritative_lineage',false",'source authority not claimed'],
  ["'authority','suggestion_only'",'suggestion-only authority'],
  ['no_automatic_lineage_mutation','no automatic mutation effect'],
  ['governance.promote_ai_lineage_suggestion','separate explicit promotion action'],
  ["'human_confirmed',true",'human-confirmed promotion'],
  ['human_confirmed_ai_inferred','promoted evidence origin'],
  ['governance.verify_ai_lineage_suggestion_posture','production posture verifier'],
  ["'module_3_blocker_cleared',false",'Module #3 blocker retained'],
])requireMigration(needle,label)

for(const [needle,label] of [
  ['select s.* into v_s','expanded AI suggestion row assignment'],
  ['select a.* into v_source','expanded source catalog row assignment'],
  ['select a.* into v_target','expanded target catalog row assignment'],
  ['select la.* into v_existing_source','expanded source lineage row assignment'],
  ['select la.* into v_existing_target','expanded target lineage row assignment'],
])requireFinalPromotion(needle,label)

for(const fn of ['generate_ai_lineage_suggestions(uuid,uuid,uuid,integer)','promote_ai_lineage_suggestion(uuid,uuid)','verify_ai_lineage_suggestion_posture(uuid)']){
  requireMigration(`revoke all on function governance.${fn} from public,anon,authenticated`,`${fn} browser execute revoked`)
  requireMigration(`grant execute on function governance.${fn} to service_role`,`${fn} service-only execution`)
}

requireText("action==='generate'",'authenticated generation API')
requireText("action==='review'",'human review API')
requireText("action==='promote'",'separate promotion API')
requireText("p_capability:'lineage.read'",'read authorization before suggestion listing')
requireText('createadminclient','server-side service boundary')
requireText('AI-assisted lineage suggestions','review workspace')
requireText('Required human review note','explicit review evidence')
requireText('Promote as human-confirmed dependency','separate promotion UI')
requireText('REAL_FIELD_LINEAGE_DATA_NOT_INGESTED','real lineage blocker preserved in UI')
requireText('USE SCHEMA','exact Databricks external permission remains visible')

if(/observed_lineage['"]?\s*[:,]\s*true/i.test(all))throw new Error('AI lineage suggestion implementation must never label inferred lineage as observed.')
if(/module_3_blocker_cleared['"]?\s*[:,]\s*true/i.test(all))throw new Error('AI lineage suggestions must not clear Module #3.')
if(/select\s+(?:s|a|la)\s+into\s+v_(?:s|source|target|existing_source|existing_target)/i.test(finalPromotion))throw new Error('Final AI lineage promotion function must use alias.* expansion for PL/pgSQL row variables.')

console.log('AI lineage suggestion truth boundary verified.')
