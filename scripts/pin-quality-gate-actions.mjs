import fs from 'node:fs'

const path = '.github/workflows/quality-gate.yml'
const source = fs.readFileSync(path, 'utf8')
const replacements = new Map([
  ['actions/checkout@v4', 'actions/checkout@11d5960a326750d5838078e36cf38b85af677262'],
  ['pnpm/action-setup@v4', 'pnpm/action-setup@b906affcce14559ad1aafd4ab0e942779e9f58b1'],
  ['actions/setup-node@v4', 'actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020'],
  ['actions/setup-java@v5', 'actions/setup-java@b6effb05e454b25005698d916606bdc6ffcbf961'],
])

let next = source
for (const [from, to] of replacements) next = next.replaceAll(from, to)

for (const from of replacements.keys()) {
  if (next.includes(from)) throw new Error(`Unpinned action reference remains: ${from}`)
}

if (next === source) {
  console.log('Quality Gate actions already pinned.')
  process.exit(0)
}

fs.writeFileSync(path, next)
console.log('Pinned Quality Gate action references to immutable commits.')
