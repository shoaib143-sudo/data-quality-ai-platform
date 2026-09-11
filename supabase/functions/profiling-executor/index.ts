import { withSupabase } from "@supabase/server";
import postgres from "postgres";

type ToolRequest = {
  tool: "inspect_dataset"|"infer_column_types"|"infer_candidate_keys"|"detect_patterns"|"profile_dataset"|"compare_profiles"|"persist_profile_snapshot"|"complete_profile_run";
  dataset_version_id?: string;
  profile_run_id?: string;
  baseline_profile_run_id?: string;
  target_profile_run_id?: string;
  sample_size?: number;
  configuration?: Record<string, unknown>;
};

const jsonHeaders = {"content-type":"application/json"};

function ok(body: unknown, status=200) {
  return new Response(JSON.stringify(body, (_,v)=>typeof v==="bigint"?v.toString():v), {status, headers:jsonHeaders});
}

function bad(code:string, message:string, status=400, details?:unknown) {
  return ok({status:"FAILED", error:{code,message,details}}, status);
}

function requireUuid(v:string|undefined, name:string): string {
  if (!v || !/^[0-9a-f-]{36}$/i.test(v)) throw new Error(`Invalid ${name}`);
  return v;
}

function inferSemantic(name:string, values:string[], physical:string) {
  const n=name.toLowerCase();
  const nonNull=values.filter(v=>v!==null && v!==undefined && v!=="").slice(0,200);
  if (physical==="boolean") return {inferred_type:"boolean",semantic_type:"FLAG",confidence:0.99};
  if (["date","timestamp","timestamptz"].includes(physical) || /(^|_)(date|time|timestamp|created|updated|dob|birth)/.test(n))
    return {inferred_type:"date_time",semantic_type:"DATE",confidence:0.95};
  if (physical.includes("int")) return {inferred_type:"integer",semantic_type:/(^|_)(id|key|code)$/.test(n)?"IDENTIFIER":"MEASURE",confidence:0.98};
  if (["numeric","decimal","real","double precision","money"].includes(physical))
    return {inferred_type:"decimal",semantic_type:"MEASURE",confidence:0.98};
  if (nonNull.length && nonNull.every(v=>/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)))
    return {inferred_type:"string",semantic_type:"EMAIL",confidence:0.99};
  if (nonNull.length && nonNull.every(v=>/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v)))
    return {inferred_type:"string",semantic_type:"IDENTIFIER",confidence:0.99};
  if (nonNull.length && nonNull.every(v=>/^[A-Z]{2}$/.test(v)) && new Set(nonNull).size<=20)
    return {inferred_type:"string",semantic_type:"COUNTRY_CODE",confidence:0.85};
  if (/(email|e_mail)/.test(n)) return {inferred_type:"string",semantic_type:"EMAIL",confidence:0.92};
  if (/(^|_)(id|key|code)(_|$)/.test(n)) return {inferred_type:"string",semantic_type:"IDENTIFIER",confidence:0.90};
  if (nonNull.length && new Set(nonNull).size <= Math.max(20, Math.ceil(nonNull.length*0.02)))
    return {inferred_type:"string",semantic_type:"CATEGORICAL",confidence:0.84};
  return {inferred_type:"string",semantic_type:"TEXT",confidence:0.75};
}

