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
  'pnpm-workspace.yaml',
  'pnpm-workspace.yml',
  'tsconfig.json',
  'next.config.js',
  'next.config.mjs',
  'next.config.ts',
  'postcss.config.js',
  'postcss.config.mjs',
  'postcss.config.ts',
  'tailwind.config.js',
  'tailwind.config.mjs',
  'tailwind.config.ts',
  'middleware.ts',
  'proxy.ts',
  'instrumentation.ts',
  'instrumentation-client.ts',
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
