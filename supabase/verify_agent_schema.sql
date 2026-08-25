


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


CREATE SCHEMA IF NOT EXISTS "agent";


ALTER SCHEMA "agent" OWNER TO "postgres";


CREATE TYPE "agent"."message_status" AS ENUM (
    'PENDING',
    'DELIVERED',
    'PROCESSED',
    'FAILED'
);


ALTER TYPE "agent"."message_status" OWNER TO "postgres";


CREATE TYPE "agent"."run_status" AS ENUM (
    'CREATED',
    'QUEUED',
    'RUNNING',
    'WAITING',
    'COMPLETED',
    'PARTIAL',
    'FAILED',
    'CANCELLED'
);


ALTER TYPE "agent"."run_status" OWNER TO "postgres";


CREATE TYPE "agent"."step_status" AS ENUM (
    'PENDING',
    'RUNNING',
    'COMPLETED',
    'FAILED',
    'SKIPPED',
    'RETRYING'
);


ALTER TYPE "agent"."step_status" OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "agent"."agent_artifacts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "agent_run_id" "uuid" NOT NULL,
    "artifact_type" "text" NOT NULL,
    "artifact_version" "text" DEFAULT '1.0'::"text" NOT NULL,
    "name" "text",
    "payload" "jsonb",
    "storage_uri" "text",
    "content_hash" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "agent_artifacts_check" CHECK ((("payload" IS NOT NULL) OR ("storage_uri" IS NOT NULL)))
);


ALTER TABLE "agent"."agent_artifacts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "agent"."agent_definitions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "agent_key" "text" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "version" "text" NOT NULL,
    "system_prompt" "text" NOT NULL,
    "configuration" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "enabled" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "agent"."agent_definitions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "agent"."agent_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "source_agent_run_id" "uuid",
    "target_agent_run_id" "uuid",
    "message_type" "text" NOT NULL,
    "correlation_id" "uuid" NOT NULL,
    "payload" "jsonb" NOT NULL,
    "status" "agent"."message_status" DEFAULT 'PENDING'::"agent"."message_status" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "delivered_at" timestamp with time zone,
    "processed_at" timestamp with time zone
);


ALTER TABLE "agent"."agent_messages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "agent"."agent_run_steps" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "agent_run_id" "uuid" NOT NULL,
    "step_name" "text" NOT NULL,
    "step_order" integer NOT NULL,
    "status" "agent"."step_status" DEFAULT 'PENDING'::"agent"."step_status" NOT NULL,
    "attempt" integer DEFAULT 1 NOT NULL,
    "input" "jsonb",
    "output" "jsonb",
    "started_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "error_code" "text",
    "error_message" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "agent_run_steps_attempt_check" CHECK (("attempt" >= 1))
);


ALTER TABLE "agent"."agent_run_steps" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "agent"."agent_runs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "agent_definition_id" "uuid" NOT NULL,
    "project_id" "uuid" NOT NULL,
    "dataset_id" "uuid",
    "dataset_version_id" "uuid",
    "parent_run_id" "uuid",
    "correlation_id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "status" "agent"."run_status" DEFAULT 'CREATED'::"agent"."run_status" NOT NULL,
    "input" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "output" "jsonb",
    "error_code" "text",
    "error_message" "text",
    "started_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "agent"."agent_runs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "agent"."tool_definitions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "agent_definition_id" "uuid" NOT NULL,
    "tool_key" "text" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text" NOT NULL,
    "version" "text" DEFAULT '1.0'::"text" NOT NULL,
    "input_schema" "jsonb" NOT NULL,
    "output_schema" "jsonb" NOT NULL,
    "execution_config" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "enabled" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "agent"."tool_definitions" OWNER TO "postgres";


ALTER TABLE ONLY "agent"."agent_artifacts"
    ADD CONSTRAINT "agent_artifacts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "agent"."agent_definitions"
    ADD CONSTRAINT "agent_definitions_agent_key_version_key" UNIQUE ("agent_key", "version");



