import fs from 'node:fs'

const landing = fs.readFileSync('components/governance/role-landing-page.tsx', 'utf8')
const page = fs.readFileSync('app/home/[persona]/page.tsx', 'utf8')

const checks = [
  ['Data Domain label is singular and canonical', landing.includes('aria-label="Data Domain"')],
  ['All Data Domains option is canonical', landing.includes('<option value="overall">All Data Domains</option>')],
  ['Data Domain table header is canonical', landing.includes('>Data Domain</th>')],
  ['domain query parameter remains wired', landing.includes('name="domain"') && page.includes('requested.domain')],
  ['trend scope filters by selected domain', page.includes("requestedDomain !== 'overall'") && page.includes("dataset.business_domain || 'Unassigned'")],
]

const failures = checks.filter(([,ok]) => !ok)
for (const [name,ok] of checks) console.log(`${ok?'PASS':'FAIL'} ${name}`)
if (failures.length) process.exit(1)
console.log('PASS Data Domain filter contract')
