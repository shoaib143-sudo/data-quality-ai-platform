import { existsSync } from 'node:fs'
import { dirname, extname, resolve as resolvePath } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = process.cwd()

function candidateUrls(basePath) {
  const candidates = extname(basePath)
    ? [basePath]
    : [
        basePath,
        basePath + '.ts',
        basePath + '.tsx',
        basePath + '.mjs',
        basePath + '.js',
        resolvePath(basePath, 'index.ts'),
        resolvePath(basePath, 'index.tsx'),
        resolvePath(basePath, 'index.mjs'),
        resolvePath(basePath, 'index.js'),
      ]
  return candidates.filter(existsSync).map(path => pathToFileURL(path).href)
}

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('@/')) {
    const matches = candidateUrls(resolvePath(root, specifier.slice(2)))
    if (matches[0]) return { url: matches[0], shortCircuit: true }
  }

  if ((specifier.startsWith('./') || specifier.startsWith('../')) && context.parentURL?.startsWith('file:')) {
    const parentDir = dirname(fileURLToPath(context.parentURL))
    const matches = candidateUrls(resolvePath(parentDir, specifier))
    if (matches[0]) return { url: matches[0], shortCircuit: true }
  }

  return nextResolve(specifier, context)
}
