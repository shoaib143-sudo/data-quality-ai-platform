import assert from 'node:assert/strict'
import fs from 'node:fs'

const workflow = fs.readFileSync('.github/workflows/production-verification-backbone.yml', 'utf8')

assert.match(workflow, /payload_file="\$RUNNER_TEMP\/pr-files-page-\$page\.json"/)
assert.match(workflow, /fs\.readFileSync\(process\.argv\[1\],"utf8"\)/)
assert.doesNotMatch(workflow, /payload="\$\(curl/)
assert.doesNotMatch(workflow, /JSON\.parse\(process\.argv\[1\]\).*"\$payload"/)

console.log('Production Verification Backbone large-PR classification regression verified.')
