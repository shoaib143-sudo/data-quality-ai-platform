export type DirectPostgresColumnMapping = {
  sourceAsset: string
  sourceColumn: string
  targetAsset: string
  targetColumn: string
  operation: 'DIRECT_PROJECTION'
  expression: string
  metadata: {
    authoritative_source: 'pg_views.definition'
    derivation: 'DIRECT_PROJECTION_ONLY'
  }
}

export type DirectPostgresViewLineage = {
  sourceAsset: string
  targetAsset: string
  columnMappings: DirectPostgresColumnMapping[]
  skippedProjectionCount: number
}

const SQL_KEYWORDS = new Set([
  'where', 'group', 'order', 'having', 'limit', 'offset', 'fetch', 'union',
  'intersect', 'except', 'join', 'left', 'right', 'full', 'inner', 'cross',
  'natural', 'window', 'for',
])

function unquoteIdentifier(value: string) {
  const trimmed = value.trim()
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) return trimmed.slice(1, -1).replace(/""/g, '"')
  return trimmed
}

function qualifiedParts(value: string) {
  return value.split('.').map(unquoteIdentifier).filter(Boolean)
}

function splitTopLevelCsv(value: string) {
  const parts: string[] = []
  let current = ''
  let depth = 0
  let singleQuoted = false
  let doubleQuoted = false

  for (let index = 0; index < value.length; index += 1) {
    const char = value[index]
    const next = value[index + 1]

    if (singleQuoted) {
      current += char
      if (char === "'" && next === "'") {
        current += next
        index += 1
      } else if (char === "'") {
        singleQuoted = false
      }
      continue
    }

    if (doubleQuoted) {
      current += char
      if (char === '"' && next === '"') {
        current += next
        index += 1
      } else if (char === '"') {
        doubleQuoted = false
      }
      continue
    }

    if (char === "'") {
      singleQuoted = true
      current += char
      continue
    }
    if (char === '"') {
      doubleQuoted = true
      current += char
      continue
    }
    if (char === '(') {
      depth += 1
      current += char
      continue
    }
    if (char === ')') {
      depth = Math.max(0, depth - 1)
      current += char
      continue
    }
    if (char === ',' && depth === 0) {
      if (current.trim()) parts.push(current.trim())
      current = ''
      continue
    }
    current += char
  }

  if (current.trim()) parts.push(current.trim())
  return parts
}

function identifierPattern() {
  return '(?:"(?:[^"]|"")*"|[A-Za-z_][A-Za-z0-9_$]*)'
}

function normalizedTargetColumn(targetColumns: string[], candidate: string) {
  return targetColumns.find(column => column.toLowerCase() === candidate.toLowerCase()) ?? null
}

export function deriveDirectPostgresViewLineage(input: {
  logic: string
  targetSchema: string
  targetView: string
  targetColumns: string[]
}): DirectPostgresViewLineage | null {
  const logic = input.logic?.trim()
  if (!logic || !/^select\b/i.test(logic)) return null
  if (/^select\s+distinct\s+on\b/i.test(logic)) return null
  if (/\b(?:join|union|intersect|except|lateral)\b/i.test(logic)) return null
  if (/\bfrom\s*\(/i.test(logic)) return null

  const identifier = identifierPattern()
  const relationRegex = new RegExp('\\bfrom\\s+(' + identifier + '(?:\\.' + identifier + '){0,2})', 'i')
  const fromMatch = relationRegex.exec(logic)
  if (!fromMatch || fromMatch.index <= 0) return null

  const relation = fromMatch[1]
  const relationParts = qualifiedParts(relation)
  if (!relationParts.length) return null
  const relationTable = relationParts.at(-1)!

  const afterRelation = logic.slice(fromMatch.index + fromMatch[0].length).trimStart()
  const aliasRegex = new RegExp('^(?:as\\s+)?(' + identifier + ')\\b', 'i')
  const aliasMatch = aliasRegex.exec(afterRelation)
  const aliasCandidate = aliasMatch ? unquoteIdentifier(aliasMatch[1]) : null
  const relationAlias = aliasCandidate && !SQL_KEYWORDS.has(aliasCandidate.toLowerCase()) ? aliasCandidate : null

  let selectClause = logic.slice(logic.search(/\bselect\b/i) + 'select'.length, fromMatch.index).trim()
  selectClause = selectClause.replace(/^distinct\s+/i, '')
  if (!selectClause) return null

  const projectionRegex = new RegExp(
    '^\\s*(?:(' + identifier + ')\\.)?(' + identifier + ')(?:\\s+(?:as\\s+)?(' + identifier + '))?\\s*$',
    'i',
  )
  const targetAsset = [input.targetSchema, input.targetView].filter(Boolean).join('.')
  const sourceAsset = relationParts.join('.')
  const mappings: DirectPostgresColumnMapping[] = []
  let skippedProjectionCount = 0

  for (const projection of splitTopLevelCsv(selectClause)) {
    const match = projectionRegex.exec(projection)
    if (!match) {
      skippedProjectionCount += 1
      continue
    }

    const qualifier = match[1] ? unquoteIdentifier(match[1]) : null
    const sourceColumn = unquoteIdentifier(match[2])
    const requestedTarget = match[3] ? unquoteIdentifier(match[3]) : sourceColumn

    if (qualifier) {
      const allowed = new Set([relationTable.toLowerCase()])
      if (relationAlias) allowed.add(relationAlias.toLowerCase())
      if (!allowed.has(qualifier.toLowerCase())) {
        skippedProjectionCount += 1
        continue
      }
    }

    const targetColumn = normalizedTargetColumn(input.targetColumns, requestedTarget)
    if (!targetColumn) {
      skippedProjectionCount += 1
      continue
    }

    mappings.push({
      sourceAsset,
      sourceColumn,
      targetAsset,
      targetColumn,
      operation: 'DIRECT_PROJECTION',
      expression: projection,
      metadata: {
        authoritative_source: 'pg_views.definition',
        derivation: 'DIRECT_PROJECTION_ONLY',
      },
    })
  }

  if (!mappings.length) return null
  return { sourceAsset, targetAsset, columnMappings: mappings, skippedProjectionCount }
}
