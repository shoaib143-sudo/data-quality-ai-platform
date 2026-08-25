


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "profiling";


ALTER SCHEMA "profiling" OWNER TO "postgres";


CREATE TYPE "profiling"."metric_scope" AS ENUM (
    'DATASET',
    'COLUMN',
    'DISTRIBUTION'
);


ALTER TYPE "profiling"."metric_scope" OWNER TO "postgres";


CREATE TYPE "profiling"."metric_value_type" AS ENUM (
    'NUMBER',
    'STRING',
    'BOOLEAN',
    'JSON'
);


ALTER TYPE "profiling"."metric_value_type" OWNER TO "postgres";


CREATE TYPE "profiling"."run_status" AS ENUM (
    'RUNNING',
    'COMPLETED',
    'PARTIAL',
    'FAILED',
    'CANCELLED'
);


ALTER TYPE "profiling"."run_status" OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "profiling"."metric_definitions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "metric_key" "text" NOT NULL,
    "name" "text" NOT NULL,
    "scope" "profiling"."metric_scope" NOT NULL,
    "value_type" "profiling"."metric_value_type" NOT NULL,
    "description" "text",
    "enabled" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "profiling"."metric_definitions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "profiling"."profile_columns" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "profile_run_id" "uuid" NOT NULL,
    "column_name" "text" NOT NULL,
    "ordinal_position" integer,
    "source_type" "text",
    "inferred_type" "text",
    "semantic_type" "text",
    "nullable" boolean,
    "confidence" numeric,
    "is_candidate_key" boolean DEFAULT false NOT NULL,
    "key_confidence" numeric,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "profile_columns_confidence_check" CHECK ((("confidence" IS NULL) OR (("confidence" >= (0)::numeric) AND ("confidence" <= (1)::numeric)))),
    CONSTRAINT "profile_columns_key_confidence_check" CHECK ((("key_confidence" IS NULL) OR (("key_confidence" >= (0)::numeric) AND ("key_confidence" <= (1)::numeric))))
);


ALTER TABLE "profiling"."profile_columns" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "profiling"."profile_definitions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "version" "text" NOT NULL,
    "definition" "jsonb" NOT NULL,
    "enabled" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "profiling"."profile_definitions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "profiling"."profile_distributions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "profile_run_id" "uuid" NOT NULL,
    "profile_column_id" "uuid" NOT NULL,
    "distribution_type" "text" NOT NULL,
    "distribution" "jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "profiling"."profile_distributions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "profiling"."profile_findings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "profile_run_id" "uuid" NOT NULL,
    "profile_column_id" "uuid",
    "finding_type" "text" NOT NULL,
    "severity" "text" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text" NOT NULL,
    "confidence" numeric,
    "evidence" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "recommendation" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "profile_findings_confidence_check" CHECK ((("confidence" IS NULL) OR (("confidence" >= (0)::numeric) AND ("confidence" <= (1)::numeric))))
);


ALTER TABLE "profiling"."profile_findings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "profiling"."profile_metrics" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "profile_run_id" "uuid" NOT NULL,
    "metric_definition_id" "uuid" NOT NULL,
    "profile_column_id" "uuid",
    "metric_key" "text" NOT NULL,
    "numeric_value" numeric,
    "text_value" "text",
    "boolean_value" boolean,
    "json_value" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "profile_metrics_check" CHECK ((((((("numeric_value" IS NOT NULL))::integer + (("text_value" IS NOT NULL))::integer) + (("boolean_value" IS NOT NULL))::integer) + (("json_value" IS NOT NULL))::integer) <= 1))
);


