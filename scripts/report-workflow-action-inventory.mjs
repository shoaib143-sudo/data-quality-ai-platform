import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'

const workflowRoot = path.resolve('.github/workflows')
const usesLinePattern = /^\s*(?:-\s*)?uses:\s*([^#\s]+)(?:\s+#.*)?$/

function classifyActionRef(actionRef) {
  if (actionRef.startsWith('./')) return { kind: 'local', actionRef }
  if (actionRef.startsWith('docker://')) return { kind: 'docker', actionRef }

  const at = actionRef.lastIndexOf('@')
  const actionPath = at >= 0 ? actionRef.slice(0, at) : actionRef
  const ref = at >= 0 ? actionRef.slice(at + 1) : ''
  const [owner = '', repository = ''] = actionPath.split('/')

  return {
    kind: 'remote',
    owner,
    repository,
    actionPath,
    ref,
    actionRef,
  }
}

export async function collectWorkflowActionInventory(root = workflowRoot) {
  const workflowNames = (await readdir(root))
    .filter(name => name.endsWith('.yml') || name.endsWith('.yaml'))
    .sort()

  const references = []
  for (const workflowName of workflowNames) {
    const workflowPath = path.join(root, workflowName)
    const content = await readFile(workflowPath, 'utf8')
    const lines = content.split(/\r?\n/)

    for (const [index, line] of lines.entries()) {
      const match = line.match(usesLinePattern)
      if (!match) continue
      const actionRef = match[1].trim().replace(/^['"]|['"]$/g, '')
      references.push({
        workflow: path.relative(process.cwd(), workflowPath).replaceAll('\\', '/'),
        line: index + 1,
        ...classifyActionRef(actionRef),
      })
    }
  }

  const remote = references.filter(reference => reference.kind === 'remote')
  const owners = [...new Set(remote.map(reference => reference.owner))].sort()
  const actions = [...new Set(remote.map(reference => reference.actionPath))].sort()
  const docker = [...new Set(references.filter(reference => reference.kind === 'docker').map(reference => reference.actionRef))].sort()
  const localCount = references.filter(reference => reference.kind === 'local').length

  return {
    workflowCount: workflowNames.length,
    referenceCount: references.length,
    remoteReferenceCount: remote.length,
    localReferenceCount: localCount,
    dockerReferenceCount: docker.length,
    owners,
    actions,
    docker,
    references,
  }
}

const inventory = await collectWorkflowActionInventory()
console.log('GitHub Actions inventory')
console.log(JSON.stringify({
  workflowCount: inventory.workflowCount,
  referenceCount: inventory.referenceCount,
  remoteReferenceCount: inventory.remoteReferenceCount,
  localReferenceCount: inventory.localReferenceCount,
  dockerReferenceCount: inventory.dockerReferenceCount,
  owners: inventory.owners,
  actions: inventory.actions,
  docker: inventory.docker,
}, null, 2))
