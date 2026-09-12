-- Reconcile the certification RPC source contract with the authoritative
-- app.organization_members schema. The membership table has no is_active
-- column; membership validity is represented by row presence plus role/capability
-- checks at the governed workflow boundary.

CREATE OR REPLACE FUNCTION governance.request_dataset_certification(
  p_project_id uuid,
  p_dataset_id uuid,
  p_actor_user_id uuid,
  p_assigned_to uuid DEFAULT NULL,
  p_evidence jsonb DEFAULT '{}'::jsonb
)
RETURNS governance.certification_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'governance', 'catalog', 'app'
AS $$
DECLARE
  v_request governance.certification_requests%ROWTYPE;
  v_organization_id uuid;
  v_prior_status text := 'UNCERTIFIED';
  v_prior_certified_at timestamptz;
  v_prior_certified_by uuid;
BEGIN
  IF NOT governance.has_project_capability(p_project_id, p_actor_user_id, 'certification.request') THEN
    RAISE EXCEPTION 'Actor is not authorized to request certification for this project.' USING errcode = '42501';
  END IF;

  SELECT p.organization_id INTO v_organization_id
  FROM app.projects p
  WHERE p.id = p_project_id;
  IF v_organization_id IS NULL THEN
    RAISE EXCEPTION 'Project was not found.' USING errcode = 'P0002';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM catalog.datasets d
    WHERE d.id = p_dataset_id AND d.project_id = p_project_id
  ) THEN
    RAISE EXCEPTION 'Dataset does not belong to the requested project.' USING errcode = '23503';
  END IF;

  IF p_assigned_to IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM app.organization_members om
    WHERE om.organization_id = v_organization_id
      AND om.user_id = p_assigned_to
  ) THEN
    RAISE EXCEPTION 'Assigned reviewer is not a member of the project organization.' USING errcode = '23503';
  END IF;

  IF EXISTS (
    SELECT 1 FROM governance.certification_requests cr
    WHERE cr.dataset_id = p_dataset_id AND cr.status IN ('PENDING','IN_REVIEW')
  ) THEN
    RAISE EXCEPTION 'An active certification request already exists for this dataset.' USING errcode = '23505';
  END IF;

  SELECT dc.certification_status, dc.certified_at, dc.certified_by
    INTO v_prior_status, v_prior_certified_at, v_prior_certified_by
  FROM governance.dataset_catalog dc
  WHERE dc.dataset_id = p_dataset_id;
  IF NOT FOUND THEN
    v_prior_status := 'UNCERTIFIED';
    v_prior_certified_at := NULL;
    v_prior_certified_by := NULL;
  END IF;

  INSERT INTO governance.certification_requests (
    project_id, dataset_id, requested_by, assigned_to, status, evidence,
    prior_certification_status, prior_certified_at, prior_certified_by
  ) VALUES (
    p_project_id, p_dataset_id, p_actor_user_id, p_assigned_to, 'PENDING', COALESCE(p_evidence, '{}'::jsonb),
    v_prior_status, v_prior_certified_at, v_prior_certified_by
  ) RETURNING * INTO v_request;

  INSERT INTO governance.dataset_catalog (dataset_id, project_id, certification_status, updated_at)
  VALUES (p_dataset_id, p_project_id, 'PENDING', now())
  ON CONFLICT (dataset_id) DO UPDATE
    SET project_id = excluded.project_id,
        certification_status = 'PENDING',
        certified_at = NULL,
        certified_by = NULL,
        updated_at = now();

  RETURN v_request;
END;
$$;

CREATE OR REPLACE FUNCTION governance.review_dataset_certification(
  p_request_id uuid,
  p_actor_user_id uuid,
  p_status text,
  p_decision_notes text DEFAULT NULL,
  p_assigned_to uuid DEFAULT NULL
)
RETURNS governance.certification_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'governance', 'catalog', 'app'
AS $$
DECLARE
  v_request governance.certification_requests%ROWTYPE;
  v_target_status text := upper(COALESCE(p_status, ''));
  v_organization_id uuid;
  v_decided_at timestamptz;
  v_catalog_status text;
  v_catalog_certified_at timestamptz;
  v_catalog_certified_by uuid;