export default {
  fetch: withSupabase({auth:"user"}, async (req, ctx) => {
    let db:any;
    try {
      const body = await req.json() as ToolRequest;
      if (!body.tool) return bad("INVALID_REQUEST","tool is required");
      db = postgres(Deno.env.get("SUPABASE_DB_URL")!, {max:2, idle_timeout:10, connect_timeout:10, ssl:"require"});

      const datasetVersionId = body.dataset_version_id;
      if (datasetVersionId) requireUuid(datasetVersionId,"dataset_version_id");

      const userId=ctx.userClaims?.sub ?? ctx.userClaims?.id;
      async function assertProjectAccess(projectId:string) {
        if (!userId || !/^[0-9a-f-]{36}$/i.test(userId)) throw Object.assign(new Error("Authenticated user identity unavailable"), {statusCode:401, code:"UNAUTHORIZED"});
        const [member]=await db`select exists(select 1 from app.organization_members om join app.projects p on p.organization_id=om.organization_id where p.id=${projectId}::uuid and om.user_id=${userId}::uuid) as allowed`;
        if (!member?.allowed) throw Object.assign(new Error("User is not a member of the project"), {statusCode:403, code:"FORBIDDEN"});
      }

      if (body.tool === "compare_profiles") {
        const a=requireUuid(body.baseline_profile_run_id,"baseline_profile_run_id");
        const b=requireUuid(body.target_profile_run_id,"target_profile_run_id");
        const [scope]=await db`select d.project_id from profiling.profile_runs pr join catalog.dataset_versions dv on dv.id=pr.dataset_version_id join catalog.datasets d on d.id=dv.dataset_id where pr.id in (${a}::uuid,${b}::uuid) group by d.project_id having count(distinct d.project_id)=1 and count(distinct pr.id)=2`;
        if (!scope) return bad("FORBIDDEN","Profiles are not in the same project",403);
        await assertProjectAccess(scope.project_id);
        const rows=await db`
          select coalesce(a.metric_key,b.metric_key) metric_key,
                 coalesce(a.profile_column_id,b.profile_column_id) profile_column_id,
                 a.numeric_value baseline_value,b.numeric_value target_value,
                 case when a.numeric_value is null or b.numeric_value is null then null
                      when a.numeric_value=0 then null
                      else (b.numeric_value-a.numeric_value)/abs(a.numeric_value) end relative_change
          from profiling.profile_metrics a
          full join profiling.profile_metrics b
            on a.metric_key=b.metric_key and a.profile_column_id is not distinct from b.profile_column_id
          where a.profile_run_id=${a} or b.profile_run_id=${b}
          order by metric_key
        `;
        return ok({status:"COMPLETED",tool:body.tool,baseline_profile_run_id:a,target_profile_run_id:b,changes:rows});
      }

      const dv = datasetVersionId ? (await db`
        select dv.id,dv.dataset_id,dv.version_number,dv.row_count,dv.column_count,dv.content_hash,
               d.source_identifier,d.data_source_id,ds.source_type,ds.connection_metadata,
               d.project_id
        from catalog.dataset_versions dv
        join catalog.datasets d on d.id=dv.dataset_id
        left join catalog.data_sources ds on ds.id=d.data_source_id
        where dv.id=${datasetVersionId}
      `)[0] : null;

      if (!dv) return bad("DATASET_VERSION_NOT_FOUND","dataset_version_id was not found",404);
      const projectId=dv.project_id;
      await assertProjectAccess(projectId);

      const meta=dv.connection_metadata ?? {};
      const schema=String(meta.schema ?? "").trim();
      const table=String(meta.table ?? "").trim();
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(schema) || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(table))
        return bad("UNSUPPORTED_SOURCE","Only safe PostgreSQL schema/table identifiers are supported by this executor");

      const source = db`${db(schema)}.${db(table)}`;

      if (body.tool === "inspect_dataset") {
        const cols=await db`
          select ordinal_position,column_name,data_type,udt_name,is_nullable,
                 character_maximum_length,numeric_precision,numeric_scale
          from information_schema.columns
          where table_schema=${schema} and table_name=${table}
          order by ordinal_position
        `;
        if (!cols.length) return bad("SOURCE_NOT_FOUND",`Source table ${schema}.${table} was not found`,404);
        const [counts]=await db`select count(*)::bigint as row_count from ${source}`;
        return ok({status:"COMPLETED",tool:body.tool,dataset_version_id:datasetVersionId,
          source:{schema,table},row_count:counts.row_count,column_count:cols.length,columns:cols});
      }

      const columns=await db`
        select ordinal_position,column_name,data_type,udt_name,is_nullable
        from information_schema.columns
        where table_schema=${schema} and table_name=${table}
        order by ordinal_position
      `;
      if (!columns.length) return bad("SOURCE_NOT_FOUND",`Source table ${schema}.${table} was not found`,404);
      const sampleSize=Math.min(Math.max(Number(body.sample_size ?? 200),20),1000);

      if (body.tool === "infer_column_types" || body.tool === "detect_patterns") {
        const out:any[]=[];
        for (const c of columns) {
          const vals=await db`select ${db(c.column_name)}::text as value from ${source} where ${db(c.column_name)} is not null limit ${sampleSize}`;
          const values=vals.map((r:any)=>r.value);
          const inf=inferSemantic(c.column_name,values,c.data_type);
          const patterns={
            email:values.filter(v=>/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)).length,
            uuid:values.filter(v=>/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v)).length,
            numeric_string:values.filter(v=>/^-?\d+(\.\d+)?$/.test(v)).length,
            iso_date:values.filter(v=>/^\d{4}-\d{2}-\d{2}/.test(v)).length
          };
          out.push({column_name:c.column_name,ordinal_position:c.ordinal_position,source_type:c.data_type,
            ...inf,sample_count:values.length,patterns});
        }
        return ok({status:"COMPLETED",tool:body.tool,dataset_version_id:datasetVersionId,columns:out});
      }

      if (body.tool === "infer_candidate_keys") {
        const out:any[]=[];
        for (const c of columns) {
          const [s]=await db`
            select count(*)::bigint row_count,count(${db(c.column_name)})::bigint non_null_count,
                   count(distinct ${db(c.column_name)})::bigint distinct_count
            from ${source}
          `;
          const rowCount=Number(s.row_count), nonNull=Number(s.non_null_count), distinct=Number(s.distinct_count);
          const unique= rowCount>0 && nonNull===rowCount && distinct===rowCount;
          const score=(nonNull/Math.max(rowCount,1))*0.5+(distinct/Math.max(nonNull,1))*0.5;
          out.push({column_name:c.column_name,row_count:rowCount,non_null_count:nonNull,
            distinct_count:distinct,uniqueness_rate:nonNull?distinct/nonNull:0,
            candidate_key:unique,key_confidence:unique?Math.min(0.99,score):score});
        }
        return ok({status:"COMPLETED",tool:body.tool,dataset_version_id:datasetVersionId,candidates:out.filter(x=>x.candidate_key)});
      }

      if (body.tool === "profile_dataset") {
        const runId=requireUuid(body.profile_run_id,"profile_run_id");
        await db`update profiling.profile_runs set status='RUNNING',started_at=coalesce(started_at,now()),engine_name='supabase-edge-postgres',engine_version='1.0' where id=${runId} and dataset_version_id=${datasetVersionId}`;
        const [counts]=await db`select count(*)::bigint row_count,count(*)::integer column_count from ${source}`;
        const profileColumns:any[]=[];
        const metrics:any[]=[];
        const findings:any[]=[];
        for (const c of columns) {
          const [s]=await db`
            select count(*)::bigint row_count,
                   count(${db(c.column_name)})::bigint non_null_count,
                   count(distinct ${db(c.column_name)})::bigint distinct_count
            from ${source}
          `;
          const rowCount=Number(s.row_count), nonNull=Number(s.non_null_count), distinct=Number(s.distinct_count);
          const nullCount=rowCount-nonNull, nullRate=rowCount?nullCount/rowCount:0, uniqueness=nonNull?distinct/nonNull:0;
          const vals=await db`select ${db(c.column_name)}::text as value from ${source} where ${db(c.column_name)} is not null limit ${sampleSize}`;
          const inf=inferSemantic(c.column_name,vals.map((r:any)=>r.value),c.data_type);
          const [pc]=await db`
            insert into profiling.profile_columns(
              profile_run_id,column_name,ordinal_position,source_type,inferred_type,semantic_type,
              nullable,confidence,is_candidate_key,key_confidence,metadata
            ) values(${runId},${c.column_name},${c.ordinal_position},${c.data_type},${inf.inferred_type},
              ${inf.semantic_type},${c.is_nullable==="YES"},${inf.confidence},false,null,
              ${JSON.stringify({sample_count:vals.length})}::jsonb)
            on conflict (profile_run_id,column_name) do update set
              source_type=excluded.source_type,inferred_type=excluded.inferred_type,
              semantic_type=excluded.semantic_type,nullable=excluded.nullable,confidence=excluded.confidence
            returning id
          `;
          const candidate=nonNull===rowCount && distinct===rowCount && rowCount>0;
          await db`update profiling.profile_columns set is_candidate_key=${candidate},key_confidence=${candidate?0.99:uniqueness} where id=${pc.id}`;
          profileColumns.push({column_name:c.column_name,inferred_type:inf.inferred_type,semantic_type:inf.semantic_type,
            null_count:nullCount,null_rate:nullRate,distinct_count:distinct,uniqueness_rate:uniqueness,candidate_key:candidate});
          const metricRows=[
            ["null_count",nullCount],["null_rate",nullRate],["distinct_count",distinct],["unique_rate",uniqueness]
          ];
          if(["integer","decimal"].includes(inf.inferred_type)) {
            const [n]=await db`select min(${db(c.column_name)})::numeric as min,max(${db(c.column_name)})::numeric as max,avg(${db(c.column_name)})::numeric as mean,
              count(*) filter(where ${db(c.column_name)}=0)::bigint zero_count,count(*) filter(where ${db(c.column_name)}<0)::bigint negative_count from ${source}`;
            metricRows.push(["min",n.min],["max",n.max],["mean",n.mean],["zero_count",Number(n.zero_count)],["negative_count",Number(n.negative_count)]);
            if(Number(n.negative_count)>0) findings.push({column:c.column_name,type:"NEGATIVE_VALUE",severity:"LOW",title:"Negative value detected",
              description:`Column ${c.column_name} contains negative values.`,confidence:0.99,evidence:{negative_count:Number(n.negative_count)}});
          }
          for (const [key,val] of metricRows) {
            const md=await db`select id from profiling.metric_definitions where metric_key=${key} and enabled=true limit 1`;
            if(md[0]) await db`insert into profiling.profile_metrics(profile_run_id,metric_definition_id,profile_column_id,metric_key,numeric_value)
              values(${runId},${md[0].id},${pc.id},${key},${val}) on conflict do nothing`;
          }
          if(nullRate>0) findings.push({column:c.column_name,type:"NULLS_PRESENT",severity:nullRate>=0.1?"MEDIUM":"LOW",
            title:"Null values detected",description:`Column ${c.column_name} contains null values.`,confidence:0.99,
            evidence:{null_count:nullCount,null_rate:nullRate}});
          if(candidate) findings.push({column:c.column_name,type:"CANDIDATE_KEY",severity:"INFO",
            title:"Candidate key detected",description:`Column ${c.column_name} is unique and non-null in the profiled dataset.`,confidence:0.99,
            evidence:{row_count:rowCount,distinct_count:distinct}});
        }
        const [dups]=await db`select count(*)::bigint as duplicate_rows from (
          select md5(to_jsonb(t)::text) row_hash,count(*) from ${source} t group by 1 having count(*)>1
        ) x`;
        if(Number(dups.duplicate_rows)>0) findings.push({column:null,type:"DUPLICATE_ROWS",severity:"MEDIUM",
          title:"Duplicate rows detected",description:"The dataset contains duplicate row values.",
          confidence:0.99,evidence:{duplicate_groups:Number(dups.duplicate_rows)}});
        for(const f of findings) {
          const pc=f.column?profileColumns.find(x=>x.column_name===f.column):null;
          const [pcid]=pc?await db`select id from profiling.profile_columns where profile_run_id=${runId} and column_name=${f.column}`:[null];
          await db`insert into profiling.profile_findings(profile_run_id,profile_column_id,finding_type,severity,title,description,confidence,evidence,recommendation)
            values(${runId},${pcid?.id??null},${f.type},${f.severity},${f.title},${f.description},${f.confidence},${JSON.stringify(f.evidence)}::jsonb,
              ${JSON.stringify({action:"review_with_business_context"})}::jsonb)`;
        }
        await db`update profiling.profile_runs set row_count=${Number(counts.row_count)},column_count=${columns.length},
          duplicate_row_count=${Number(dups.duplicate_rows)},sampling_mode='FULL',sampling_size=${sampleSize},
          sampling_rate=1,configuration=${JSON.stringify(body.configuration??{})}::jsonb where id=${runId}`;
        return ok({status:"COMPLETED",tool:body.tool,dataset_version_id:datasetVersionId,profile_run_id:runId,
          row_count:Number(counts.row_count),column_count:columns.length,duplicate_row_count:Number(dups.duplicate_rows),
          columns:profileColumns,findings});
      }

      if (body.tool === "persist_profile_snapshot") {
        const runId=requireUuid(body.profile_run_id,"profile_run_id");
        const [r]=await db`select pr.*,dv.dataset_id,dv.version_number,d.project_id from profiling.profile_runs pr join catalog.dataset_versions dv on dv.id=pr.dataset_version_id join catalog.datasets d on d.id=dv.dataset_id where pr.id=${runId}`;
        if(!r) return bad("PROFILE_RUN_NOT_FOUND","profile_run_id was not found",404);
        await assertProjectAccess(r.project_id);
        const signature=(await db`select encode(digest(concat(${r.dataset_version_id}::text,'|',coalesce(${r.profile_definition_id}::text,''),'|',${r.version_number}::text,'|',coalesce(${r.row_count},0)::text,'|',coalesce(${r.column_count},0)::text),'sha256'),'hex') as signature`)[0].signature;
        await db`update profiling.profile_runs set profile_signature=${signature},schema_hash=coalesce(schema_hash,${signature}) where id=${runId}`;
        return ok({status:"COMPLETED",tool:body.tool,profile_run_id:runId,profile_signature:signature});
      }

      if (body.tool === "complete_profile_run") {
        const runId=requireUuid(body.profile_run_id,"profile_run_id");
        const [r]=await db`select pr.*,d.project_id from profiling.profile_runs pr join catalog.dataset_versions dv on dv.id=pr.dataset_version_id join catalog.datasets d on d.id=dv.dataset_id where pr.id=${runId}`;
        if(!r) return bad("PROFILE_RUN_NOT_FOUND","profile_run_id was not found",404);
        await assertProjectAccess(r.project_id);
        await db`update profiling.profile_runs set status='COMPLETED',completed_at=now() where id=${runId}`;
        if(r.agent_run_id) await db`update agent.agent_runs set status='COMPLETED',completed_at=now(),
          output=${JSON.stringify({profile_run_id:runId,row_count:r.row_count,column_count:r.column_count,duplicate_row_count:r.duplicate_row_count})}::jsonb
          where id=${r.agent_run_id}`;
        return ok({status:"COMPLETED",tool:body.tool,profile_run_id:runId,agent_run_id:r.agent_run_id});
      }

      return bad("UNSUPPORTED_TOOL",`Unsupported tool: ${body.tool}`);
    } catch (e) {
      console.error(e);
      const err:any=e;
      const rawCode=typeof err?.code==="string"?err.code:"";
      const code=/^[A-Z0-9_]{1,64}$/.test(rawCode)?rawCode:"EXECUTION_ERROR";
      const statusCode=Number(err?.statusCode);
      const status=[400,401,403,404,409,422].includes(statusCode)?statusCode:500;
      const messages:Record<string,string>={
        UNAUTHORIZED:"Authentication required",
        FORBIDDEN:"Access denied",
        INVALID_REQUEST:"Invalid request",
      };
      return bad(code,messages[code]??(status>=500?"Execution failed":"Request could not be completed"),status);
    } finally {
      try { await db?.end({timeout:1}); } catch {}
    }
  })
};
