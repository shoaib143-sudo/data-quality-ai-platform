export type ConnectorReadiness='LIVE_NATIVE'|'LIVE_BRIDGE'|'INGEST_ADAPTER'|'DRY_RUN_ADAPTER'|'PLANNED_EXTERNAL'
export type ConnectorCapability={
  key:string
  label:string
  family:'DATABASE'|'ETL'|'BI'|'SOURCE_CODE'|'FILE'
  readiness:ConnectorReadiness
  capture:string[]
  requirements:string[]
  route:string
}
export const connectorCapabilities:ConnectorCapability[]=[
  {key:'postgresql',label:'PostgreSQL / Supabase',family:'DATABASE',readiness:'LIVE_NATIVE',capture:['schemas','tables','columns','native hierarchy','profiling'],requirements:['database credentials'],route:'/datasets'},
  {key:'databricks',label:'Databricks Unity Catalog',family:'DATABASE',readiness:'LIVE_NATIVE',capture:['catalogs','schemas','tables','columns','stable IDs','profiling'],requirements:['workspace host','HTTP path','access token'],route:'/datasets'},
  {key:'mssql',label:'Microsoft SQL Server',family:'DATABASE',readiness:'LIVE_BRIDGE',capture:['database','schemas','tables','views','columns'],requirements:['JDBC bridge','SQL Server JDBC driver','credentials'],route:'/datasets'},
  {key:'oracle',label:'Oracle Database',family:'DATABASE',readiness:'LIVE_BRIDGE',capture:['schemas','tables','views','columns'],requirements:['JDBC bridge','Oracle JDBC driver','credentials'],route:'/datasets'},
  {key:'mysql',label:'MySQL',family:'DATABASE',readiness:'LIVE_BRIDGE',capture:['database hierarchy','tables','columns'],requirements:['JDBC bridge','MySQL JDBC driver','credentials'],route:'/datasets'},
  {key:'informatica',label:'Informatica',family:'ETL',readiness:'INGEST_ADAPTER',capture:['source-target relationships','transformations','column mappings'],requirements:['metadata export or API payload'],route:'/lineage/ingest'},
  {key:'boomi',label:'Boomi',family:'ETL',readiness:'INGEST_ADAPTER',capture:['process relationships','source-target mappings'],requirements:['metadata export or API payload'],route:'/lineage/ingest'},
  {key:'ssis',label:'SSIS',family:'ETL',readiness:'INGEST_ADAPTER',capture:['packages','data flows','expressions','column mappings'],requirements:['package metadata export'],route:'/lineage/ingest'},
  {key:'datamagic',label:'Datamagic',family:'ETL',readiness:'INGEST_ADAPTER',capture:['relationships','transformation metadata'],requirements:['accessible metadata export/API'],route:'/lineage/ingest'},
  {key:'webotx',label:'WebOTX',family:'ETL',readiness:'INGEST_ADAPTER',capture:['relationships','transformation metadata'],requirements:['accessible metadata export/API'],route:'/lineage/ingest'},
  {key:'axway',label:'Axway',family:'ETL',readiness:'INGEST_ADAPTER',capture:['relationships','transformation metadata'],requirements:['accessible metadata export/API'],route:'/lineage/ingest'},
  {key:'agile-reporter',label:'Agile Reporter',family:'ETL',readiness:'INGEST_ADAPTER',capture:['relationships','report metadata'],requirements:['accessible metadata export/API'],route:'/lineage/ingest'},
  {key:'power-bi',label:'Power BI',family:'BI',readiness:'DRY_RUN_ADAPTER',capture:['workspaces','reports','dashboards','semantic models','upstream sources'],requirements:['metadata export now; API credentials for live pull'],route:'/catalog/bi-integrations'},
  {key:'tableau',label:'Tableau',family:'BI',readiness:'DRY_RUN_ADAPTER',capture:['projects','workbooks','reports','upstream sources'],requirements:['metadata export now; API credentials for live pull'],route:'/catalog/bi-integrations'},
  {key:'looker',label:'Looker',family:'BI',readiness:'DRY_RUN_ADAPTER',capture:['projects','explores','semantic models','upstream sources'],requirements:['metadata export now; API credentials for live pull'],route:'/catalog/bi-integrations'},
  {key:'dotnet',label:'.NET',family:'SOURCE_CODE',readiness:'DRY_RUN_ADAPTER',capture:['SQL reads/writes','files','endpoints','transformation hints'],requirements:['artifact content or repository connector'],route:'/catalog/source-artifact-scan'},
  {key:'nodejs',label:'Node.js',family:'SOURCE_CODE',readiness:'DRY_RUN_ADAPTER',capture:['SQL reads/writes','files','endpoints','transformation hints'],requirements:['artifact content or repository connector'],route:'/catalog/source-artifact-scan'},
  {key:'vba',label:'VBA / Excel Macros',family:'SOURCE_CODE',readiness:'DRY_RUN_ADAPTER',capture:['SQL references','files','transformation hints'],requirements:['macro source content'],route:'/catalog/source-artifact-scan'},
  {key:'scripts',label:'Scripts and Logs',family:'SOURCE_CODE',readiness:'DRY_RUN_ADAPTER',capture:['SQL references','files','endpoints'],requirements:['artifact or log content'],route:'/catalog/source-artifact-scan'},
]