ALTER TABLE "profiling"."profile_metrics" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "profiling"."profile_runs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "dataset_version_id" "uuid" NOT NULL,
    "agent_run_id" "uuid",
    "profile_definition_id" "uuid",
    "status" "profiling"."run_status" DEFAULT 'RUNNING'::"profiling"."run_status" NOT NULL,
    "engine_name" "text" NOT NULL,
    "engine_version" "text" NOT NULL,
    "sampling_mode" "text",
    "sampling_size" bigint,
    "sampling_rate" numeric,
    "sampling_seed" bigint,
    "row_count" bigint,
    "column_count" integer,
    "duplicate_row_count" bigint,
    "content_hash" "text",
    "schema_hash" "text",
    "configuration_hash" "text",
    "profile_signature" "text",
    "configuration" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "started_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "completed_at" timestamp with time zone,
    CONSTRAINT "profile_runs_column_count_check" CHECK ((("column_count" IS NULL) OR ("column_count" >= 0))),
    CONSTRAINT "profile_runs_duplicate_row_count_check" CHECK ((("duplicate_row_count" IS NULL) OR ("duplicate_row_count" >= 0))),
    CONSTRAINT "profile_runs_row_count_check" CHECK ((("row_count" IS NULL) OR ("row_count" >= 0))),
    CONSTRAINT "profile_runs_sampling_rate_check" CHECK ((("sampling_rate" IS NULL) OR (("sampling_rate" >= (0)::numeric) AND ("sampling_rate" <= (1)::numeric)))),
    CONSTRAINT "profile_runs_sampling_size_check" CHECK ((("sampling_size" IS NULL) OR ("sampling_size" >= 0)))
);


ALTER TABLE "profiling"."profile_runs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "profiling"."schema_snapshots" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "profile_run_id" "uuid" NOT NULL,
    "dataset_version_id" "uuid" NOT NULL,
    "schema_hash" "text" NOT NULL,
    "schema" "jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "profiling"."schema_snapshots" OWNER TO "postgres";


ALTER TABLE ONLY "profiling"."metric_definitions"
    ADD CONSTRAINT "metric_definitions_metric_key_key" UNIQUE ("metric_key");



ALTER TABLE ONLY "profiling"."metric_definitions"
    ADD CONSTRAINT "metric_definitions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "profiling"."profile_columns"
    ADD CONSTRAINT "profile_columns_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "profiling"."profile_columns"
    ADD CONSTRAINT "profile_columns_profile_run_id_column_name_key" UNIQUE ("profile_run_id", "column_name");



ALTER TABLE ONLY "profiling"."profile_definitions"
    ADD CONSTRAINT "profile_definitions_name_version_key" UNIQUE ("name", "version");



ALTER TABLE ONLY "profiling"."profile_definitions"
    ADD CONSTRAINT "profile_definitions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "profiling"."profile_distributions"
    ADD CONSTRAINT "profile_distributions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "profiling"."profile_findings"
    ADD CONSTRAINT "profile_findings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "profiling"."profile_metrics"
    ADD CONSTRAINT "profile_metrics_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "profiling"."profile_runs"
    ADD CONSTRAINT "profile_runs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "profiling"."schema_snapshots"
    ADD CONSTRAINT "schema_snapshots_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "profiling"."schema_snapshots"
    ADD CONSTRAINT "schema_snapshots_profile_run_id_key" UNIQUE ("profile_run_id");



CREATE INDEX "idx_profile_columns_run" ON "profiling"."profile_columns" USING "btree" ("profile_run_id");



CREATE INDEX "idx_profile_distributions_column" ON "profiling"."profile_distributions" USING "btree" ("profile_column_id");



CREATE INDEX "idx_profile_distributions_run" ON "profiling"."profile_distributions" USING "btree" ("profile_run_id");



CREATE INDEX "idx_profile_findings_column" ON "profiling"."profile_findings" USING "btree" ("profile_column_id");



CREATE INDEX "idx_profile_findings_run" ON "profiling"."profile_findings" USING "btree" ("profile_run_id", "severity");



CREATE INDEX "idx_profile_metrics_column" ON "profiling"."profile_metrics" USING "btree" ("profile_column_id");



CREATE INDEX "idx_profile_metrics_definition" ON "profiling"."profile_metrics" USING "btree" ("metric_definition_id");



CREATE INDEX "idx_profile_metrics_run" ON "profiling"."profile_metrics" USING "btree" ("profile_run_id");



CREATE INDEX "idx_profile_runs_agent_run" ON "profiling"."profile_runs" USING "btree" ("agent_run_id");



