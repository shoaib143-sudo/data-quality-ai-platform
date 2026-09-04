import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const endpoint = process.env.OPENSEARCH_ENDPOINT?.trim()?.replace(/\/$/, '')
if (!endpoint) throw new Error('OPENSEARCH_ENDPOINT is required')

const prefix = (process.env.OPENSEARCH_INDEX_PREFIX ?? 'datanexus').trim().toLowerCase()
if (!/^[a-z0-9][a-z0-9_-]*$/.test(prefix)) throw new Error('OPENSEARCH_INDEX_PREFIX contains unsupported characters')

const username = process.env.OPENSEARCH_USERNAME?.trim()
const password = process.env.OPENSEARCH_PASSWORD
if ((username && password == null) || (!username && password != null)) {
  throw new Error('OPENSEARCH_USERNAME and OPENSEARCH_PASSWORD must be configured together')
}

const headers = { 'content-type': 'application/json' }
if (username && password != null) {
  headers.authorization = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`
}

async function request(resource, options = {}) {
  const response = await fetch(`${endpoint}${resource}`, {
    ...options,
    headers: { ...headers, ...(options.headers ?? {}) },
  })
  const text = await response.text()
  if (!response.ok) {
    const error = new Error(`OpenSearch ${options.method ?? 'GET'} ${resource} failed (${response.status}): ${text.slice(0, 2000)}`)
    error.status = response.status
    throw error
  }
  return text ? JSON.parse(text) : null
}

const alias = `${prefix}-knowledge`
const backingIndex = `${alias}-v1`
const here = path.dirname(fileURLToPath(import.meta.url))
const mappingPath = path.join(here, '..', 'infra', 'data-plane', 'opensearch', 'knowledge-index-v1.json')
const mapping = JSON.parse(await readFile(mappingPath, 'utf8'))

try {
  await request(`/_alias/${encodeURIComponent(alias)}`)
  console.log(`OpenSearch alias ${alias} already exists; no bootstrap change required.`)
  process.exit(0)
} catch (error) {
  if (error.status !== 404) throw error
}

let backingExists = true
try {
  await request(`/${encodeURIComponent(backingIndex)}`)
} catch (error) {
  if (error.status !== 404) throw error
  backingExists = false
}

if (!backingExists) {
  await request(`/${encodeURIComponent(backingIndex)}`, {
    method: 'PUT',
    body: JSON.stringify(mapping),
  })
  console.log(`Created OpenSearch backing index ${backingIndex}.`)
}

await request('/_aliases', {
  method: 'POST',
  body: JSON.stringify({
    actions: [{ add: { index: backingIndex, alias, is_write_index: true } }],
  }),
})
console.log(`Configured OpenSearch alias ${alias} -> ${backingIndex}.`)
