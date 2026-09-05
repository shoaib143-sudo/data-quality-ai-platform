import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import postgres from "npm:postgres@3.4.7";

type RequestBody = {
  jdbc_url?: string;
  credential_ref?: string;
  roots_only?: boolean;
  catalogs?: string[];
};
type NodeKind = "ROOT" | "CATALOG" | "DATABASE" | "SCHEMA" | "OBJECT" | "FIELD" | "NAMESPACE";
type HierarchyNode = {
  id: string;
  parentId: string | null;
  kind: NodeKind;
  nativeType: string;
  name: string;
  qualifiedName: string;
  selectable: boolean;
  hasChildren: boolean;
  nativeId?: string | null;
  catalog?: string | null;
  schema?: string | null;
  object?: string | null;
  objectType?: string | null;
  dataType?: string | null;
  ordinal?: number | null;
  system?: boolean;
  metadata?: Record<string, unknown>;
};

const MAX_NODES = Math.min(250000, Math.max(1000, Number(Deno.env.get("DGP_NATIVE_HIERARCHY_MAX_NODES") ?? "50000") || 50000));
const MAX_UC_PAGES = Math.min(200, Math.max(1, Number(Deno.env.get("DGP_NATIVE_HIERARCHY_MAX_UC_PAGES") ?? "40") || 40));
const jsonHeaders = { "content-type": "application/json" };

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
function cleanCatalogs(value: unknown) {
  return Array.isArray(value)
    ? [...new Set(value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim()))].slice(0, 1000)
    : [];
}
function nodeId(kind: NodeKind, qualifiedName: string) {
  return `${kind.toLowerCase()}:${encodeURIComponent(qualifiedName)}`;
}
function systemName(value: string | null | undefined) {
  const normalized = String(value ?? "").toLowerCase();
  return normalized === "information_schema" || normalized === "pg_catalog" || normalized === "mysql" || normalized === "performance_schema" || normalized === "sys" || normalized === "system" || normalized.startsWith("pg_toast");
}
function stableId(row: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}
function addNode(nodes: HierarchyNode[], input: Omit<HierarchyNode, "id">) {
  if (nodes.length >= MAX_NODES) return null;
  const node = { ...input, id: nodeId(input.kind, input.qualifiedName) };
  nodes.push(node);
  return node.id;
}
function internalDatabase() {
  const databaseUrl = Deno.env.get("SUPABASE_DB_URL");
  if (!databaseUrl) throw new Error("Connector credential store is unavailable.");
  return postgres(databaseUrl, { max: 1, prepare: false, connect_timeout: 8, idle_timeout: 2 });
}
async function resolveCredential(value: unknown) {
  const credentialRef = safeCredentialRef(required(value, "credential_ref"));
  const db = internalDatabase();
  try {
    const rows = await db.unsafe("select decrypted_secret from vault.decrypted_secrets where name = $1 order by updated_at desc limit 1", [credentialRef]) as Array<{ decrypted_secret: string }>;
    if (!rows[0]?.decrypted_secret) throw new Error("Connection credentials were not found.");
    const parsed = JSON.parse(rows[0].decrypted_secret) as { username?: unknown; password?: unknown };
    return { username: required(parsed.username, "username"), password: required(parsed.password, "password") };
  } finally { await db.end({ timeout: 1 }); }
}

function parsePostgresJdbcUrl(value: string) {
  if (!value.toLowerCase().startsWith("jdbc:postgresql://")) throw new Error("Not a PostgreSQL JDBC URL.");
  const parsed = new URL(value.slice(5));
  if (parsed.username || parsed.password) throw new Error("JDBC URL must not contain embedded credentials.");
  const database = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
  if (!parsed.hostname || !database) throw new Error("PostgreSQL JDBC URL must include host and database.");
  return { host: parsed.hostname, port: Number(parsed.port || "5432"), database };
}

