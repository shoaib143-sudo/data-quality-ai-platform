import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import postgres from "npm:postgres@3.4.7";

type ConnectorAction = "health" | "credential" | "catalog" | "validate" | "query" | "lineage";
type ConnectorRequest = {
  action?: ConnectorAction;
  jdbc_url?: string;
  credential_ref?: string;
  username?: string;
  password?: string;
  schema?: string;
  table?: string;
  limit?: number;
};

const jsonHeaders = { "content-type": "application/json" };
const TECHNICAL_MAX_ROWS = technicalMaxRows();

function technicalMaxRows() {
  const parsed = Number(Deno.env.get("DGP_POSTGRES_TECHNICAL_MAX_ROWS") ?? "100000");
  if (!Number.isFinite(parsed)) return 100000;
  return Math.min(500000, Math.max(1000, Math.floor(parsed)));
}

function reply(status: number, payload: Record<string, unknown>) {
  return new Response(
    JSON.stringify(payload, (_key, value) => typeof value === "bigint" ? value.toString() : value),
    { status, headers: jsonHeaders },
  );
}

function required(value: unknown, field: string) {
  if (typeof value !== "string" || !value.trim()) throw new Error(field + " is required.");
  return value.trim();
}

function safeCredentialRef(value: string) {
  if (!/^DGP_[A-Za-z0-9_]+$/.test(value)) throw new Error("Invalid credential reference.");
  return value;
}

function safeIdentifier(value: string, field: string) {
  if (!/^[A-Za-z_][A-Za-z0-9_$]*$/.test(value)) throw new Error(field + " contains invalid identifier characters.");
  return value;
}

function internalDatabase() {
  const databaseUrl = Deno.env.get("SUPABASE_DB_URL");
  if (!databaseUrl) throw new Error("Connector credential store is unavailable.");
  return postgres(databaseUrl, { max: 1, prepare: false, connect_timeout: 8, idle_timeout: 2 });
}

function parsePostgresJdbcUrl(value: string) {
  const jdbcUrl = required(value, "jdbc_url");
  if (!jdbcUrl.toLowerCase().startsWith("jdbc:postgresql://")) throw new Error("Direct connector supports PostgreSQL JDBC URLs only.");
  const parsed = new URL(jdbcUrl.slice(5));
  if (parsed.username || parsed.password) throw new Error("JDBC URL must not contain embedded credentials.");
  const database = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
  if (!parsed.hostname || !database) throw new Error("PostgreSQL JDBC URL must include host and database.");
  return { host: parsed.hostname, port: Number(parsed.port || "5432"), database };
}

async function storeCredential(body: ConnectorRequest) {
  const credentialRef = safeCredentialRef(required(body.credential_ref, "credential_ref"));
  const username = required(body.username, "username");
  const password = required(body.password, "password");
  const secretValue = JSON.stringify({ username, password });
  const db = internalDatabase();
  try {
    const existing = await db.unsafe(
      "select id::text from vault.secrets where name = $1 order by updated_at desc limit 1",
      [credentialRef],
    ) as Array<{ id: string }>;
    if (existing[0]?.id) {
      await db.unsafe("select vault.update_secret($1::uuid, $2, $3, $4)", [existing[0].id, secretValue, credentialRef, "DataNexus PostgreSQL connector credential"]);
    } else {
      await db.unsafe("select vault.create_secret($1, $2, $3)", [secretValue, credentialRef, "DataNexus PostgreSQL connector credential"]);
    }
    return { configured: true, credential_ref: credentialRef };
  } finally { await db.end({ timeout: 1 }); }
}

async function resolveCredential(credentialRefValue: unknown) {
  const credentialRef = safeCredentialRef(required(credentialRefValue, "credential_ref"));
  const db = internalDatabase();
  try {
    const rows = await db.unsafe(
      "select decrypted_secret from vault.decrypted_secrets where name = $1 order by updated_at desc limit 1",
      [credentialRef],
    ) as Array<{ decrypted_secret: string }>;
    if (!rows[0]?.decrypted_secret) throw new Error("Connection credentials were not found.");
    const parsed = JSON.parse(rows[0].decrypted_secret) as { username?: unknown; password?: unknown };
    return { username: required(parsed.username, "username"), password: required(parsed.password, "password") };
  } finally { await db.end({ timeout: 1 }); }
}

function targetDatabase(jdbcUrl: string, username: string, password: string) {
  const target = parsePostgresJdbcUrl(jdbcUrl);
  return postgres({ ...target, username, password, ssl: "require", max: 1, prepare: false, connect_timeout: 8, idle_timeout: 2 });
}

async function targetContext(body: ConnectorRequest) {
  const jdbcUrl = required(body.jdbc_url, "jdbc_url");
  const credentials = await resolveCredential(body.credential_ref);
  return { jdbcUrl, db: targetDatabase(jdbcUrl, credentials.username, credentials.password) };
}

