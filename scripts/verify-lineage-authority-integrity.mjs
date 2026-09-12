import fs from 'node:fs'

const sql=fs.readFileSync('supabase/migrations/20260912064000_lineage_authority_classes.sql','utf8')
const required=[
  'authority_state text',
  'origin text',
  "'SOURCE_OBSERVED'",
  "'HUMAN_CONFIRMED'",
  "'LEGACY_UNCLASSIFIED'",
  "'AI_INFERRED'",
  'governance.enforce_lineage_edge_authority()',
  "metadata ? 'ai_suggestion_id'",
  "metadata->>'human_confirmed'",
  "metadata->>'auto_discovered'",
  'Lineage edge lacks governed authority evidence',
  'Lineage authority classification is immutable',
  'Lineage metadata cannot reclassify an existing authority boundary',
  'v_authority <> old.authority_state or v_origin <> old.origin',
  'create or replace view governance.authoritative_lineage_edges',
  "where authority_state in ('SOURCE_OBSERVED','HUMAN_CONFIRMED')",
  'governance.verify_lineage_authority_posture(p_project_id uuid)',
  "origin='AI_INFERRED' and authority_state<>'HUMAN_CONFIRMED'"
]
for(const marker of required){
  if(!sql.includes(marker)) throw new Error('Lineage authority contract missing: '+marker)
}
if(/where authority_state in \('SOURCE_OBSERVED','HUMAN_CONFIRMED','LEGACY_UNCLASSIFIED'\)/.test(sql)){
  throw new Error('Legacy unclassified lineage must not enter authoritative impact projection')
}
console.log('Lineage authority classes verified: observed, human-confirmed, and AI-inferred origin remain distinct; metadata cannot reclassify an established authority boundary.')
