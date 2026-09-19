import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const sourceRoots = ['app', 'components', 'lib']
const sourceExtensions = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'])
const sensitiveName = /(SECRET|TOKEN|PASSWORD|PRIVATE_KEY|SERVICE_ROLE|ACCESS_KEY|CLIENT_SECRET|WEBHOOK_URL)/i

async function walk(root) {
  const entries = await readdir(root, { withFileTypes: true }).catch(() => [])
  const files = []
  for (const entry of entries) {
    const absolute = path.join(root, entry.name)
    if (entry.isDirectory()) files.push(...await walk(absolute))
    else if (entry.isFile() && sourceExtensions.has(path.extname(entry.name))) files.push(absolute)
  }
  return files
}

export async function verifySecretHygiene({ roots = sourceRoots } = {}) {
  const files = (await Promise.all(roots.map(root => walk(root)))).flat().sort()
  const violations = []

  for (const file of files) {
    const source = await readFile(file, 'utf8')
    const relative = path.relative(process.cwd(), file).replaceAll(path.sep, '/')
    const isClient = /^\s*['"]use client['"]/.test(source)
    const envMatches = [...source.matchAll(/process\.env\.([A-Z0-9_]+)/g)].map(match => match[1])

    for (const envName of envMatches) {
      if (envName.startsWith('NEXT_PUBLIC_') && sensitiveName.test(envName)) {
        violations.push({ file: relative, reason: `sensitive environment variable ${envName} must never use NEXT_PUBLIC_` })
      }
      if (isClient && sensitiveName.test(envName)) {
        violations.push({ file: relative, reason: `client component references sensitive environment variable ${envName}` })
      }
    }

    const consoleEnv = source.match(/console\.(?:log|info|warn|error|debug)\([^\n]*process\.env\.([A-Z0-9_]+)/g) ?? []
    for (const statement of consoleEnv) {
      const envName = statement.match(/process\.env\.([A-Z0-9_]+)/)?.[1]
      if (envName && sensitiveName.test(envName)) {
        violations.push({ file: relative, reason: `sensitive environment variable ${envName} is written to console output` })
      }
    }
  }

  if (violations.length) {
    console.error('Secret hygiene violations detected:')
    for (const violation of violations) console.error(`- ${violation.file}: ${violation.reason}`)
    throw new Error(`Secret hygiene failed with ${violations.length} violation(s).`)
  }

  console.log(`Secret hygiene verified across ${files.length} source files: no sensitive NEXT_PUBLIC_ names, client secret reads, or direct sensitive env console output.`)
  return { fileCount: files.length, violations }
}

const direct = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (direct) {
  try {
    await verifySecretHygiene()
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  }
}
