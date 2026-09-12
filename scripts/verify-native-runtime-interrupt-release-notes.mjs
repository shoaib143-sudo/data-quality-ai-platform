import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const notes = readFileSync('docs/native-runtime-interrupt-lifecycle-release-notes.md', 'utf8')
assert.match(notes, /Only a resolved `APPROVED` interrupt can resume/)
assert.match(notes, /Human approval and manual-review timeouts are escalated/)
assert.match(notes, /cannot change the timeout result/)
console.log('native runtime interrupt release notes verification passed')
