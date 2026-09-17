#!/usr/bin/env node

const files = process.argv.slice(2)

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

const deployable = files.some((file) =>
  deployableExact.has(file) || deployablePrefixes.some((prefix) => file.startsWith(prefix)),
)

process.stdout.write(deployable ? 'true' : 'false')
