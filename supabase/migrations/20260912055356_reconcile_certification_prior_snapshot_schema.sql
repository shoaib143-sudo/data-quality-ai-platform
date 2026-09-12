-- Recovery-safe schema reconciliation for certification cancellation snapshots.
-- These columns exist in production from an earlier management-only runtime fix;
-- keep fresh repository reconstruction self-contained without rewriting history.

ALTER TABLE governance.certification_requests
  ADD COLUMN IF NOT EXISTS prior_certification_status text,
  ADD COLUMN IF NOT EXISTS prior_certified_at timestamptz,
  ADD COLUMN IF NOT EXISTS prior_certified_by uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'governance.certification_requests'::regclass
      AND conname = 'certification_requests_prior_certification_status_check'
  ) THEN
    ALTER TABLE governance.certification_requests
      ADD CONSTRAINT certification_requests_prior_certification_status_check
      CHECK (
        prior_certification_status IS NULL
        OR prior_certification_status IN ('UNCERTIFIED','PENDING','CERTIFIED','REJECTED','EXPIRED')
      );
  END IF;
END;
$$;

COMMENT ON COLUMN governance.certification_requests.prior_certification_status IS
  'Certification state captured when a request begins so governed cancellation can restore prior truth.';
COMMENT ON COLUMN governance.certification_requests.prior_certified_at IS
  'Prior certification timestamp captured for rollback-safe certification cancellation.';
COMMENT ON COLUMN governance.certification_requests.prior_certified_by IS
  'Prior certifying actor captured for rollback-safe certification cancellation.';
