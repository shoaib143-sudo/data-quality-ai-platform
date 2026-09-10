import fs from 'node:fs'
import path from 'node:path'

const targetDir = process.env.TARGET_MIGRATION_DIR
if (!targetDir) throw new Error('TARGET_MIGRATION_DIR is required')

const fileName = '20260905064557_automated_governance_control_evidence_collection.sql'
const targetPath = path.join(targetDir, fileName)
if (!fs.existsSync(targetPath)) throw new Error(`Replay target is missing ${fileName}`)

const source = fs.readFileSync(targetPath, 'utf8')
const broken = "or (v_scope_type='CDE' and exists(select 1 from governance.cde_mappings cm where cm.project_id=p_project_id and cm.cde_id=v_scope_id and cm.status='APPROVED' and ((cm.dataset_id=sa.dataset_id and (cm.column_name is null or lower(cm.column_name)=lower(lm.source_column))) or (cm.dataset_id=ta.dataset_id and (cm.column_name is null or lower(cm.column_name)=lower(lm.target_column))))));"
const repaired = `${broken.slice(0, -1)});`

const occurrences = source.split(broken).length - 1
if (occurrences !== 1) {
  throw new Error(`Expected exactly one historical LINEAGE predicate parser defect in ${fileName}, found ${occurrences}`)
}

fs.writeFileSync(targetPath, source.replace(broken, repaired))
console.log(`REPAIRED ${fileName}: balanced the historical LINEAGE evidence predicate in disposable replay; released migration history remains unchanged.`)
