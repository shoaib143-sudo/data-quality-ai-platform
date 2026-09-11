import { readFile } from 'node:fs/promises'

const checks = [
  ['app/data-quality/rules/rule-manager.tsx', [
    [/grid gap-3 sm:grid-cols-2/, 'quality-rule paired fields stack on narrow screens'],
    [/grid gap-2 sm:grid-cols-3/, 'quality-rule edit controls stack on narrow screens'],
  ]],
  ['app/workflows/workflow-manager-v3.tsx', [
    [/grid gap-2 text-center text-\[10px\] font-bold sm:grid-cols-3/, 'workflow capability summary stacks on narrow screens'],
  ]],
  ['app/scorecards/scorecard-manager-v2.tsx', [
    [/flex w-full flex-col items-stretch gap-2 sm:w-auto sm:flex-row sm:items-end/, 'scorecard selector and refresh action stack on narrow screens'],
    [/w-full rounded-xl sm:min-w-64/, 'scorecard project selector avoids forced mobile width'],
  ]],
  ['app/reports/report-manager.tsx', [
    [/w-full text-sm font-semibold text-slate-700 sm:w-auto sm:min-w-72/, 'report selector avoids forced mobile width'],
  ]],
]

for (const [path, assertions] of checks) {
  const source = await readFile(path, 'utf8')
  for (const [pattern, label] of assertions) {
    if (!pattern.test(source)) throw new Error(`${path} missing ${label}`)
    console.log(`PASS ${label}`)
  }
}

console.log('DataNexus responsive governance controls verification completed.')
