-- Converge historical Data Quality remediation evidence onto the dedicated
-- verification_profile_run_id column. Older verified outcomes stored the fresh
-- profile ID only in outcome JSON. The join avoids unsafe UUID casts and only
-- backfills IDs that resolve to an authoritative profiling.profile_runs row.

update governance.data_quality_remediation_outcomes as outcome
set verification_profile_run_id = profile.id,
    updated_at = greatest(outcome.updated_at, now())
from profiling.profile_runs as profile
where outcome.verification_profile_run_id is null
  and outcome.outcome ? 'verification_profile_run_id'
  and profile.id::text = outcome.outcome ->> 'verification_profile_run_id';
