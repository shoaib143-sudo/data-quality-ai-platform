import assert from 'node:assert/strict'
import fs from 'node:fs'

const utility=fs.readFileSync('components/app-shell/global-utility-bar.tsx','utf8')
const skip=fs.readFileSync('components/app-shell/skip-to-content.tsx','utf8')

assert.ok(utility.includes('<SkipToContent targetId="workspace-content-start" />'), 'shared shell skip link must target content after the repeated utility navigation')
assert.ok(utility.includes('<div id="workspace-content-start" tabIndex={-1}'), 'shared shell must expose a programmatically focusable post-navigation target')
const skipIndex=utility.indexOf('<SkipToContent targetId="workspace-content-start" />')
const headerIndex=utility.indexOf('<header')
const targetIndex=utility.indexOf('<div id="workspace-content-start"')
assert.ok(skipIndex >= 0 && headerIndex > skipIndex && targetIndex > headerIndex, 'skip link must precede navigation and target content after navigation')
assert.ok(skip.includes('href={') && skip.includes('targetId'), 'SkipToContent must bind its href to the requested focus target')
assert.ok(skip.includes('focus:not-sr-only'), 'skip link must become visible on keyboard focus')
assert.ok(skip.includes('focus:fixed'), 'skip link must remain visible and operable when focused')

console.log('Shared skip-link bypass contract passed.')
