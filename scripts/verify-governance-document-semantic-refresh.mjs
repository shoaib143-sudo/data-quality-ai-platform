import fs from 'node:fs'

const migration = fs.readFileSync('supabase/migrations/20260905034044_enqueue_governance_document_semantic_refresh.sql', 'utf8')

function requireText(needle, label) {
  if (!migration.includes(needle)) throw new Error(`Governance document semantic refresh contract missing: ${label}`)
}

requireText("set_config('governance.knowledge_document_review_context','false',true)", 'review context reset')
requireText('enqueue_knowledge_document_semantic_refresh', 'durable semantic refresh trigger function')
requireText('trg_enqueue_knowledge_document_semantic_refresh', 'knowledge document semantic refresh trigger')
requireText("v_project_id,'SEMANTIC_INDEX',v_project_id", 'project-scoped semantic job supersession identity')
requireText("'KNOWLEDGE_DOCUMENT_APPROVED'", 'approval semantic refresh')
requireText("'KNOWLEDGE_DOCUMENT_REJECTED'", 'rejection semantic pruning')
requireText("'KNOWLEDGE_DOCUMENT_APPROVAL_RESET'", 'material-edit approval reset pruning')
requireText("'KNOWLEDGE_DOCUMENT_DELETED'", 'approved document deletion pruning')
requireText('on conflict (project_id,idempotency_key)', 'idempotent semantic refresh enqueue')
requireText('after update or delete on governance.knowledge_documents', 'semantic refresh state-change boundary')

console.log('Governance document semantic refresh contracts verified.')