async function postgresHierarchy(jdbcUrl: string, credentials: { username: string; password: string }) {
  const target = parsePostgresJdbcUrl(jdbcUrl);
  const db = postgres({ ...target, username: credentials.username, password: credentials.password, ssl: "require", max: 1, prepare: false, connect_timeout: 8, idle_timeout: 2 });
  const nodes: HierarchyNode[] = [];
  const warnings: string[] = [];
  try {
    const [serverRows, schemaRows, objectRows, columnRows] = await Promise.all([
      db.unsafe("select current_database() as database, version() as version"),
      db.unsafe("select oid::text as id, nspname as name from pg_namespace order by nspname"),
      db.unsafe("select c.oid::text as id, n.nspname as schema, c.relname as name, c.relkind as relkind from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relkind in ('r','p','v','m','f','S') order by n.nspname,c.relname"),
      db.unsafe("select c.oid::text as object_id, n.nspname as schema, c.relname as object, a.attname as name, format_type(a.atttypid,a.atttypmod) as data_type, a.attnum as ordinal, not a.attnotnull as nullable from pg_attribute a join pg_class c on c.oid=a.attrelid join pg_namespace n on n.oid=c.relnamespace where a.attnum>0 and not a.attisdropped and c.relkind in ('r','p','v','m','f') order by n.nspname,c.relname,a.attnum"),
    ]) as [Array<{database:string;version:string}>, Array<{id:string;name:string}>, Array<{id:string;schema:string;name:string;relkind:string}>, Array<{object_id:string;schema:string;object:string;name:string;data_type:string;ordinal:number;nullable:boolean}>];
    const database = serverRows[0]?.database ?? target.database;
    const rootId = addNode(nodes, { parentId: null, kind: "ROOT", nativeType: "DATABASE", name: database, qualifiedName: database, selectable: false, hasChildren: true, nativeId: null, system: false, metadata: { host: target.host } })!;
    const schemaIds = new Map<string,string>();
    for (const schema of schemaRows) {
      const id = addNode(nodes, { parentId: rootId, kind: "SCHEMA", nativeType: "SCHEMA", name: schema.name, qualifiedName: schema.name, selectable: true, hasChildren: true, nativeId: schema.id, schema: schema.name, system: systemName(schema.name), metadata: { oid: schema.id } });
      if (id) schemaIds.set(schema.name, id);
    }
    const objectIds = new Map<string,string>();
    const typeFor = (kind: string) => ({ r: "TABLE", p: "PARTITIONED TABLE", v: "VIEW", m: "MATERIALIZED VIEW", f: "FOREIGN TABLE", S: "SEQUENCE" } as Record<string,string>)[kind] ?? kind;
    for (const object of objectRows) {
      const parentId = schemaIds.get(object.schema);
      if (!parentId) continue;
      const qualified = `${object.schema}.${object.name}`;
      const id = addNode(nodes, { parentId, kind: "OBJECT", nativeType: typeFor(object.relkind), name: object.name, qualifiedName: qualified, selectable: true, hasChildren: object.relkind !== "S", nativeId: object.id, schema: object.schema, object: object.name, objectType: typeFor(object.relkind), system: systemName(object.schema), metadata: { oid: object.id, relkind: object.relkind } });
      if (id) objectIds.set(qualified, id);
    }
    for (const column of columnRows) {
      const parentId = objectIds.get(`${column.schema}.${column.object}`);
      if (!parentId) continue;
      addNode(nodes, { parentId, kind: "FIELD", nativeType: "COLUMN", name: column.name, qualifiedName: `${column.schema}.${column.object}.${column.name}`, selectable: true, hasChildren: false, nativeId: null, schema: column.schema, object: column.object, dataType: column.data_type, ordinal: Number(column.ordinal), system: systemName(column.schema), metadata: { nullable: column.nullable, object_oid: column.object_id, attnum: Number(column.ordinal), parent_native_id: column.object_id, identity_evidence: "DERIVED_LOCATOR" } });
    }
    const truncated = nodes.length >= MAX_NODES;
    if (truncated) warnings.push(`Native hierarchy reached the connector safety ceiling of ${MAX_NODES} nodes.`);
    return {
      databaseProduct: "PostgreSQL",
      databaseVersion: serverRows[0]?.version ?? null,
      terms: { root: "database", catalog: null, schema: "schema", object: "object", field: "column" },
      nodes,
      rootIds: [rootId],
      warnings,
      truncated,
      details: {
        connector: "supabase-edge-native-hierarchy",
        credential_store: "supabase-vault",
        database,
        host: target.host,
        max_nodes: MAX_NODES,
        capabilities: {
          stable_object_ids: true,
          stable_field_ids: false,
          field_metadata: true,
          partitioning: "DATABASE",
          resumable_partitions: false,
          provider_snapshot: false,
          authoritative_full_listing: true,
          deletion_evidence: "CONFIRMED_ABSENCE",
        },
      },
    };
  } finally { await db.end({ timeout: 1 }); }
}

