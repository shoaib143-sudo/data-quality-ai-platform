-- Keep profile_runs, schema_snapshots, and the persisted schema_hash metric on
-- the same canonical schema representation.

CREATE OR REPLACE FUNCTION profiling.sync_profile_schema_hash()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, profiling
AS $$
DECLARE
  v_run_id uuid;
  v_schema_payload text;
  v_schema_hash text;
BEGIN
  v_run_id := COALESCE(NEW.profile_run_id, OLD.profile_run_id);

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
  INTO v_schema_payload
  FROM profiling.profile_columns AS pc
  WHERE pc.profile_run_id = v_run_id;

  v_schema_hash := encode(extensions.digest(v_schema_payload, 'sha256'), 'hex');

  UPDATE profiling.profile_runs AS pr
  SET schema_hash = v_schema_hash
  WHERE pr.id = v_run_id;

  UPDATE profiling.schema_snapshots AS ss
  SET schema_hash = v_schema_hash
  WHERE ss.profile_run_id = v_run_id;

  UPDATE profiling.profile_metrics AS pm
  SET
    numeric_value = NULL,
    text_value = v_schema_hash,
    boolean_value = NULL,
    json_value = NULL
  WHERE pm.profile_run_id = v_run_id
    AND pm.metric_key = 'schema_hash'
    AND pm.profile_column_id IS NULL;

  RETURN COALESCE(NEW, OLD);
END;
$$;

REVOKE ALL ON FUNCTION profiling.sync_profile_schema_hash() FROM PUBLIC;
REVOKE ALL ON FUNCTION profiling.sync_profile_schema_hash() FROM anon;
REVOKE ALL ON FUNCTION profiling.sync_profile_schema_hash() FROM authenticated;
GRANT EXECUTE ON FUNCTION profiling.sync_profile_schema_hash() TO service_role;

DROP TRIGGER IF EXISTS trg_sync_profile_schema_hash ON profiling.profile_columns;
CREATE TRIGGER trg_sync_profile_schema_hash
AFTER INSERT OR UPDATE OF profile_run_id, column_name, ordinal_position, source_type, inferred_type OR DELETE
ON profiling.profile_columns
FOR EACH ROW
EXECUTE FUNCTION profiling.sync_profile_schema_hash();

-- Reconcile existing runs that already have canonical profile columns.
WITH canonical AS (
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
), hashes AS (
  SELECT profile_run_id, encode(extensions.digest(payload, 'sha256'), 'hex') AS schema_hash
  FROM canonical
)
UPDATE profiling.profile_runs AS pr
SET schema_hash = hashes.schema_hash
FROM hashes
WHERE pr.id = hashes.profile_run_id;

WITH canonical AS (
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
), hashes AS (
  SELECT profile_run_id, encode(extensions.digest(payload, 'sha256'), 'hex') AS schema_hash
  FROM canonical
)
UPDATE profiling.schema_snapshots AS ss
SET schema_hash = hashes.schema_hash
FROM hashes
WHERE ss.profile_run_id = hashes.profile_run_id;

WITH canonical AS (
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
), hashes AS (
  SELECT profile_run_id, encode(extensions.digest(payload, 'sha256'), 'hex') AS schema_hash
  FROM canonical
)
UPDATE profiling.profile_metrics AS pm
SET
  numeric_value = NULL,
  text_value = hashes.schema_hash,
  boolean_value = NULL,
  json_value = NULL
FROM hashes
WHERE pm.profile_run_id = hashes.profile_run_id
  AND pm.metric_key = 'schema_hash'
  AND pm.profile_column_id IS NULL;