CREATE INDEX "idx_profile_runs_dataset" ON "profiling"."profile_runs" USING "btree" ("dataset_version_id", "started_at" DESC);



CREATE INDEX "idx_profile_runs_definition" ON "profiling"."profile_runs" USING "btree" ("profile_definition_id");



CREATE INDEX "idx_schema_snapshots_dataset_version" ON "profiling"."schema_snapshots" USING "btree" ("dataset_version_id");



ALTER TABLE ONLY "profiling"."profile_columns"
    ADD CONSTRAINT "profile_columns_profile_run_id_fkey" FOREIGN KEY ("profile_run_id") REFERENCES "profiling"."profile_runs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "profiling"."profile_distributions"
    ADD CONSTRAINT "profile_distributions_profile_column_id_fkey" FOREIGN KEY ("profile_column_id") REFERENCES "profiling"."profile_columns"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "profiling"."profile_distributions"
    ADD CONSTRAINT "profile_distributions_profile_run_id_fkey" FOREIGN KEY ("profile_run_id") REFERENCES "profiling"."profile_runs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "profiling"."profile_findings"
    ADD CONSTRAINT "profile_findings_profile_column_id_fkey" FOREIGN KEY ("profile_column_id") REFERENCES "profiling"."profile_columns"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "profiling"."profile_findings"
    ADD CONSTRAINT "profile_findings_profile_run_id_fkey" FOREIGN KEY ("profile_run_id") REFERENCES "profiling"."profile_runs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "profiling"."profile_metrics"
    ADD CONSTRAINT "profile_metrics_metric_definition_id_fkey" FOREIGN KEY ("metric_definition_id") REFERENCES "profiling"."metric_definitions"("id");



ALTER TABLE ONLY "profiling"."profile_metrics"
    ADD CONSTRAINT "profile_metrics_profile_column_id_fkey" FOREIGN KEY ("profile_column_id") REFERENCES "profiling"."profile_columns"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "profiling"."profile_metrics"
    ADD CONSTRAINT "profile_metrics_profile_run_id_fkey" FOREIGN KEY ("profile_run_id") REFERENCES "profiling"."profile_runs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "profiling"."profile_runs"
    ADD CONSTRAINT "profile_runs_agent_run_id_fkey" FOREIGN KEY ("agent_run_id") REFERENCES "agent"."agent_runs"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "profiling"."profile_runs"
    ADD CONSTRAINT "profile_runs_dataset_version_id_fkey" FOREIGN KEY ("dataset_version_id") REFERENCES "catalog"."dataset_versions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "profiling"."profile_runs"
    ADD CONSTRAINT "profile_runs_profile_definition_id_fkey" FOREIGN KEY ("profile_definition_id") REFERENCES "profiling"."profile_definitions"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "profiling"."schema_snapshots"
    ADD CONSTRAINT "schema_snapshots_dataset_version_id_fkey" FOREIGN KEY ("dataset_version_id") REFERENCES "catalog"."dataset_versions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "profiling"."schema_snapshots"
    ADD CONSTRAINT "schema_snapshots_profile_run_id_fkey" FOREIGN KEY ("profile_run_id") REFERENCES "profiling"."profile_runs"("id") ON DELETE CASCADE;



CREATE POLICY "column_select" ON "profiling"."profile_columns" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM (("profiling"."profile_runs" "r"
     JOIN "catalog"."dataset_versions" "v" ON (("v"."id" = "r"."dataset_version_id")))
     JOIN "catalog"."datasets" "d" ON (("d"."id" = "v"."dataset_id")))
  WHERE (("r"."id" = "profile_columns"."profile_run_id") AND ( SELECT "app_private"."is_project_member"("d"."project_id") AS "is_project_member")))));



CREATE POLICY "distribution_select" ON "profiling"."profile_distributions" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM (("profiling"."profile_runs" "r"
     JOIN "catalog"."dataset_versions" "v" ON (("v"."id" = "r"."dataset_version_id")))
     JOIN "catalog"."datasets" "d" ON (("d"."id" = "v"."dataset_id")))
  WHERE (("r"."id" = "profile_distributions"."profile_run_id") AND ( SELECT "app_private"."is_project_member"("d"."project_id") AS "is_project_member")))));



