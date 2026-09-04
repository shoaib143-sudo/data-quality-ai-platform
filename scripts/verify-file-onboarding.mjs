import { readFile } from 'node:fs/promises'

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), 'utf8')
}

function requireMatch(text, pattern, message) {
  if (!pattern.test(text)) throw new Error(message)
}

function requireAbsent(text, pattern, message) {
  if (pattern.test(text)) throw new Error(message)
}

const [adapter, remoteGuard, discovery, registration, uploadRoute, datasetRegistration, form] = await Promise.all([
  source('lib/profiling/file-source-adapter.ts'),
  source('lib/profiling/safe-remote-file.ts'),
  source('app/api/datasets/source/discover-file/route.ts'),
  source('app/api/datasets/source/register/route.ts'),
  source('app/api/datasets/source/upload-file/route.ts'),
  source('app/api/datasets/register/route.ts'),
  source('app/datasets/register-dataset-form.tsx'),
])

requireMatch(adapter, /safeRemoteFileFetch/, 'FILE adapter must route remote HTTP reads through safeRemoteFileFetch.')
requireAbsent(adapter, /await\s+fetch\(url\s*,/, 'FILE adapter must not directly fetch caller-controlled remote URLs.')
requireMatch(remoteGuard, /lookup\(hostname,\s*\{\s*all:\s*true/, 'Remote FILE guard must resolve all DNS addresses.')
requireMatch(remoteGuard, /redirect:\s*['"]manual['"]/, 'Remote FILE guard must inspect redirects explicitly.')
requireMatch(remoteGuard, /FILE_REMOTE_ALLOWED_HOSTS/, 'Remote FILE guard must support a production host allowlist.')

for (const [name, text] of [['FILE discovery', discovery], ['source registration', registration]]) {
  requireMatch(text, /dataset-files/, `${name} must constrain Supabase Storage reads to dataset-files.`)
  requireMatch(text, /projects\/\$\{projectId\}\//, `${name} must constrain Storage paths to the active project.`)
}

requireMatch(uploadRoute, /authorizeProject\(user\.id,\s*projectId,\s*['"]source\.manage['"]\)/, 'Dataset upload authorization must require source.manage.')
requireMatch(uploadRoute, /createSignedUploadUrl/, 'Dataset uploads must use signed direct-to-Storage upload authorization.')
requireAbsent(uploadRoute, /request\.formData\(/, 'Dataset upload route must not proxy multipart file bodies through Vercel.')
requireMatch(uploadRoute, /export\s+async\s+function\s+DELETE/, 'Dataset upload route must expose cleanup for failed post-upload validation.')
requireMatch(uploadRoute, /projects\/\$\{projectId\}\/uploads\//, 'Dataset upload objects must remain under the project uploads prefix.')

requireMatch(form, /uploadToSignedUrl/, 'Dataset UI must upload directly to Supabase using the signed token.')
requireMatch(form, /method:\s*['"]DELETE['"]/, 'Dataset UI must remove successfully uploaded objects if source registration fails.')
requireMatch(form, /type=['"]file['"]/, 'Dataset UI must expose an actual file chooser.')

requireMatch(datasetRegistration, /\['file',\s*'csv'\]\.includes\(sourceType\)\s*\?\s*'FILE'/, 'FILE and CSV sources must normalize to profiling execution type FILE.')

console.log(JSON.stringify({
  valid: true,
  contracts: {
    guardedRemoteReads: true,
    tenantScopedStorage: true,
    signedDirectUploads: true,
    failedUploadCleanup: true,
    csvExecutionType: 'FILE',
  },
}, null, 2))
