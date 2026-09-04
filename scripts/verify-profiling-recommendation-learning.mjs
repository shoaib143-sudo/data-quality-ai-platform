import { access, readFile } from 'node:fs/promises'
import { constants } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const requiredFiles = [
  'lib/profiling/recommendation-learning.ts',
  'lib/profiling/investigation-engine.ts',
  'app/api/profiling/remediation/route.ts',
  'app/api/profiling/remediation/verify/route.ts',
  'app/api/profiling/recommendations/effectiveness/route.ts',
  'app/workflows/page.tsx',
  'app/workflows/workflow-manager.tsx',
  'supabase/migrations/20260904170300_profiling_recommendation_learning.sql',
]

for (const path of requiredFiles) {
  await access(path, constants.R_OK)
  console.log(`PASS recommendation learning artifact ${path}`)
}

const checks = [
  ['supabase/migrations/20260904170300_profiling_recommendation_learning.sql', /profiling_recommendation_learning[\s\S]*unique\(workflow_instance_id, recommendation_action\)[\s\S]*enable row level security[\s\S]*is_project_member/, 'durable project-scoped recommendation learning registry'],
  ['app/api/profiling/remediation/route.ts', /learningRows[\s\S]*profiling_recommendation_learning[\s\S]*status:\s*'PENDING'/, 'approved remediation seeds learning candidates'],
  ['app/api/profiling/remediation/verify/route.ts', /recommendationEffective[\s\S]*profiling_recommendation_learning[\s\S]*EFFECTIVE[\s\S]*INEFFECTIVE[\s\S]*observed_at/, 'verification resolves recommendation effectiveness'],
  ['lib/profiling/recommendation-learning.ts', /success_rate[\s\S]*average_quality_score_delta[\s\S]*average_high_severity_findings_delta/, 'project recommendation effectiveness aggregation'],
  ['app/api/profiling/recommendations/effectiveness/route.ts', /authorizeProject[\s\S]*quality\.read[\s\S]*loadRecommendationEffectiveness/, 'authorized recommendation effectiveness API'],
  ['lib/profiling/investigation-engine.ts', /investigation_version:\s*'1\.1'[\s\S]*historical_effectiveness[\s\S]*recommendation_learning[\s\S]*advisory evidence only/, 'historical effectiveness feedback into future investigations'],
  ['app/workflows/page.tsx', /profiling_recommendation_learning[\s\S]*learning=/, 'workflow page loads recommendation learning evidence'],
  ['app/workflows/workflow-manager.tsx', /Recommendation effectiveness[\s\S]*successRate[\s\S]*Average quality delta/, 'recommendation effectiveness workflow UI'],
]

for (const [path, pattern, label] of checks) {
  const content = await readFile(path, 'utf8')
  if (!pattern.test(content)) throw new Error(`Profiling recommendation learning contract failed: ${label} is missing from ${path}`)
  console.log(`PASS recommendation learning contract ${label}`)
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (url && serviceRoleKey) {
  const supabase = createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } })
  const { count, error } = await supabase
    .schema('governance')
    .from('profiling_recommendation_learning')
    .select('id', { count: 'exact', head: true })
  if (error) throw new Error(`Live profiling recommendation learning registry is unavailable: ${error.message}`)
  console.log(`PASS live recommendation learning registry -> ${count ?? 0} evidence rows`)
}

console.log('Profiling recommendation learning verification completed.')