async function catalog(body: ConnectorRequest) {
  const { db } = await targetContext(body);
  try {
    const schema = typeof body.schema === "string" && body.schema.trim() ? safeIdentifier(body.schema.trim(), "schema") : undefined;
    const [serverRows, schemaRows] = await Promise.all([
      db.unsafe("select version() as version, current_database() as database"),
      db.unsafe("select schema_name as name from information_schema.schemata where schema_name <> 'information_schema' and schema_name not like 'pg_%' order by schema_name"),
    ]) as [Array<{ version: string; database: string }>, Array<{ name: string }>];
    const tableRows = schema
      ? await db.unsafe("select table_name as name, table_type as type, table_schema as schema from information_schema.tables where table_schema = $1 order by table_name", [schema]) as Array<{ name: string; type: string; schema: string }>
      : [];
    return {
      schemas: schemaRows.map((row) => row.name),
      tables: tableRows,
      details: {
        connector: "supabase-edge-postgres",
        credential_store: "supabase-vault",
        database_product: "PostgreSQL",
        database_version: serverRows[0]?.version ?? null,
        catalog: serverRows[0]?.database ?? null,
        schema: schema ?? null,
      },
    };
  } finally { await db.end({ timeout: 1 }); }
}

async function validate(body: ConnectorRequest) {
  const schema = safeIdentifier(required(body.schema, "schema"), "schema");
  const table = safeIdentifier(required(body.table, "table"), "table");
  const { db } = await targetContext(body);
  try {
    const columns = await db.unsafe(
      "select column_name as name, data_type as type, character_maximum_length as size, numeric_scale as scale, (is_nullable='YES') as nullable, column_default as \"defaultValue\" from information_schema.columns where table_schema = $1 and table_name = $2 order by ordinal_position",
      [schema, table],
    ) as Array<Record<string, unknown>>;
    if (!columns.length) throw new Error("Table or view " + schema + "." + table + " was not found or is not accessible.");
    await db.unsafe('select * from "' + schema + '"."' + table + '" limit 0');
    return { columns, row_count: null, warnings: [], details: { connector: "supabase-edge-postgres", credential_store: "supabase-vault", database_product: "PostgreSQL", schema } };
  } finally { await db.end({ timeout: 1 }); }
}

async function query(body: ConnectorRequest) {
  const schema = safeIdentifier(required(body.schema, "schema"), "schema");
  const table = safeIdentifier(required(body.table, "table"), "table");
  const requestedLimit = Number(body.limit ?? 1000);
  if (!Number.isInteger(requestedLimit) || requestedLimit < 1) throw new Error("limit must be a positive integer.");
  const limit = Math.min(requestedLimit, TECHNICAL_MAX_ROWS);
  const { db } = await targetContext(body);
  try {
    const columns = await db.unsafe(
      "select column_name as name, data_type as type, character_maximum_length as size, numeric_scale as scale, (is_nullable='YES') as nullable, column_default as \"defaultValue\" from information_schema.columns where table_schema = $1 and table_name = $2 order by ordinal_position",
      [schema, table],
    ) as Array<Record<string, unknown>>;
    if (!columns.length) throw new Error("Table or view " + schema + "." + table + " was not found or is not accessible.");
    const rows = await db.unsafe('select * from "' + schema + '"."' + table + '" limit ' + limit);
    return {
      rows,
      row_count: rows.length,
      columns,
      warnings: requestedLimit > TECHNICAL_MAX_ROWS ? ["Requested rows exceeded the connector technical safety ceiling."] : [],
    };
  } finally { await db.end({ timeout: 1 }); }
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function lineage(body: ConnectorRequest) {
  const schema = safeIdentifier(required(body.schema, "schema"), "schema");
  const table = typeof body.table === "string" && body.table.trim() ? safeIdentifier(body.table.trim(), "table") : null;
  const { db } = await targetContext(body);
  try {
    const databaseRows = await db.unsafe("select current_database() as database, version() as version") as Array<{ database: string; version: string }>;
    const viewRows = await db.unsafe(
      "select schemaname as schema, viewname as name, 'VIEW'::text as operation, definition as logic from pg_views where schemaname=$1 and ($2::text is null or viewname=$2) union all select schemaname as schema, matviewname as name, 'MATERIALIZED_VIEW'::text as operation, definition as logic from pg_matviews where schemaname=$1 and ($2::text is null or matviewname=$2) order by name",
      [schema, table],
    ) as Array<{ schema: string; name: string; operation: string; logic: string }>;
    const transformations = await Promise.all(viewRows.map(async (row) => ({
      catalog: databaseRows[0]?.database ?? null,
      schema: row.schema,
      name: row.name,
      operation: row.operation,
      transformationLogic: row.logic,
      logicHash: await sha256(row.logic),
      engine: "PostgreSQL",
    })));
    return {
      databaseProduct: "PostgreSQL",
      databaseVersion: databaseRows[0]?.version ?? null,
      catalog: databaseRows[0]?.database ?? null,
      schema,
      transformations,
      warnings: transformations.length ? [] : ["No readable view or materialized-view transformation definition was found for the requested object."],
    };
  } finally { await db.end({ timeout: 1 }); }
}

Deno.serve(async (request: Request) => {
  if (request.method !== "POST") return reply(405, { error: "Method not allowed." });
  try {
    const body = await request.json() as ConnectorRequest;
    if (body.action === "health") return reply(200, { ok: true, drivers: ["postgresql"], credential_store: "supabase-vault", technical_max_rows: TECHNICAL_MAX_ROWS });
    if (body.action === "credential") return reply(200, await storeCredential(body));
    if (body.action === "catalog") return reply(200, await catalog(body));
    if (body.action === "validate") return reply(200, await validate(body));
    if (body.action === "query") return reply(200, await query(body));
    if (body.action === "lineage") return reply(200, await lineage(body));
    return reply(400, { error: "Unsupported connector action." });
  } catch (error) {
    return reply(422, { error: error instanceof Error ? error.message : "Connector request failed." });
  }
});
