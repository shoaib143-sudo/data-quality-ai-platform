import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import postgres from "npm:postgres@3.4.7";

type ConnectorAction = "health" | "credential" | "catalog" | "validate" | "query" | "lineage" | "lineage_scope";
type ConnectorRequest = {
  action?: ConnectorAction;
  jdbc_url?: string;
  credential_ref?: string;
  username?: string;
  password?: string;
  catalog?: string;
  catalogs?: string[];
  schema?: string;
  table?: string;
  limit?: number;
};

type DatabricksTarget = {
  jdbcUrl: string;
  host: string;
  warehouseId: string;
  catalog: string | null;
};

type StatementColumn = { name?: string; type_name?: string; type_text?: string; position?: number };
type StatementPayload = {
  statement_id?: string;
  status?: { state?: string; error?: { message?: string } };
  manifest?: { schema?: { columns?: StatementColumn[] } };
  result?: { data_array?: unknown[][]; next_chunk_internal_link?: string | null };
};

type LineageRow = {
  source_table_full_name?: unknown;
  target_table_full_name?: unknown;
  source_column_name?: unknown;
  target_column_name?: unknown;
  entity_type?: unknown;
  entity_id?: unknown;
  created_by?: unknown;
  event_time?: unknown;
};

const jsonHeaders = { "content-type": "application/json" };
const TECHNICAL_MAX_ROWS = technicalMaxRows();
const MAX_POLL_ATTEMPTS = 30;
const MAX_UC_PAGES = 20;

function technicalMaxRows() {
  const parsed = Number(Deno.env.get("DGP_DATABRICKS_TECHNICAL_MAX_ROWS") ?? "100000");
  if (!Number.isFinite(parsed)) return 100000;
  return Math.min(500000, Math.max(1000, Math.floor(parsed)));
}

