


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


CREATE SCHEMA IF NOT EXISTS "app";


ALTER SCHEMA "app" OWNER TO "postgres";


CREATE TYPE "app"."member_role" AS ENUM (
    'OWNER',
    'ADMIN',
    'MEMBER',
    'VIEWER'
);


ALTER TYPE "app"."member_role" OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "app"."organization_members" (
    "organization_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role" "app"."member_role" DEFAULT 'MEMBER'::"app"."member_role" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "app"."organization_members" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "app"."organizations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "slug" "text" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "app"."organizations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "app"."projects" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "slug" "text" NOT NULL,
    "description" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "app"."projects" OWNER TO "postgres";


ALTER TABLE ONLY "app"."organization_members"
    ADD CONSTRAINT "organization_members_pkey" PRIMARY KEY ("organization_id", "user_id");



ALTER TABLE ONLY "app"."organizations"
    ADD CONSTRAINT "organizations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "app"."organizations"
    ADD CONSTRAINT "organizations_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "app"."projects"
    ADD CONSTRAINT "projects_organization_id_slug_key" UNIQUE ("organization_id", "slug");



ALTER TABLE ONLY "app"."projects"
    ADD CONSTRAINT "projects_pkey" PRIMARY KEY ("id");



CREATE INDEX "idx_org_members_user" ON "app"."organization_members" USING "btree" ("user_id");



CREATE INDEX "idx_projects_org" ON "app"."projects" USING "btree" ("organization_id");



CREATE OR REPLACE TRIGGER "trg_org_updated_at" BEFORE UPDATE ON "app"."organizations" FOR EACH ROW EXECUTE FUNCTION "app_private"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_project_updated_at" BEFORE UPDATE ON "app"."projects" FOR EACH ROW EXECUTE FUNCTION "app_private"."set_updated_at"();



ALTER TABLE ONLY "app"."organization_members"
    ADD CONSTRAINT "organization_members_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "app"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "app"."organization_members"
    ADD CONSTRAINT "organization_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "app"."projects"
    ADD CONSTRAINT "projects_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "app"."organizations"("id") ON DELETE CASCADE;



CREATE POLICY "member_delete" ON "app"."organization_members" FOR DELETE TO "authenticated" USING (( SELECT "app_private"."is_org_admin"("organization_members"."organization_id") AS "is_org_admin"));



CREATE POLICY "member_insert" ON "app"."organization_members" FOR INSERT TO "authenticated" WITH CHECK (( SELECT "app_private"."is_org_admin"("organization_members"."organization_id") AS "is_org_admin"));



CREATE POLICY "member_select" ON "app"."organization_members" FOR SELECT TO "authenticated" USING (( SELECT "app_private"."is_org_member"("organization_members"."organization_id") AS "is_org_member"));



CREATE POLICY "member_update" ON "app"."organization_members" FOR UPDATE TO "authenticated" USING (( SELECT "app_private"."is_org_admin"("organization_members"."organization_id") AS "is_org_admin")) WITH CHECK (( SELECT "app_private"."is_org_admin"("organization_members"."organization_id") AS "is_org_admin"));



CREATE POLICY "org_select" ON "app"."organizations" FOR SELECT TO "authenticated" USING (( SELECT "app_private"."is_org_member"("organizations"."id") AS "is_org_member"));



CREATE POLICY "org_update" ON "app"."organizations" FOR UPDATE TO "authenticated" USING (( SELECT "app_private"."is_org_admin"("organizations"."id") AS "is_org_admin")) WITH CHECK (( SELECT "app_private"."is_org_admin"("organizations"."id") AS "is_org_admin"));



ALTER TABLE "app"."organization_members" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "app"."organizations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "project_delete" ON "app"."projects" FOR DELETE TO "authenticated" USING (( SELECT "app_private"."is_org_admin"("projects"."organization_id") AS "is_org_admin"));



CREATE POLICY "project_insert" ON "app"."projects" FOR INSERT TO "authenticated" WITH CHECK (( SELECT "app_private"."is_org_admin"("projects"."organization_id") AS "is_org_admin"));



CREATE POLICY "project_select" ON "app"."projects" FOR SELECT TO "authenticated" USING (( SELECT "app_private"."is_org_member"("projects"."organization_id") AS "is_org_member"));



CREATE POLICY "project_update" ON "app"."projects" FOR UPDATE TO "authenticated" USING (( SELECT "app_private"."is_org_admin"("projects"."organization_id") AS "is_org_admin")) WITH CHECK (( SELECT "app_private"."is_org_admin"("projects"."organization_id") AS "is_org_admin"));



ALTER TABLE "app"."projects" ENABLE ROW LEVEL SECURITY;


GRANT USAGE ON SCHEMA "app" TO "authenticated";
GRANT USAGE ON SCHEMA "app" TO "service_role";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "app"."organization_members" TO "authenticated";
GRANT ALL ON TABLE "app"."organization_members" TO "service_role";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "app"."organizations" TO "authenticated";
GRANT ALL ON TABLE "app"."organizations" TO "service_role";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "app"."projects" TO "authenticated";
GRANT ALL ON TABLE "app"."projects" TO "service_role";