CREATE POLICY "finding_select" ON "profiling"."profile_findings" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM (("profiling"."profile_runs" "r"
     JOIN "catalog"."dataset_versions" "v" ON (("v"."id" = "r"."dataset_version_id")))
     JOIN "catalog"."datasets" "d" ON (("d"."id" = "v"."dataset_id")))
  WHERE (("r"."id" = "profile_findings"."profile_run_id") AND ( SELECT "app_private"."is_project_member"("d"."project_id") AS "is_project_member")))));



CREATE POLICY "metric_def_select" ON "profiling"."metric_definitions" FOR SELECT TO "authenticated" USING ("enabled");



ALTER TABLE "profiling"."metric_definitions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "metric_select" ON "profiling"."profile_metrics" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM (("profiling"."profile_runs" "r"
     JOIN "catalog"."dataset_versions" "v" ON (("v"."id" = "r"."dataset_version_id")))
     JOIN "catalog"."datasets" "d" ON (("d"."id" = "v"."dataset_id")))
  WHERE (("r"."id" = "profile_metrics"."profile_run_id") AND ( SELECT "app_private"."is_project_member"("d"."project_id") AS "is_project_member")))));



ALTER TABLE "profiling"."profile_columns" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "profile_def_select" ON "profiling"."profile_definitions" FOR SELECT TO "authenticated" USING ("enabled");



ALTER TABLE "profiling"."profile_definitions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "profiling"."profile_distributions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "profiling"."profile_findings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "profiling"."profile_metrics" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "profile_run_select" ON "profiling"."profile_runs" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("catalog"."dataset_versions" "v"
     JOIN "catalog"."datasets" "d" ON (("d"."id" = "v"."dataset_id")))
  WHERE (("v"."id" = "profile_runs"."dataset_version_id") AND ( SELECT "app_private"."is_project_member"("d"."project_id") AS "is_project_member")))));



ALTER TABLE "profiling"."profile_runs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "schema_select" ON "profiling"."schema_snapshots" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("catalog"."dataset_versions" "v"
     JOIN "catalog"."datasets" "d" ON (("d"."id" = "v"."dataset_id")))
  WHERE (("v"."id" = "schema_snapshots"."dataset_version_id") AND ( SELECT "app_private"."is_project_member"("d"."project_id") AS "is_project_member")))));



ALTER TABLE "profiling"."schema_snapshots" ENABLE ROW LEVEL SECURITY;


GRANT USAGE ON SCHEMA "profiling" TO "authenticated";
GRANT USAGE ON SCHEMA "profiling" TO "service_role";



GRANT SELECT ON TABLE "profiling"."metric_definitions" TO "authenticated";
GRANT ALL ON TABLE "profiling"."metric_definitions" TO "service_role";



GRANT SELECT ON TABLE "profiling"."profile_columns" TO "authenticated";
GRANT ALL ON TABLE "profiling"."profile_columns" TO "service_role";



GRANT SELECT ON TABLE "profiling"."profile_definitions" TO "authenticated";
GRANT ALL ON TABLE "profiling"."profile_definitions" TO "service_role";



GRANT SELECT ON TABLE "profiling"."profile_distributions" TO "authenticated";
GRANT ALL ON TABLE "profiling"."profile_distributions" TO "service_role";



GRANT SELECT ON TABLE "profiling"."profile_findings" TO "authenticated";
GRANT ALL ON TABLE "profiling"."profile_findings" TO "service_role";



GRANT SELECT ON TABLE "profiling"."profile_metrics" TO "authenticated";
GRANT ALL ON TABLE "profiling"."profile_metrics" TO "service_role";



GRANT SELECT ON TABLE "profiling"."profile_runs" TO "authenticated";
GRANT ALL ON TABLE "profiling"."profile_runs" TO "service_role";



GRANT SELECT ON TABLE "profiling"."schema_snapshots" TO "authenticated";
GRANT ALL ON TABLE "profiling"."schema_snapshots" TO "service_role";