BEGIN
  SELECT * INTO v_request
  FROM governance.certification_requests
  WHERE id = p_request_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Certification request was not found.' USING errcode = 'P0002';
  END IF;

  IF NOT governance.has_project_capability(v_request.project_id, p_actor_user_id, 'certification.review') THEN
    RAISE EXCEPTION 'Actor is not authorized to review certification for this project.' USING errcode = '42501';
  END IF;

  IF v_target_status NOT IN ('IN_REVIEW','APPROVED','REJECTED','CANCELLED') THEN
    RAISE EXCEPTION 'Invalid certification status.' USING errcode = '22023';
  END IF;

  IF NOT (
    (v_request.status = 'PENDING' AND v_target_status IN ('IN_REVIEW','CANCELLED')) OR
    (v_request.status = 'IN_REVIEW' AND v_target_status IN ('APPROVED','REJECTED','CANCELLED'))
  ) THEN
    RAISE EXCEPTION 'Certification cannot transition from % to %.', v_request.status, v_target_status USING errcode = '23514';
  END IF;

  SELECT p.organization_id INTO v_organization_id
  FROM app.projects p
  WHERE p.id = v_request.project_id;
  IF v_organization_id IS NULL THEN
    RAISE EXCEPTION 'Project was not found.' USING errcode = 'P0002';
  END IF;

  IF p_assigned_to IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM app.organization_members om
    WHERE om.organization_id = v_organization_id
      AND om.user_id = p_assigned_to
  ) THEN
    RAISE EXCEPTION 'Assigned reviewer is not a member of the project organization.' USING errcode = '23503';
  END IF;

  IF v_target_status = 'APPROVED' AND COALESCE(v_request.evidence, '{}'::jsonb) = '{}'::jsonb THEN
    RAISE EXCEPTION 'Certification approval requires evidence.' USING errcode = '23514';
  END IF;

  v_decided_at := CASE WHEN v_target_status IN ('APPROVED','REJECTED','CANCELLED') THEN now() ELSE NULL END;

  UPDATE governance.certification_requests
  SET status = v_target_status,
      decision_notes = p_decision_notes,
      assigned_to = COALESCE(p_assigned_to, assigned_to),
      decided_at = v_decided_at
  WHERE id = p_request_id
  RETURNING * INTO v_request;

  IF v_target_status IN ('APPROVED','REJECTED','CANCELLED') THEN
    IF v_target_status = 'APPROVED' THEN
      v_catalog_status := 'CERTIFIED';
      v_catalog_certified_at := v_decided_at;
      v_catalog_certified_by := p_actor_user_id;
    ELSIF v_target_status = 'REJECTED' THEN
      v_catalog_status := 'REJECTED';
      v_catalog_certified_at := NULL;
      v_catalog_certified_by := NULL;
    ELSE
      v_catalog_status := COALESCE(v_request.prior_certification_status, 'UNCERTIFIED');
      v_catalog_certified_at := v_request.prior_certified_at;
      v_catalog_certified_by := v_request.prior_certified_by;
    END IF;

    INSERT INTO governance.dataset_catalog (
      dataset_id, project_id, certification_status, certified_at, certified_by, updated_at
    ) VALUES (
      v_request.dataset_id, v_request.project_id, v_catalog_status,
      v_catalog_certified_at, v_catalog_certified_by, now()
    )
    ON CONFLICT (dataset_id) DO UPDATE
      SET project_id = excluded.project_id,
          certification_status = excluded.certification_status,
          certified_at = excluded.certified_at,
          certified_by = excluded.certified_by,
          updated_at = excluded.updated_at;
  END IF;

  RETURN v_request;
END;
$$;

REVOKE ALL ON FUNCTION governance.request_dataset_certification(uuid,uuid,uuid,uuid,jsonb) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION governance.review_dataset_certification(uuid,uuid,text,text,uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION governance.request_dataset_certification(uuid,uuid,uuid,uuid,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION governance.review_dataset_certification(uuid,uuid,text,text,uuid) TO service_role;

COMMENT ON FUNCTION governance.request_dataset_certification(uuid,uuid,uuid,uuid,jsonb) IS
  'Service-only governed certification request entrypoint. Revalidates actor capability, dataset ownership, reviewer organization membership, and active-request uniqueness.';
COMMENT ON FUNCTION governance.review_dataset_certification(uuid,uuid,text,text,uuid) IS
  'Service-only governed certification review entrypoint. Revalidates reviewer capability, state transitions, evidence, and reviewer organization membership before catalog certification mutation.';
