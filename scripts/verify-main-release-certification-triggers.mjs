import fs from 'node:fs'

const p0 = fs.readFileSync('.github/workflows/p0-p4-revalidation.yml', 'utf8')
const v6 = fs.readFileSync('.github/workflows/v6-operational-certification.yml', 'utf8')

function requireMainPush(text, label) {
  const onBlock = text.split('\npermissions:')[0]
  if (!/push:\s*[\s\S]*?branches:\s*(?:\n\s*-\s*main|\[main\])/m.test(onBlock)) {
    throw new Error(`${label} must execute on every push to protected main`)
  }
  if (/push:\s*[\s\S]*?paths(?:-ignore)?:/m.test(onBlock)) {
    throw new Error(`${label} main-push certification must not be path-filtered`)
  }
}

requireMainPush(p0, 'P0-P5 Revalidation')
requireMainPush(v6, 'V6 Operational Certification')

if (!/jobs:\s*[\s\S]*?revalidate:/m.test(p0)) throw new Error('P0-P5 workflow must retain revalidate job')
if (!/jobs:\s*[\s\S]*?certify:/m.test(v6)) throw new Error('V6 workflow must retain certify job')
if (!v6.includes('clean-database-reconstruction:')) throw new Error('V6 must retain clean database reconstruction')
if (!v6.includes('runtime-slo:')) throw new Error('V6 must retain runtime SLO certification')

console.log('Protected-main release certification triggers verified: exact merge SHA receives revalidate and certify without path filtering.')
