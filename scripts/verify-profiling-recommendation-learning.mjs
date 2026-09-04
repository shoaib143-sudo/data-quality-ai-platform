import { access, readFile } from 'node:fs/promises'
import { constants } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const requiredFiles = [
  'lib/profiling/recommendation-learning.ts',
  'lib/profiling/investigation-engine.ts',
  'lib/profiling/remediation-verification.ts',
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
  ['app/api/profiling/remediation/route.ts', /learningRows/, 'remediation learning candidate construction'],
  ['app/api/profiling/remediation/route.ts', /status:\s*'PENDING'/, 'pending recommendation learning state'],
  ['app/api/profiling/remediation/route.ts', /profiling_recommendation_learning[\s\S]*insert\(learningRows/, 'approved remediation learning persistence'],
  ['app/api/profiling/remediation/route.ts', /existingOutcome[\s\S]*reusedOutcome:\s*true/, 'repeat remediation preserves existing outcome'],
  ['app/api/profiling/remediation/route.ts', /existingLearning[\s\S]*recommendation_action/, 'repeat remediation preserves measured learning evidence'],
  ['app/api/profiling/remediation/verify/route.ts', /verifyRemediationOutcome/, 'verification API delegates to shared learning-aware evaluator'],
  ['lib/profiling/remediation-verification.ts', /recommendationEffective[\s\S]*profiling_recommendation_learning/, 'verification learning resolution path'],
  ['lib/profiling/remediation-verification.ts', /status:\s*recommendationEffective\s*\?\s*'EFFECTIVE'\s*:\s*'INEFFECTIVE'/, 'effective and ineffective recommendation outcome states'],
  ['lib/profiling/remediation-verification.ts', /updated_at:\s*observedAt[\s\S]*observed_at:\s*observedAt/, 'recommendation outcome observation timestamp'],
  ['lib/profiling/recommendation-learning.ts', /success_rate[\s\S]*average_quality_score_delta[\s\S]*average_high_severity_findings_delta/, 'project recommendation effectiveness aggregation'],
  ['app/api/profiling/recommendations/effectiveness/route.ts', /authorizeProject[\s\S]*quality\.read[\s\S]*loadRecommendationEffectiveness/, 'authorized recommendation effectiveness API'],
  ['lib/profiling/investigation-engine.ts', /investigation_version:\s*'1\.1'/, 'learning-aware investigation version'],
  ['lib/profiling/investigation-engine.ts', /historical_effectiveness/, 'historical recommendation effectiveness annotation'],
  ['lib/profiling/investigation-engine.ts', /recommendation_learning/, 'recommendation learning investigation context'],
  ['lib/profiling/investigation-engine.ts', /advisory evidence only/, 'recommendation learning approval boundary'],
  ['app/workflows/page.tsx', /profiling_recommendation_learning[\s\S]*learning=/, 'workflow page loads recommendation learning evidence'],
  ['app/workflows/workflow-manager.tsx', /Recommendation effectiveness/, 'recommendation effectiveness workflow section'],
  ['app/workflows/workflow-manager.tsx', /successRate/, 'recommendation success rate display'],
  ['app/workflows/workflow-manager.tsx', /Average quality delta/, 'recommendation quality delta display'],
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