ALTER TABLE ONLY "agent"."agent_definitions"
    ADD CONSTRAINT "agent_definitions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "agent"."agent_messages"
    ADD CONSTRAINT "agent_messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "agent"."agent_run_steps"
    ADD CONSTRAINT "agent_run_steps_agent_run_id_step_order_key" UNIQUE ("agent_run_id", "step_order");



ALTER TABLE ONLY "agent"."agent_run_steps"
    ADD CONSTRAINT "agent_run_steps_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "agent"."agent_runs"
    ADD CONSTRAINT "agent_runs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "agent"."tool_definitions"
    ADD CONSTRAINT "tool_definitions_agent_definition_id_tool_key_version_key" UNIQUE ("agent_definition_id", "tool_key", "version");



ALTER TABLE ONLY "agent"."tool_definitions"
    ADD CONSTRAINT "tool_definitions_pkey" PRIMARY KEY ("id");



CREATE INDEX "agent_messages_correlation_idx" ON "agent"."agent_messages" USING "btree" ("correlation_id", "created_at" DESC);



CREATE INDEX "agent_run_steps_run_order_idx" ON "agent"."agent_run_steps" USING "btree" ("agent_run_id", "step_order");



CREATE INDEX "agent_runs_dataset_idx" ON "agent"."agent_runs" USING "btree" ("dataset_id", "created_at" DESC);



CREATE INDEX "agent_runs_dataset_version_idx" ON "agent"."agent_runs" USING "btree" ("dataset_version_id", "created_at" DESC);



CREATE INDEX "agent_runs_project_created_idx" ON "agent"."agent_runs" USING "btree" ("project_id", "created_at" DESC);



CREATE INDEX "agent_runs_project_status_idx" ON "agent"."agent_runs" USING "btree" ("project_id", "status", "created_at" DESC);



CREATE INDEX "idx_agent_artifacts_run" ON "agent"."agent_artifacts" USING "btree" ("agent_run_id", "created_at");



CREATE INDEX "idx_agent_messages_source_run" ON "agent"."agent_messages" USING "btree" ("source_agent_run_id");



CREATE INDEX "idx_agent_messages_target" ON "agent"."agent_messages" USING "btree" ("target_agent_run_id", "status", "created_at");



CREATE INDEX "idx_agent_runs_agent_definition" ON "agent"."agent_runs" USING "btree" ("agent_definition_id");



CREATE INDEX "idx_agent_runs_dataset" ON "agent"."agent_runs" USING "btree" ("dataset_id", "created_at" DESC);



CREATE INDEX "idx_agent_runs_dataset_version" ON "agent"."agent_runs" USING "btree" ("dataset_version_id");



CREATE INDEX "idx_agent_runs_parent_run" ON "agent"."agent_runs" USING "btree" ("parent_run_id");



CREATE INDEX "idx_agent_runs_project" ON "agent"."agent_runs" USING "btree" ("project_id", "created_at" DESC);



CREATE INDEX "idx_agent_steps_run" ON "agent"."agent_run_steps" USING "btree" ("agent_run_id", "step_order");



CREATE INDEX "tool_definitions_agent_enabled_idx" ON "agent"."tool_definitions" USING "btree" ("agent_definition_id", "enabled", "tool_key");



ALTER TABLE ONLY "agent"."agent_artifacts"
    ADD CONSTRAINT "agent_artifacts_agent_run_id_fkey" FOREIGN KEY ("agent_run_id") REFERENCES "agent"."agent_runs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "agent"."agent_messages"
    ADD CONSTRAINT "agent_messages_source_agent_run_id_fkey" FOREIGN KEY ("source_agent_run_id") REFERENCES "agent"."agent_runs"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "agent"."agent_messages"
    ADD CONSTRAINT "agent_messages_target_agent_run_id_fkey" FOREIGN KEY ("target_agent_run_id") REFERENCES "agent"."agent_runs"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "agent"."agent_run_steps"
    ADD CONSTRAINT "agent_run_steps_agent_run_id_fkey" FOREIGN KEY ("agent_run_id") REFERENCES "agent"."agent_runs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "agent"."agent_runs"
    ADD CONSTRAINT "agent_runs_agent_definition_id_fkey" FOREIGN KEY ("agent_definition_id") REFERENCES "agent"."agent_definitions"("id");