type DatabricksTarget = { host: string; warehouseId: string };
function parseDatabricksJdbcUrl(value: string): DatabricksTarget {
  if (!value.toLowerCase().startsWith("jdbc:databricks://")) throw new Error("Not a Databricks JDBC URL.");
  if (/(?:[?&;])(?:user(?:name)?|uid|password|passwd|pwd|pass|token|access_token|accesstoken|secret|client_secret)=/i.test(value)) throw new Error("Databricks JDBC URL must not contain embedded credentials.");
  const withoutPrefix = value.slice("jdbc:databricks://".length);
  const slash = withoutPrefix.indexOf("/");
  const authority = slash >= 0 ? withoutPrefix.slice(0, slash) : withoutPrefix.split(";", 1)[0];
  const host = authority.replace(/:\d+$/, "").trim().toLowerCase();
  const allowedHost = host.endsWith(".azuredatabricks.net") || host.endsWith(".cloud.databricks.com") || host.endsWith(".gcp.databricks.com") || host.endsWith(".databricks.com");
  if (!host || !allowedHost) throw new Error("Databricks connector only permits Databricks workspace hostnames.");
  const httpPath = value.match(/(?:^|;)httpPath=([^;]+)/i)?.[1]?.trim() ?? "";
  const warehouseId = httpPath.match(/\/sql\/1\.0\/warehouses\/([A-Za-z0-9_-]+)/i)?.[1] ?? "";
  if (!warehouseId) throw new Error("Databricks JDBC URL must include a SQL warehouse httpPath.");
  return { host, warehouseId };
}
async function databricksJson(target: DatabricksTarget, token: string, path: string) {
  const response = await fetch(`https://${target.host}${path}`, { headers: { authorization: `Bearer ${token}`, "content-type": "application/json" } });
  const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) throw new Error(typeof payload.message === "string" ? payload.message : `Databricks returned HTTP ${response.status}.`);
  return payload;
}
async function paged(target: DatabricksTarget, token: string, path: string, field: string) {
  const items: Record<string, unknown>[] = [];
  let pageToken = "";
  let exhausted = false;
  for (let page = 0; page < MAX_UC_PAGES; page++) {
    const separator = path.includes("?") ? "&" : "?";
    const payload = await databricksJson(target, token, `${path}${separator}max_results=1000${pageToken ? `&page_token=${encodeURIComponent(pageToken)}` : ""}`);
    const batch = Array.isArray(payload[field]) ? payload[field] as Record<string, unknown>[] : [];
    items.push(...batch);
    const next = typeof payload.next_page_token === "string" ? payload.next_page_token : "";
    if (!next) { exhausted = true; pageToken = ""; break; }
    pageToken = next;
  }
  return { items, truncated: !exhausted && Boolean(pageToken) };
}
async function databricksCatalogRows(target: DatabricksTarget, token: string, requested: string[]) {
  if (!requested.length) return await paged(target, token, "/api/2.1/unity-catalog/catalogs", "catalogs");
  const items: Record<string, unknown>[] = [];
  for (const catalog of requested) {
    const row = await databricksJson(target, token, `/api/2.1/unity-catalog/catalogs/${encodeURIComponent(catalog)}`);
    items.push(row);
  }
  return { items, truncated: false };
}
async function databricksHierarchy(jdbcUrl: string, credentials: { username: string; password: string }, options: { rootsOnly: boolean; catalogs: string[] }) {
  const target = parseDatabricksJdbcUrl(jdbcUrl);
  const token = credentials.password;
  const nodes: HierarchyNode[] = [];
  const warnings: string[] = [];
  let pagingTruncated = false;
  const rootName = target.host;
  const rootId = addNode(nodes, { parentId: null, kind: "ROOT", nativeType: "METASTORE", name: rootName, qualifiedName: rootName, selectable: false, hasChildren: true, nativeId: null, system: false, metadata: { workspace_host: target.host, warehouse_id: target.warehouseId } })!;
  const catalogResult = await databricksCatalogRows(target, token, options.catalogs);
  pagingTruncated ||= catalogResult.truncated;
  for (const catalogRow of catalogResult.items) {
    if (nodes.length >= MAX_NODES) break;
    const catalog = typeof catalogRow.name === "string" ? catalogRow.name : "";
    if (!catalog) continue;
    const catalogNativeId = stableId(catalogRow, ["id", "catalog_id", "metastore_id"]);
    const catalogId = addNode(nodes, { parentId: rootId, kind: "CATALOG", nativeType: typeof catalogRow.catalog_type === "string" ? catalogRow.catalog_type : "CATALOG", name: catalog, qualifiedName: catalog, selectable: true, hasChildren: true, nativeId: catalogNativeId, catalog, system: systemName(catalog), metadata: { comment: catalogRow.comment ?? null, owner: catalogRow.owner ?? null, catalog_type: catalogRow.catalog_type ?? null, metastore_id: catalogRow.metastore_id ?? null } });
    if (!catalogId || options.rootsOnly) continue;
    const schemaResult = await paged(target, token, `/api/2.1/unity-catalog/schemas?catalog_name=${encodeURIComponent(catalog)}`, "schemas");
    pagingTruncated ||= schemaResult.truncated;
    for (const schemaRow of schemaResult.items) {
      if (nodes.length >= MAX_NODES) break;
      const schema = typeof schemaRow.name === "string" ? schemaRow.name : "";
      if (!schema) continue;
      const schemaQualified = typeof schemaRow.full_name === "string" ? schemaRow.full_name : `${catalog}.${schema}`;
      const schemaNativeId = stableId(schemaRow, ["schema_id", "id"]);
      const schemaId = addNode(nodes, { parentId: catalogId, kind: "SCHEMA", nativeType: "SCHEMA", name: schema, qualifiedName: schemaQualified, selectable: true, hasChildren: true, nativeId: schemaNativeId, catalog, schema, system: systemName(catalog) || systemName(schema), metadata: { comment: schemaRow.comment ?? null, owner: schemaRow.owner ?? null } });
      if (!schemaId) break;
      const tableResult = await paged(target, token, `/api/2.1/unity-catalog/tables?catalog_name=${encodeURIComponent(catalog)}&schema_name=${encodeURIComponent(schema)}`, "tables");
      pagingTruncated ||= tableResult.truncated;
      for (const tableRow of tableResult.items) {
        if (nodes.length >= MAX_NODES) break;
        const name = typeof tableRow.name === "string" ? tableRow.name : "";
        if (!name) continue;
        const qualified = typeof tableRow.full_name === "string" ? tableRow.full_name : `${catalog}.${schema}.${name}`;
        const objectType = typeof tableRow.table_type === "string" ? tableRow.table_type : "TABLE";
        const tableNativeId = stableId(tableRow, ["table_id", "id"]);
        const objectId = addNode(nodes, { parentId: schemaId, kind: "OBJECT", nativeType: objectType, name, qualifiedName: qualified, selectable: true, hasChildren: true, nativeId: tableNativeId, catalog, schema, object: name, objectType, system: systemName(catalog) || systemName(schema), metadata: { comment: tableRow.comment ?? null, owner: tableRow.owner ?? null, data_source_format: tableRow.data_source_format ?? null, table_id: tableNativeId } });
        if (!objectId) break;
        let columns = Array.isArray(tableRow.columns) ? tableRow.columns as Record<string, unknown>[] : [];
        if (!columns.length) {
          try {
            const detail = await databricksJson(target, token, `/api/2.1/unity-catalog/tables/${encodeURIComponent(qualified)}`);
            columns = Array.isArray(detail.columns) ? detail.columns as Record<string, unknown>[] : [];
          } catch (error) {
            warnings.push(`Unable to read fields for ${qualified}: ${error instanceof Error ? error.message : "unknown error"}`);
          }
        }
        for (const column of columns) {
          if (nodes.length >= MAX_NODES) break;
          const columnName = typeof column.name === "string" ? column.name : "";
          if (!columnName) continue;
          const position = typeof column.position === "number" ? column.position : null;
          addNode(nodes, { parentId: objectId, kind: "FIELD", nativeType: "COLUMN", name: columnName, qualifiedName: `${qualified}.${columnName}`, selectable: true, hasChildren: false, nativeId: null, catalog, schema, object: name, dataType: typeof column.type_text === "string" ? column.type_text : typeof column.type_name === "string" ? column.type_name : null, ordinal: position, system: systemName(catalog) || systemName(schema), metadata: { nullable: column.nullable ?? null, comment: column.comment ?? null, default_value: column.default_value ?? null, table_id: tableNativeId, parent_native_id: tableNativeId, position, identity_evidence: "DERIVED_LOCATOR" } });
        }
      }
    }
  }
  const truncated = nodes.length >= MAX_NODES || pagingTruncated;
  if (nodes.length >= MAX_NODES) warnings.push(`Native hierarchy reached the connector safety ceiling of ${MAX_NODES} nodes.`);
  if (pagingTruncated) warnings.push(`Unity Catalog pagination reached the safety ceiling of ${MAX_UC_PAGES} pages for at least one collection.`);
  const objectNodes = nodes.filter((node) => node.kind === "OBJECT");
  const stableObjectIds = objectNodes.length > 0 && objectNodes.every((node) => Boolean(node.nativeId));
  return {
    databaseProduct: "Databricks",
    databaseVersion: null,
    terms: { root: "metastore", catalog: "catalog", schema: "schema", object: "object", field: "column" },
    nodes,
    rootIds: [rootId],
    warnings: [...new Set(warnings)].slice(0, 100),
    truncated,
    details: {
      connector: "supabase-edge-native-hierarchy",
      credential_store: "supabase-vault",
      workspace_host: target.host,
      warehouse_id: target.warehouseId,
      max_nodes: MAX_NODES,
      max_uc_pages: MAX_UC_PAGES,
      roots_only: options.rootsOnly,
      requested_catalogs: options.catalogs,
      capabilities: {
        stable_object_ids: stableObjectIds,
        stable_field_ids: false,
        field_metadata: true,
        partitioning: "CATALOG",
        resumable_partitions: true,
        provider_snapshot: false,
        authoritative_full_listing: true,
        deletion_evidence: "CONFIRMED_ABSENCE",
        lineage_enrichment: "SYSTEM_ACCESS_TABLES",
      },
    },
  };
}

Deno.serve(async (request: Request) => {
  if (request.method !== "POST") return reply(405, { error: "Method not allowed." });
  try {
    const body = await request.json() as RequestBody;
    const jdbcUrl = required(body.jdbc_url, "jdbc_url");
    const credentials = await resolveCredential(body.credential_ref);
    if (jdbcUrl.toLowerCase().startsWith("jdbc:postgresql://")) return reply(200, await postgresHierarchy(jdbcUrl, credentials));
    if (jdbcUrl.toLowerCase().startsWith("jdbc:databricks://")) {
      return reply(200, await databricksHierarchy(jdbcUrl, credentials, { rootsOnly: body.roots_only === true, catalogs: cleanCatalogs(body.catalogs) }));
    }
    return reply(422, { error: "Built-in native hierarchy connector supports PostgreSQL and Databricks. Other JDBC engines use the governed JDBC bridge." });
  } catch (error) {
    return reply(422, { error: error instanceof Error ? error.message : "Native hierarchy discovery failed." });
  }
});