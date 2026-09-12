import fs from 'node:fs'

const source = fs.readFileSync('app/home/[persona]/page.tsx', 'utf8')
const strict = "hasOwner: Boolean(stewardship && upper(stewardship.coverage_status) === 'ACCOUNTABLE'),"
const permissive = "hasOwner: Boolean(stewardship && upper(stewardship.coverage_status) !== 'UNASSIGNED'),"

if (!source.includes(strict)) {
  throw new Error('Ownership coverage must count only ACCOUNTABLE stewardship coverage')
}
if (source.includes(permissive)) {
  throw new Error('PARTIAL stewardship coverage must not be presented as accountable ownership')
}

console.log('Accountable ownership coverage truth semantics verified.')
