import { existsSync } from 'node:fs'
import path from 'node:path'
import { registerHooks } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'

const EXTENSIONS = ['.ts', '.tsx', '.js', '.mjs']

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('@/')) {
      const base = path.resolve(process.cwd(), specifier.slice(2))
      for (const extension of EXTENSIONS) {
        const candidate = base + extension
        if (existsSync(candidate)) return nextResolve(pathToFileURL(candidate).href, context)
      }
    }

    if (specifier.startsWith('.') && !/\.[a-z0-9]+$/i.test(specifier) && context.parentURL?.startsWith('file:')) {
      for (const extension of EXTENSIONS) {
        const candidate = new URL(`${specifier}${extension}`, context.parentURL)
        if (existsSync(fileURLToPath(candidate))) return nextResolve(candidate.href, context)
      }
    }

    return nextResolve(specifier, context)
  },
})
