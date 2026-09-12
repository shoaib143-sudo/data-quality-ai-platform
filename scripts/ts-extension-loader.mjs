import { access } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

export async function resolve(specifier, context, nextResolve) {
  if ((specifier.startsWith('./') || specifier.startsWith('../')) && !/\.[a-z0-9]+$/i.test(specifier)) {
    const candidate = new URL(`${specifier}.ts`, context.parentURL)
    try {
      await access(fileURLToPath(candidate))
      return nextResolve(candidate.href, context)
    } catch {
      // Fall through to Node's normal resolver for directories and non-TS modules.
    }
  }
  return nextResolve(specifier, context)
}