ALTER TABLE ONLY "agent"."agent_runs"
    ADD CONSTRAINT "agent_runs_dataset_id_fkey" FOREIGN KEY ("dataset_id") REFERENCES "catalog"."datasets"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "agent"."agent_runs"
    ADD CONSTRAINT "agent_runs_dataset_version_id_fkey" FOREIGN KEY ("dataset_version_id") REFERENCES "catalog"."dataset_versions"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "agent"."agent_runs"
    ADD CONSTRAINT "agent_runs_parent_run_id_fkey" FOREIGN KEY ("parent_run_id") REFERENCES "agent"."agent_runs"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "agent"."agent_runs"
    ADD CONSTRAINT "agent_runs_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "app"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "agent"."tool_definitions"
    ADD CONSTRAINT "tool_definitions_agent_definition_id_fkey" FOREIGN KEY ("agent_definition_id") REFERENCES "agent"."agent_definitions"("id") ON DELETE CASCADE;



ALTER TABLE "agent"."agent_artifacts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "agent_def_select" ON "agent"."agent_definitions" FOR SELECT TO "authenticated" USING ("enabled");



ALTER TABLE "agent"."agent_definitions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "agent"."agent_messages" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "agent_msg_select" ON "agent"."agent_messages" FOR SELECT TO "authenticated" USING (((("target_agent_run_id" IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM "agent"."agent_runs" "r"
  WHERE (("r"."id" = "agent_messages"."target_agent_run_id") AND ( SELECT "app_private"."is_project_member"("r"."project_id") AS "is_project_member"))))) OR (("source_agent_run_id" IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM "agent"."agent_runs" "r"
  WHERE (("r"."id" = "agent_messages"."source_agent_run_id") AND ( SELECT "app_private"."is_project_member"("r"."project_id") AS "is_project_member")))))));



CREATE POLICY "agent_run_select" ON "agent"."agent_runs" FOR SELECT TO "authenticated" USING (( SELECT "app_private"."is_project_member"("agent_runs"."project_id") AS "is_project_member"));



ALTER TABLE "agent"."agent_run_steps" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "agent"."agent_runs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "agent_step_select" ON "agent"."agent_run_steps" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "agent"."agent_runs" "r"
  WHERE (("r"."id" = "agent_run_steps"."agent_run_id") AND ( SELECT "app_private"."is_project_member"("r"."project_id") AS "is_project_member")))));



CREATE POLICY "artifact_select" ON "agent"."agent_artifacts" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "agent"."agent_runs" "r"
  WHERE (("r"."id" = "agent_artifacts"."agent_run_id") AND ( SELECT "app_private"."is_project_member"("r"."project_id") AS "is_project_member")))));



CREATE POLICY "tool_def_select" ON "agent"."tool_definitions" FOR SELECT TO "authenticated" USING ("enabled");



ALTER TABLE "agent"."tool_definitions" ENABLE ROW LEVEL SECURITY;


GRANT USAGE ON SCHEMA "agent" TO "authenticated";
GRANT USAGE ON SCHEMA "agent" TO "service_role";



GRANT SELECT ON TABLE "agent"."agent_artifacts" TO "authenticated";
GRANT ALL ON TABLE "agent"."agent_artifacts" TO "service_role";



GRANT SELECT ON TABLE "agent"."agent_definitions" TO "authenticated";
GRANT ALL ON TABLE "agent"."agent_definitions" TO "service_role";



GRANT SELECT ON TABLE "agent"."agent_messages" TO "authenticated";
GRANT ALL ON TABLE "agent"."agent_messages" TO "service_role";



GRANT SELECT ON TABLE "agent"."agent_run_steps" TO "authenticated";
GRANT ALL ON TABLE "agent"."agent_run_steps" TO "service_role";



GRANT SELECT ON TABLE "agent"."agent_runs" TO "authenticated";
GRANT ALL ON TABLE "agent"."agent_runs" TO "service_role";



GRANT SELECT ON TABLE "agent"."tool_definitions" TO "authenticated";
GRANT ALL ON TABLE "agent"."tool_definitions" TO "service_role";




