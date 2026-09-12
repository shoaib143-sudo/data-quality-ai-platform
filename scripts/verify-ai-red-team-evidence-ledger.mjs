import fs from 'node:fs'
const sql=fs.readFileSync('supabase/migrations/20260912190000_ai_red_team_evidence.sql','utf8')
for(const marker of [
  'governance.ai_red_team_evidence',
  'AI red-team evidence is append-only',
  'record_ai_red_team_evidence',
  "grant select on table governance.ai_red_team_evidence to service_role",
  "revoke all on table governance.ai_red_team_evidence from public, anon, authenticated, service_role",
  'AI system version does not belong to the project',
  'AI red-team evidence requires an exact source commit SHA',
  'AI red-team evidence requires deployment identity',
  'AI red-team evidence requires evidence references',
  'timestamp is unreasonably in the future',
  'ABSTENTION_FAILURE',
  'extensions.digest',
]) if(!sql.includes(marker)) throw new Error('AI red-team evidence ledger missing: '+marker)
if(/grant\s+(insert|update|delete|all).*ai_red_team_evidence.*(authenticated|service_role)/i.test(sql)) throw new Error('Direct AI red-team ledger writes must remain forbidden')
if(/grant\s+execute[^;]*record_ai_red_team_evidence[^;]*(authenticated|anon|public)/i.test(sql)) throw new Error('Red-team recorder must remain service-role only')
console.log('AI red-team evidence ledger verified as append-only, release-bound, and service-authoritative.')
