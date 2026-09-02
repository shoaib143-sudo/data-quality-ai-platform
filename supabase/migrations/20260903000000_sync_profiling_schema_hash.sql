-- Keep the persisted dataset-level schema_hash metric aligned with the canonical
-- schema snapshot represented by profiling.profile_columns. The metric engine and
-- the legacy profile snapshot path previously computed schema hashes from
-- different inputs, which could make the same profiling run expose two hashes.

CREATE OR REPLACE FUNCTION profiling.sync_schema_hash_metric()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, profiling
AS $$
DECLARE
  schema_payload text;
BEGIN
  IF NEW.metric_key <> 'schema_hash' OR NEW.profile_column_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(
    json_agg(
      json_build_object(
        'name', pc.column_name,
        'ordinal_position', pc.ordinal_position,
        'source_type', pc.source_type,
        'inferred_type', pc.inferred_type
      )
      ORDER BY pc.ordinal_position NULLS LAST, pc.column_name
    )::text,
    '[]'
  )
  INTO schema_payload
  FROM profiling.profile_columns AS pc
  WHERE pc.profile_run_id = NEW.profile_run_id;

  NEW.numeric_value := NULL;
  NEW.text_value := encode(extensions.digest(schema_payload, 'sha256'), 'hex');
  NEW.boolean_value := NULL;
  NEW.json_value := NULL;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION profiling.sync_schema_hash_metric() FROM PUBLIC;
REVOKE ALL ON FUNCTION profiling.sync_schema_hash_metric() FROM anon;
REVOKE ALL ON FUNCTION profiling.sync_schema_hash_metric() FROM authenticated;
GRANT EXECUTE ON FUNCTION profiling.sync_schema_hash_metric() TO service_role;

DROP TRIGGER IF EXISTS trg_sync_schema_hash_metric ON profiling.profile_metrics;
CREATE TRIGGER trg_sync_schema_hash_metric
BEFORE INSERT OR UPDATE OF metric_key, profile_run_id, profile_column_id, numeric_value, text_value, boolean_value, json_value
ON profiling.profile_metrics
FOR EACH ROW
EXECUTE FUNCTION profiling.sync_schema_hash_metric();

-- Reconcile existing persisted schema_hash metric rows with the canonical
-- profile-column schema. Existing rows are updated only when a schema snapshot
-- exists, preserving historical runs that have no profile columns.
UPDATE profiling.profile_metrics AS pm
SET
  numeric_value = NULL,
  text_value = encode(extensions.digest(schema_payload.payload, 'sha256'), 'hex'),
  boolean_value = NULL,
  json_value = NULL
FROM (
  SELECT
    pc.profile_run_id,
    COALESCE(
      json_agg(
        json_build_object(
          'name', pc.column_name,
          'ordinal_position', pc.ordinal_position,
          'source_type', pc.source_type,
          'inferred_type', pc.inferred_type
        )
        ORDER BY pc.ordinal_position NULLS LAST, pc.column_name
      )::text,
      '[]'
    ) AS payload
  FROM profiling.profile_columns AS pc
  GROUP BY pc.profile_run_id
) AS schema_payload
WHERE pm.profile_run_id = schema_payload.profile_run_id
  AND pm.metric_key = 'schema_hash'
  AND pm.profile_column_id IS NULL;
