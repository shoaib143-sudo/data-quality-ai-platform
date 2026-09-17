#!/usr/bin/env node

const deployablePrefixes = [
  'app/',
  'components/',
  'lib/',
  'public/',
  'styles/',
]

const deployableExact = new Set([
  'package.json',
  'pnpm-lock.yaml',
  'next.config.js',
  'next.config.mjs',
  'next.config.ts',
  'middleware.ts',
  'vercel.json',
])

export function requiresProductionPreview(files) {
  return files.some((file) =>
    deployableExact.has(file) || deployablePrefixes.some((prefix) => file.startsWith(prefix)),
  )
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.stdout.write(requiresProductionPreview(process.argv.slice(2)) ? 'true' : 'false')
}
