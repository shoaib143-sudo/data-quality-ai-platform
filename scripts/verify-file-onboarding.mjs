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

const [adapter, csvSource, textDecoding, remoteGuard, discovery, registration, uploadRoute, datasetRegistration, form, metricEngine, smokeFixture] = await Promise.all([
  source('lib/profiling/file-source-adapter.ts'),
  source('lib/profiling/csv-source.ts'),
  source('lib/profiling/text-decoding.ts'),
  source('lib/profiling/safe-remote-file.ts'),
  source('app/api/datasets/source/discover-file/route.ts'),
  source('app/api/datasets/source/register/route.ts'),
  source('app/api/datasets/source/upload-file/route.ts'),
  source('app/api/datasets/register/route.ts'),
  source('app/datasets/register-dataset-form.tsx'),
  source('lib/profiling/metric-engine.ts'),
  source('public/test-fixtures/profiling-lifecycle-smoke.csv'),
])

requireMatch(adapter, /safeRemoteFileFetch/, 'FILE adapter must route remote HTTP reads through safeRemoteFileFetch.')
requireAbsent(adapter, /await\s+fetch\(url\s*,/, 'FILE adapter must not directly fetch caller-controlled remote URLs.')
requireMatch(remoteGuard, /lookup\(hostname,\s*\{\s*all:\s*true/, 'Remote FILE guard must resolve all DNS addresses.')
requireMatch(remoteGuard, /redirect:\s*['"]manual['"]/, 'Remote FILE guard must inspect redirects explicitly.')
requireMatch(remoteGuard, /FILE_REMOTE_ALLOWED_HOSTS/, 'Remote FILE guard must support a production host allowlist.')

requireMatch(adapter, /import\s+\{\s*parseCsv\s*\}\s+from\s+['"]@\/lib\/profiling\/csv-source['"]/, 'FILE adapter must use the governed CSV parser module.')
requireMatch(adapter, /import\s+\{\s*decodeTextBytes\s*\}\s+from\s+['"]@\/lib\/profiling\/text-decoding['"]/, 'FILE adapter must use the governed BOM-aware text decoder.')
requireMatch(adapter, /const\s+decodedText\s*=\s*decodeTextBytes\(bytes\)/, 'FILE adapter must decode source bytes before format detection and parsing.')
requireMatch(adapter, /text_encoding:\s*decodedText\.encoding/, 'FILE metadata must retain the detected text encoding.')
requireMatch(adapter, /text_bom:\s*decodedText\.hadBom/, 'FILE metadata must retain whether a BOM was present.')
requireAbsent(adapter, /new\s+TextDecoder\(['"]utf-8['"]\s*,\s*\{\s*fatal:\s*false\s*\}\)\.decode\(bytes\)/, 'FILE adapter must not force every source through UTF-8 decoding.')
requireMatch(textDecoding, /UTF16_LE_BOM/, 'Text decoding must recognize UTF-16 LE BOM input.')
requireMatch(textDecoding, /UTF16_BE_BOM/, 'Text decoding must recognize UTF-16 BE BOM input.')
requireMatch(textDecoding, /UTF8_BOM/, 'Text decoding must recognize UTF-8 BOM input.')
requireMatch(textDecoding, /TextDecoder\(['"]utf-16le['"]/, 'Text decoding must use an explicit UTF-16 LE decoder.')

requireMatch(csvSource, /function\s+coerceCsvScalar\(/, 'CSV adapter must apply scalar coercion before profiling.')
requireMatch(csvSource, /\^\(true\|false\)\$/i, 'CSV scalar coercion must recognize explicit boolean values.')
requireMatch(csvSource, /function\s+strictCsvNumber\(/, 'CSV scalar coercion must use strict numeric parsing.')
requireMatch(csvSource, /name===['"]id['"]\|\|name\.endsWith\(['"]_id['"]\)/, 'CSV scalar coercion must preserve identifier columns as text.')
requireMatch(csvSource, /phone\|mobile\|zip\|postal\|postcode/, 'CSV scalar coercion must preserve phone and postal identifier columns as text.')
requireMatch(csvSource, /if\(value===null\)return null/, 'CSV scalar coercion must preserve null values.')
requireMatch(csvSource, /if\(value===['"]['"]\|\|value\.trim\(\)===['"]['"]\)return value/, 'CSV scalar coercion must preserve blank and whitespace-only values for quality metrics.')
requireMatch(csvSource, /\(\?:0\|\[1-9\]\\d\*\)/, 'CSV numeric coercion must reject ambiguous leading-zero integers.')
requireMatch(csvSource, /coerceCsvScalar\(header,record\[index\]\?\?null\)/, 'Parsed CSV rows must use the governed scalar coercion path.')
requireMatch(csvSource, /export\s+function\s+normalizeCsvHeaders\(/, 'CSV parser must normalize headers through an executable governed helper.')
requireMatch(csvSource, /occurrence===1\?base:`\$\{base\}__\$\{occurrence\}`/, 'Duplicate CSV headers must receive deterministic lossless suffixes.')

requireMatch(smokeFixture, /CUST-0011,Karen Goh,karen\.goh@example\.com,SG,36,true/, 'CSV lifecycle fixture must preserve the approved remediated email value.')
requireMatch(metricEngine, /function\s+isBlank\(value:\s*unknown\)/, 'Metric engine must explicitly distinguish blank strings from SQL null values.')
requireMatch(metricEngine, /const\s+completenessMissingCount\s*=\s*nullCount\s*\+\s*blankCount/, 'Completeness missing count must include null and blank values exactly once.')
requireMatch(metricEngine, /const\s+completenessMissingRate\s*=\s*rowCount\s*\?\s*completenessMissingCount\s*\/\s*rowCount\s*:\s*0/, 'Completeness rate must use null plus blank values as the missing denominator.')
requireMatch(metricEngine, /candidateKeyConfidence\s*=\s*rowCount\s*\?\s*round\(uniqueRate\s*\*\s*\(1\s*-\s*completenessMissingRate\)\)/, 'Candidate-key confidence must be reduced by blank-aware missingness.')
requireMatch(metricEngine, /completeness_rate:\s*round\(completenessRate\)/, 'Column metric results must expose blank-aware completeness to scoring.')
requireMatch(metricEngine, /const\s+completeness\s*=\s*results\.length\s*\?\s*results\.reduce\(\(sum,\s*result\)\s*=>\s*sum\s*\+\s*result\.completeness_rate/, 'Global completeness score must aggregate the blank-aware column completeness rate.')

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

await import('./test-file-source-csv.mjs')
await import('./test-file-source-text-decoding.mjs')

console.log(JSON.stringify({
  valid: true,
  contracts: {
    guardedRemoteReads: true,
    tenantScopedStorage: true,
    signedDirectUploads: true,
    failedUploadCleanup: true,
    csvExecutionType: 'FILE',
    csvScalarTyping: true,
    identifierPreservation: true,
    duplicateHeaderPreservation: true,
    blankPreservation: true,
    blankAwareCompleteness: true,
    blankAwareCandidateKeys: true,
    bomAwareTextDecoding: true,
    textEncodingEvidence: true,
  },
}, null, 2))
