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

const automaticPreviewBranchPrefixes = [
  'ux/',
  'preview/',
  'feat/ui-',
  'fix/ui-',
  'feat/frontend-',
  'fix/frontend-',
]

export function requiresProductionPreview(files) {
  return files.some((file) =>
    deployableExact.has(file) || deployablePrefixes.some((prefix) => file.startsWith(prefix)),
  )
}

export function automaticPreviewEnabledForBranch(branch) {
  const normalized = String(branch ?? '').trim()
  return automaticPreviewBranchPrefixes.some((prefix) => normalized.startsWith(prefix))
}

export function requiresAutomaticProductionPreview(branch, files) {
  return automaticPreviewEnabledForBranch(branch) && requiresProductionPreview(files)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2)
  if (args[0] === '--branch') {
    const branch = args[1] ?? ''
    process.stdout.write(requiresAutomaticProductionPreview(branch, args.slice(2)) ? 'true' : 'false')
  } else {
    process.stdout.write(requiresProductionPreview(args) ? 'true' : 'false')
  }
}
