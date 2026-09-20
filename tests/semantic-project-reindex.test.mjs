import assert from 'node:assert/strict'
import test from 'node:test'
import { existsSync } from 'node:fs'
import { registerHooks } from 'node:module'
import { pathToFileURL, fileURLToPath } from 'node:url'
import path from 'node:path'

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('@/')) {
      const base = path.resolve(process.cwd(), specifier.slice(2))
      for (const suffix of ['.ts', '.tsx', '.js', '.mjs']) {
        if (existsSync(base + suffix)) return nextResolve(pathToFileURL(base + suffix).href, context)
      }
    }
    if (specifier.startsWith('.') && !/\.[a-z0-9]+$/i.test(specifier) && context.parentURL?.startsWith('file:')) {
      for (const suffix of ['.ts', '.tsx', '.js', '.mjs']) {
        const candidate = new URL(`${specifier}${suffix}`, context.parentURL)
        if (existsSync(fileURLToPath(candidate))) return nextResolve(candidate.href, context)
      }
    }
    return nextResolve(specifier, context)
  },
})

const { reindexProjectSemanticCorpus } = await import('../lib/governance/semantic-project-reindex.ts')

test('reindexes the complete governed semantic corpus and aggregates group outcomes', async () => {
  const calls = []
  const fake = (name, result) => async (projectId, options) => {
    calls.push({ name, projectId, options })
    return result
  }

  const result = await reindexProjectSemanticCorpus('project-a', { concurrency: 99 }, {
    governance: fake('governance', { total: 2, indexed: 2, failed: 0, pruned: 1 }),
    documents: fake('documents', { total: 3, indexed: 1, unchanged: 2, failed: 0, pruned: 0 }),
    knowledge: fake('knowledge', { indexed: 4, failed: 1, pruned: 2 }),
    agentMemories: fake('agentMemories', { indexed: 5, failed: 0, pruned: 1 }),
    agentLearning: fake('agentLearning', { indexed: 6, failed: 0, pruned: 0 }),
  })

  assert.deepEqual(calls.map((call) => call.name), [
    'governance',
    'documents',
    'knowledge',
    'agentMemories',
    'agentLearning',
  ])
  assert.ok(calls.every((call) => call.projectId === 'project-a'))
  assert.ok(calls.every((call) => call.options.concurrency === 8))
  assert.equal(result.total, 23)
  assert.equal(result.indexed, 18)
  assert.equal(result.unchanged, 2)
  assert.equal(result.failed, 1)
  assert.equal(result.pruned, 4)
  assert.equal(result.groups.agentLearning.indexed, 6)
})

test('omits an explicit concurrency override when none is provided', async () => {
  const optionsSeen = []
  const fake = async (_projectId, options) => {
    optionsSeen.push(options)
    return { indexed: 0, failed: 0, pruned: 0 }
  }

  await reindexProjectSemanticCorpus('project-a', {}, {
    governance: fake,
    documents: fake,
    knowledge: fake,
    agentMemories: fake,
    agentLearning: fake,
  })

  assert.ok(optionsSeen.every((options) => Object.keys(options).length === 0))
})
