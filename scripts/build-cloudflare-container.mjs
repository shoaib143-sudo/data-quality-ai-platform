import fs from 'node:fs'
import { spawnSync } from 'node:child_process'

function readArg(name) {
  const index = process.argv.indexOf(name)
  if (index < 0 || !process.argv[index + 1]) {
    throw new Error(`Missing required argument: ${name}`)
  }
  return process.argv[index + 1]
}

const configPath = readArg('--config')
const tag = readArg('--tag')
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'))
const container = config.containers?.[0]

if (!container || typeof container.image !== 'string' || !container.image.endsWith('Dockerfile')) {
  throw new Error(`Cloudflare config ${configPath} must reference a Dockerfile container image`)
}

const imageVars = container.image_vars ?? {}
for (const required of ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY']) {
  if (typeof imageVars[required] !== 'string' || !imageVars[required].trim()) {
    throw new Error(`Cloudflare config ${configPath} is missing required image_vars.${required}`)
  }
}

const args = ['build', '--tag', tag]
for (const [name, value] of Object.entries(imageVars)) {
  args.push('--build-arg', `${name}=${value}`)
}
args.push('.')

const result = spawnSync('docker', args, { stdio: 'inherit' })
if (result.error) throw result.error
if (result.status !== 0) process.exit(result.status ?? 1)
