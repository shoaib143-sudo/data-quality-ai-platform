import { createAdminClient } from '@/lib/supabase/admin'
import { createSupabaseImmutableLearningArtifactBackend } from './immutable-learning-artifact-storage-adapter'

/** Construct only on the server after the immutable artifact bucket is provisioned. */
export function createSupabaseLearningArtifactBackend() {
  const bucket = process.env.SUPABASE_LEARNING_ARTIFACT_BUCKET?.trim()
  if (!bucket) throw new Error('SUPABASE_LEARNING_ARTIFACT_BUCKET is not configured.')
  return createSupabaseImmutableLearningArtifactBackend(createAdminClient(), bucket)
}
