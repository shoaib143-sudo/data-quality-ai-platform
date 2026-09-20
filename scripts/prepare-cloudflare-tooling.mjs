import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const toolRoot = path.join(process.env.RUNNER_TEMP || os.tmpdir(), 'datanexus-cloudflare-tools')
const workspaceContainers = path.resolve('node_modules/@cloudflare/containers')

fs.rmSync(toolRoot, { recursive: true, force: true })
fs.mkdirSync(toolRoot, { recursive: true })
fs.writeFileSync(path.join(toolRoot, 'package.json'), JSON.stringify({
  private: true,
  dependencies: {
    '@cloudflare/containers': '0.3.7',
    wrangler: '4.131.1',
  },
}, null, 2) + '\n')

const install = spawnSync('pnpm', ['--dir', toolRoot, 'install', '--frozen-lockfile=false'], {
  stdio: 'inherit',
  env: {
    ...process.env,
    CI: 'true',
  },
})
if (install.error) throw install.error
if (install.status !== 0) process.exit(install.status ?? 1)

const installedContainers = path.join(toolRoot, 'node_modules/@cloudflare/containers')
const wranglerBin = path.join(toolRoot, 'node_modules/.bin/wrangler')

if (!fs.existsSync(installedContainers)) {
  throw new Error('Pinned @cloudflare/containers installation is missing from isolated tooling workspace')
}
if (!fs.existsSync(wranglerBin)) {
  throw new Error('Pinned Wrangler installation is missing from isolated tooling workspace')
}

fs.mkdirSync(path.dirname(workspaceContainers), { recursive: true })
try {
  const stat = fs.lstatSync(workspaceContainers)
  if (!stat.isSymbolicLink()) {
    throw new Error('Refusing to replace a non-symlink node_modules/@cloudflare/containers entry')
  }
  fs.unlinkSync(workspaceContainers)
} catch (error) {
  if (!(error && typeof error === 'object' && error.code === 'ENOENT')) throw error
}

fs.symlinkSync(installedContainers, workspaceContainers, process.platform === 'win32' ? 'junction' : 'dir')

console.log(JSON.stringify({
  toolRoot,
  wranglerBin,
  containersPackage: fs.realpathSync(workspaceContainers),
}))