function reply(status: number, payload: Record<string, unknown>) {
  return new Response(JSON.stringify(payload), { status, headers: jsonHeaders });
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
  if (!/^[A-Za-z_][A-Za-z0-9_$#@-]*$/.test(value)) throw new Error(field + " contains invalid identifier characters.");
  return value;
}

function optionalIdentifier(value: unknown, field: string) {
  if (typeof value !== "string" || !value.trim()) return null;
  return safeIdentifier(value.trim(), field);
}

function cleanIdentifiers(value: unknown, field: string) {
  if (!Array.isArray(value)) return [] as string[];
  return [...new Set(value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => safeIdentifier(item.trim(), field)))].slice(0, 1000);
}

function internalDatabase() {
  const databaseUrl = Deno.env.get("SUPABASE_DB_URL");
  if (!databaseUrl) throw new Error("Connector credential store is unavailable.");
  return postgres(databaseUrl, { max: 1, prepare: false, connect_timeout: 8, idle_timeout: 2 });
}

function parseDatabricksJdbcUrl(value: string): DatabricksTarget {
  const jdbcUrl = required(value, "jdbc_url");
  if (!jdbcUrl.toLowerCase().startsWith("jdbc:databricks://")) throw new Error("Direct connector supports Databricks JDBC URLs only.");
  if (/(?:[?&;])(?:user(?:name)?|uid|password|passwd|pwd|pass|token|access_token|accesstoken|secret|client_secret)=/i.test(jdbcUrl)) {
    throw new Error("Databricks JDBC URL must not contain embedded credentials.");
  }
  const withoutPrefix = jdbcUrl.slice("jdbc:databricks://".length);
  const slash = withoutPrefix.indexOf("/");
  const authority = slash >= 0 ? withoutPrefix.slice(0, slash) : withoutPrefix.split(";", 1)[0];
  const host = authority.replace(/:\d+$/, "").trim().toLowerCase();
  if (!host || !/^[a-z0-9.-]+$/.test(host)) throw new Error("Databricks JDBC URL has an invalid hostname.");
  const allowedHost = host.endsWith(".azuredatabricks.net") || host.endsWith(".cloud.databricks.com") || host.endsWith(".gcp.databricks.com") || host.endsWith(".databricks.com");
  if (!allowedHost) throw new Error("Databricks connector only permits Databricks workspace hostnames.");
  const httpPath = jdbcUrl.match(/(?:^|;)httpPath=([^;]+)/i)?.[1]?.trim() ?? "";
  const warehouseId = httpPath.match(/\/sql\/1\.0\/warehouses\/([A-Za-z0-9_-]+)/i)?.[1] ?? "";
  if (!warehouseId) throw new Error("Databricks JDBC URL must include a SQL warehouse httpPath.");
  const catalog = jdbcUrl.match(/(?:^|;)ConnCatalog=([^;]+)/i)?.[1]?.trim() ?? null;
  if (catalog) safeIdentifier(catalog, "catalog");
  return { jdbcUrl, host, warehouseId, catalog };
}

async function storeCredential(body: ConnectorRequest) {
  const credentialRef = safeCredentialRef(required(body.credential_ref, "credential_ref"));
  const username = required(body.username, "username");
  const password = required(body.password, "password");
  const secretValue = JSON.stringify({ username, password });
  const db = internalDatabase();
  try {
    const existing = await db.unsafe("select id::text from vault.secrets where name = $1 order by updated_at desc limit 1", [credentialRef]) as Array<{ id: string }>;
    if (existing[0]?.id) {
      await db.unsafe("select vault.update_secret($1::uuid, $2, $3, $4)", [existing[0].id, secretValue, credentialRef, "DataNexus Databricks connector credential"]);
    } else {
      await db.unsafe("select vault.create_secret($1, $2, $3)", [secretValue, credentialRef, "DataNexus Databricks connector credential"]);
    }
    return { configured: true, credential_ref: credentialRef };
  } finally { await db.end({ timeout: 1 }); }
}

async function resolveCredential(credentialRefValue: unknown) {
  const credentialRef = safeCredentialRef(required(credentialRefValue, "credential_ref"));
  const db = internalDatabase();
  try {
    const rows = await db.unsafe("select decrypted_secret from vault.decrypted_secrets where name = $1 order by updated_at desc limit 1", [credentialRef]) as Array<{ decrypted_secret: string }>;
    if (!rows[0]?.decrypted_secret) throw new Error("Connection credentials were not found.");
    const parsed = JSON.parse(rows[0].decrypted_secret) as { username?: unknown; password?: unknown };
    return { username: required(parsed.username, "username"), password: required(parsed.password, "password") };
  } finally { await db.end({ timeout: 1 }); }
}

async function targetContext(body: ConnectorRequest) {
  const target = parseDatabricksJdbcUrl(required(body.jdbc_url, "jdbc_url"));
  const credentials = await resolveCredential(body.credential_ref);
  const catalog = optionalIdentifier(body.catalog, "catalog") ?? target.catalog;
  const schema = optionalIdentifier(body.schema, "schema");
  const table = optionalIdentifier(body.table, "table");
  return { target, token: credentials.password, catalog, schema, table };
}

function databricksUrl(target: DatabricksTarget, path: string) {
  if (!path.startsWith("/api/")) throw new Error("Invalid Databricks API path.");
  return `https://${target.host}${path}`;
}

async function databricksJson(target: DatabricksTarget, token: string, path: string, init?: RequestInit) {
  const response = await fetch(databricksUrl(target, path), {
    ...init,
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) {
    const message = typeof payload.message === "string" ? payload.message : typeof payload.error === "string" ? payload.error : `Databricks returned HTTP ${response.status}.`;
    throw new Error(message);
  }
  return payload;
}

async function pagedUnityCatalog(target: DatabricksTarget, token: string, path: string, field: string) {
  const items: Record<string, unknown>[] = [];
  let pageToken = "";
  for (let page = 0; page < MAX_UC_PAGES; page++) {
    const separator = path.includes("?") ? "&" : "?";
    const withPage = `${path}${separator}max_results=1000${pageToken ? `&page_token=${encodeURIComponent(pageToken)}` : ""}`;
    const payload = await databricksJson(target, token, withPage);
    const batch = Array.isArray(payload[field]) ? payload[field] as Record<string, unknown>[] : [];
    items.push(...batch);
    const next = typeof payload.next_page_token === "string" ? payload.next_page_token.trim() : "";
    if (!next) break;
    pageToken = next;
  }
  return items;
}

function quoteIdentifier(value: string) { return `\`${value.replaceAll("`", "``")}\``; }
function fullTable(catalog: string, schema: string, table: string) { return `${catalog}.${schema}.${table}`; }
function quotedTable(catalog: string, schema: string, table: string) { return `${quoteIdentifier(catalog)}.${quoteIdentifier(schema)}.${quoteIdentifier(table)}`; }
function statementError(payload: StatementPayload) { return payload.status?.error?.message ?? `Databricks SQL statement ended in ${payload.status?.state ?? "UNKNOWN"} state.`; }

async function fetchStatementChunk(target: DatabricksTarget, token: string, internalLink: string) {
  if (!internalLink.startsWith("/api/2.0/sql/statements/")) throw new Error("Databricks returned an invalid statement chunk link.");
  return await databricksJson(target, token, internalLink) as StatementPayload;
}

async function executeSql(target: DatabricksTarget, token: string, statement: string, catalog?: string | null, schema?: string | null) {
  let payload = await databricksJson(target, token, "/api/2.0/sql/statements", {
    method: "POST",
    body: JSON.stringify({
      warehouse_id: target.warehouseId,
      statement,
      ...(catalog ? { catalog } : {}),
      ...(schema ? { schema } : {}),
      format: "JSON_ARRAY",
      disposition: "INLINE",
      wait_timeout: "30s",
      on_wait_timeout: "CONTINUE",
    }),
  }) as StatementPayload;
  const statementId = payload.statement_id;
  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
    const state = payload.status?.state ?? "";
    if (state === "SUCCEEDED") break;
    if (["FAILED", "CANCELED", "CLOSED"].includes(state)) throw new Error(statementError(payload));
    if (!statementId) throw new Error("Databricks did not return a statement identifier.");
    await new Promise((resolve) => setTimeout(resolve, 1000));
    payload = await databricksJson(target, token, `/api/2.0/sql/statements/${encodeURIComponent(statementId)}`) as StatementPayload;
  }
  if (payload.status?.state !== "SUCCEEDED") throw new Error("Databricks SQL statement timed out before completion.");
  const columns = Array.isArray(payload.manifest?.schema?.columns) ? payload.manifest!.schema!.columns! : [];
  const data: unknown[][] = [];
  if (Array.isArray(payload.result?.data_array)) data.push(...payload.result!.data_array!);
  let next = payload.result?.next_chunk_internal_link ?? null;
  let chunkCount = 0;
  while (next && chunkCount < 20) {
    const chunk = await fetchStatementChunk(target, token, next);
    if (Array.isArray(chunk.result?.data_array)) data.push(...chunk.result!.data_array!);
    next = chunk.result?.next_chunk_internal_link ?? null;
    chunkCount += 1;
  }
  return { columns, data, statementId: statementId ?? null };
}

function rowsFromStatement(result: { columns: StatementColumn[]; data: unknown[][] }) {
  const names = result.columns.map((column, index) => typeof column.name === "string" && column.name ? column.name : `column_${index + 1}`);
  return result.data.map((row) => Object.fromEntries(names.map((name, index) => [name, row[index] ?? null])));
}

async function catalog(body: ConnectorRequest) {
  const { target, token, catalog, schema } = await targetContext(body);
  if (!catalog) throw new Error("Databricks Unity Catalog name is required.");
  const schemas = await pagedUnityCatalog(target, token, `/api/2.1/unity-catalog/schemas?catalog_name=${encodeURIComponent(catalog)}`, "schemas");
  const schemaNames = schemas.map((row) => typeof row.name === "string" ? row.name : typeof row.full_name === "string" ? row.full_name.split(".").at(-1) ?? "" : "").filter(Boolean).sort((a, b) => a.localeCompare(b));
  let tables: Record<string, unknown>[] = [];
  if (schema) tables = await pagedUnityCatalog(target, token, `/api/2.1/unity-catalog/tables?catalog_name=${encodeURIComponent(catalog)}&schema_name=${encodeURIComponent(schema)}`, "tables");
  return {
    schemas: schemaNames,
    tables: tables.map((row) => ({
      name: typeof row.name === "string" ? row.name : "",
      type: typeof row.table_type === "string" ? row.table_type : null,
      catalog: typeof row.catalog_name === "string" ? row.catalog_name : catalog,
      schema: typeof row.schema_name === "string" ? row.schema_name : schema,
      remarks: typeof row.comment === "string" ? row.comment : null,
    })).filter((row) => row.name),
    details: { connector: "supabase-edge-databricks", credential_store: "supabase-vault", database_product: "Databricks", catalog, schema, warehouse_id: target.warehouseId, host: target.host },
  };
}

async function tableInfo(target: DatabricksTarget, token: string, catalog: string, schema: string, table: string) {
  return await databricksJson(target, token, `/api/2.1/unity-catalog/tables/${encodeURIComponent(fullTable(catalog, schema, table))}`);
}

function databricksColumns(info: Record<string, unknown>) {
  const columns = Array.isArray(info.columns) ? info.columns as Record<string, unknown>[] : [];
  return columns.map((column) => ({
    name: typeof column.name === "string" ? column.name : "",
    type: typeof column.type_name === "string" ? column.type_name : typeof column.type_text === "string" ? column.type_text : null,
    size: null,
    scale: null,
    nullable: typeof column.nullable === "boolean" ? column.nullable : null,
    defaultValue: typeof column.default_value === "string" ? column.default_value : null,
  })).filter((column) => column.name);
}

async function validate(body: ConnectorRequest) {
  const { target, token, catalog, schema, table } = await targetContext(body);
  if (!catalog || !schema || !table) throw new Error("Databricks catalog, schema, and table are required.");
  const info = await tableInfo(target, token, catalog, schema, table);
  const columns = databricksColumns(info);
  if (!columns.length) throw new Error(`Databricks object ${fullTable(catalog, schema, table)} has no visible columns.`);
  await executeSql(target, token, `SELECT * FROM ${quotedTable(catalog, schema, table)} LIMIT 0`, catalog, schema);
  return { columns, row_count: null, warnings: [], details: { connector: "supabase-edge-databricks", credential_store: "supabase-vault", database_product: "Databricks", catalog, schema, table, table_type: typeof info.table_type === "string" ? info.table_type : null, warehouse_id: target.warehouseId } };
}

async function query(body: ConnectorRequest) {
  const { target, token, catalog, schema, table } = await targetContext(body);
  if (!catalog || !schema || !table) throw new Error("Databricks catalog, schema, and table are required.");
  const requestedLimit = Number(body.limit ?? 1000);
  if (!Number.isInteger(requestedLimit) || requestedLimit < 1) throw new Error("limit must be a positive integer.");
  const limit = Math.min(requestedLimit, TECHNICAL_MAX_ROWS);
  const result = await executeSql(target, token, `SELECT * FROM ${quotedTable(catalog, schema, table)} LIMIT ${limit}`, catalog, schema);
  const rows = rowsFromStatement(result);
  return { rows, row_count: rows.length, columns: result.columns.map((column) => ({ name: column.name ?? "", type: column.type_name ?? column.type_text ?? null })), warnings: requestedLimit > TECHNICAL_MAX_ROWS ? ["Requested rows exceeded the connector technical safety ceiling."] : [] };
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
function textValue(value: unknown) { return typeof value === "string" && value.trim() ? value.trim() : null; }
function tableParts(fullName: string | null) {
  if (!fullName) return null;
  const parts = fullName.split(".").filter(Boolean);
  if (parts.length < 3) return null;
  return { catalog: parts.at(-3)!, schema: parts.at(-2)!, table: parts.at(-1)! };
}

async function transformationsFromRows(columnRows: LineageRow[], tableRows: LineageRow[]) {
  const grouped = new Map<string, {
    source: string;
    target: string;
    entityType: string | null;
    entityId: string | null;
    createdBy: string | null;
    eventTime: string | null;
    mappings: Array<{ sourceAsset: string; sourceColumn: string; targetAsset: string; targetColumn: string; operation: string; expression: null; metadata: Record<string, unknown> }>;
    sourceTable: "system.access.column_lineage" | "system.access.table_lineage";
  }>();
  for (const row of columnRows) {
    const source = textValue(row.source_table_full_name);
    const targetName = textValue(row.target_table_full_name);
    const sourceColumn = textValue(row.source_column_name);
    const targetColumn = textValue(row.target_column_name);
    if (!source || !targetName || !sourceColumn || !targetColumn) continue;
    const entityType = textValue(row.entity_type);
    const entityId = textValue(row.entity_id);
    const createdBy = textValue(row.created_by);
    const eventTime = textValue(row.event_time);
    const key = [source, targetName, entityType ?? "", entityId ?? "", eventTime ?? ""].join("|");
    const current = grouped.get(key) ?? { source, target: targetName, entityType, entityId, createdBy, eventTime, mappings: [], sourceTable: "system.access.column_lineage" as const };
    current.mappings.push({ sourceAsset: source, sourceColumn, targetAsset: targetName, targetColumn, operation: "DATABRICKS_COLUMN_LINEAGE", expression: null, metadata: { authoritative_source: "system.access.column_lineage", entity_type: entityType, entity_id: entityId, created_by: createdBy, event_time: eventTime } });
    grouped.set(key, current);
  }
  for (const row of tableRows) {
    const source = textValue(row.source_table_full_name);
    const targetName = textValue(row.target_table_full_name);
    if (!source || !targetName) continue;
    const entityType = textValue(row.entity_type);
    const entityId = textValue(row.entity_id);
    const createdBy = textValue(row.created_by);
    const eventTime = textValue(row.event_time);
    const key = [source, targetName, entityType ?? "", entityId ?? "", eventTime ?? ""].join("|");
    if (!grouped.has(key)) grouped.set(key, { source, target: targetName, entityType, entityId, createdBy, eventTime, mappings: [], sourceTable: "system.access.table_lineage" });
  }
  const transformations = [] as Record<string, unknown>[];
  for (const [key, event] of grouped) {
    const targetParts = tableParts(event.target);
    if (!targetParts) continue;
    const hashBasis = JSON.stringify({ source: event.source, target: event.target, entityType: event.entityType, entityId: event.entityId, eventTime: event.eventTime, mappings: event.mappings.map((mapping) => [mapping.sourceColumn, mapping.targetColumn]) });
    const logicHash = await sha256(hashBasis);
    transformations.push({
      catalog: targetParts.catalog,
      schema: targetParts.schema,
      name: targetParts.table,
      operation: "DATABRICKS_LINEAGE_EVENT",
      transformationLogic: "",
      logicHash,
      engine: "Databricks",
      sourceAsset: event.source,
      targetAsset: event.target,
      columnMappings: event.mappings,
      metadata: { authoritative_source: event.sourceTable, hash_basis: "DATABRICKS_SYSTEM_LINEAGE_RECORD", source_table_full_name: event.source, target_table_full_name: event.target, entity_type: event.entityType, entity_id: event.entityId, created_by: event.createdBy, event_time: event.eventTime, source_event_key_hash: await sha256(key) },
    });
  }
  return transformations;
}

async function lineage(body: ConnectorRequest) {
  const { target, token, catalog, schema, table } = await targetContext(body);
  if (!catalog || !schema || !table) throw new Error("Databricks catalog, schema, and table are required for lineage discovery.");
  const requestedFullName = fullTable(catalog, schema, table);
  const requestedLiteral = requestedFullName.replaceAll("'", "''");
  const warnings: string[] = [];
  let columnRows: LineageRow[] = [];
  let tableRows: LineageRow[] = [];
  try {
    const result = await executeSql(target, token, `SELECT source_table_full_name, target_table_full_name, source_column_name, target_column_name, entity_type, entity_id, created_by, event_time FROM system.access.column_lineage WHERE source_table_full_name = '${requestedLiteral}' OR target_table_full_name = '${requestedLiteral}' ORDER BY event_time DESC LIMIT 2000`, catalog, schema);
    columnRows = rowsFromStatement(result) as LineageRow[];
  } catch (error) { warnings.push(`Databricks column lineage is unavailable for ${requestedFullName}: ${error instanceof Error ? error.message : "unknown error"}`); }
  try {
    const result = await executeSql(target, token, `SELECT source_table_full_name, target_table_full_name, entity_type, entity_id, created_by, event_time FROM system.access.table_lineage WHERE source_table_full_name = '${requestedLiteral}' OR target_table_full_name = '${requestedLiteral}' ORDER BY event_time DESC LIMIT 2000`, catalog, schema);
    tableRows = rowsFromStatement(result) as LineageRow[];
  } catch (error) { warnings.push(`Databricks table lineage is unavailable for ${requestedFullName}: ${error instanceof Error ? error.message : "unknown error"}`); }
  const transformations = await transformationsFromRows(columnRows, tableRows);
  if (!transformations.length && !warnings.length) warnings.push(`No source-to-target Databricks lineage records were exposed for ${requestedFullName}.`);
  return { databaseProduct: "Databricks", databaseVersion: null, catalog, schema, transformations, warnings, details: { mode: "OBJECT", query_count: 2, complete: warnings.length === 0, truncated: false, authoritative_sources: ["system.access.column_lineage", "system.access.table_lineage"] } };
}

function scopePredicate(catalogs: string[]) {
  return catalogs.map((catalog) => {
    const literal = catalog.toLowerCase().replaceAll("'", "''");
    return `(lower(source_table_full_name) LIKE '${literal}.%' OR lower(target_table_full_name) LIKE '${literal}.%')`;
  }).join(" OR ");
}

async function lineageScope(body: ConnectorRequest) {
  const { target, token } = await targetContext(body);
  const catalogs = cleanIdentifiers(body.catalogs, "catalog");
  if (!catalogs.length) throw new Error("lineage_scope requires at least one Databricks catalog.");
  const predicate = scopePredicate(catalogs);
  const rowLimit = TECHNICAL_MAX_ROWS + 1;
  const warnings: string[] = [];
  let columnRows: LineageRow[] = [];
  let tableRows: LineageRow[] = [];
  try {
    const result = await executeSql(target, token, `SELECT source_table_full_name, target_table_full_name, source_column_name, target_column_name, entity_type, entity_id, created_by, event_time FROM system.access.column_lineage WHERE ${predicate} ORDER BY event_time DESC LIMIT ${rowLimit}`);
    columnRows = rowsFromStatement(result) as LineageRow[];
  } catch (error) {
    warnings.push(`Databricks column lineage is unavailable for scoped catalogs [${catalogs.join(", ")}]: ${error instanceof Error ? error.message : "unknown error"}`);
  }
  try {
    const result = await executeSql(target, token, `SELECT source_table_full_name, target_table_full_name, entity_type, entity_id, created_by, event_time FROM system.access.table_lineage WHERE ${predicate} ORDER BY event_time DESC LIMIT ${rowLimit}`);
    tableRows = rowsFromStatement(result) as LineageRow[];
  } catch (error) {
    warnings.push(`Databricks table lineage is unavailable for scoped catalogs [${catalogs.join(", ")}]: ${error instanceof Error ? error.message : "unknown error"}`);
  }
  const columnTruncated = columnRows.length > TECHNICAL_MAX_ROWS;
  const tableTruncated = tableRows.length > TECHNICAL_MAX_ROWS;
  if (columnTruncated) columnRows = columnRows.slice(0, TECHNICAL_MAX_ROWS);
  if (tableTruncated) tableRows = tableRows.slice(0, TECHNICAL_MAX_ROWS);
  const truncated = columnTruncated || tableTruncated;
  if (truncated) warnings.push(`Databricks scoped lineage reached the connector technical safety ceiling of ${TECHNICAL_MAX_ROWS} rows for at least one authoritative source.`);
  const transformations = await transformationsFromRows(columnRows, tableRows);
  return {
    databaseProduct: "Databricks",
    databaseVersion: null,
    catalog: null,
    schema: null,
    transformations,
    warnings,
    details: {
      mode: "SCOPED_CATALOGS",
      selected_catalogs: catalogs,
      query_count: 2,
      column_row_count: columnRows.length,
      table_row_count: tableRows.length,
      complete: warnings.length === 0 && !truncated,
      truncated,
      authoritative_sources: ["system.access.column_lineage", "system.access.table_lineage"],
    },
  };
}

Deno.serve(async (request: Request) => {
  if (request.method !== "POST") return reply(405, { error: "Method not allowed." });
  try {
    const body = await request.json() as ConnectorRequest;
    if (body.action === "health") return reply(200, { ok: true, drivers: ["databricks"], credential_store: "supabase-vault", metadata_provider: "unity-catalog-rest", query_provider: "statement-execution-api", lineage_provider: ["system.access.table_lineage", "system.access.column_lineage"], lineage_scope: "CATALOG_SET", technical_max_rows: TECHNICAL_MAX_ROWS });
    if (body.action === "credential") return reply(200, await storeCredential(body));
    if (body.action === "catalog") return reply(200, await catalog(body));
    if (body.action === "validate") return reply(200, await validate(body));
    if (body.action === "query") return reply(200, await query(body));
    if (body.action === "lineage") return reply(200, await lineage(body));
    if (body.action === "lineage_scope") return reply(200, await lineageScope(body));
    return reply(400, { error: "Unsupported connector action." });
  } catch (error) {
    return reply(422, { error: error instanceof Error ? error.message : "Databricks connector request failed." });
  }
});