import assert from 'node:assert/strict'
import fs from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const read = (path) => fs.readFileSync(resolve(root, path), 'utf8')

const dockerfile = read('services/jdbc-bridge/Dockerfile.vercel')
const config = JSON.parse(read('services/jdbc-bridge/vercel.json'))
const authFilter = read('services/jdbc-bridge/src/main/java/com/datanexus/jdbcbridge/BridgeAuthFilter.java')
const controller = read('services/jdbc-bridge/src/main/java/com/datanexus/jdbcbridge/JdbcBridgeController.java')
const controllerTests = read('services/jdbc-bridge/src/test/java/com/datanexus/jdbcbridge/JdbcBridgeControllerTest.java')
const workflow = read('.github/workflows/jdbc-bridge.yml')
const docs = read('docs/vercel-jdbc-bridge-poc.md')

assert.equal(config.git?.deploymentEnabled, false, 'adversarial: automatic Vercel Git deployment must stay disabled')
assert.equal(config.fluid, true, 'adversarial: PoC must remain on Fluid compute')
assert.match(dockerfile, /^USER 10001$/m, 'adversarial: container must not run as root')
assert.doesNotMatch(dockerfile, /^ENV .*?(PASSWORD|TOKEN|SECRET|KEY)=/gim, 'adversarial: secrets must never be baked into the image')
assert.match(authFilter, /requestUri\.equals\("\/"\) \|\| requestUri\.equals\("\/health"\)/, 'adversarial: only root and health may bypass bridge auth')
assert.match(authFilter, /response\.sendError\(503, "Bridge authentication is not configured\."\)/, 'adversarial: missing bridge token must fail closed')
assert.match(authFilter, /response\.sendError\(401, "Unauthorized\."\)/, 'adversarial: bad bearer token must fail closed')
assert.match(controller, /connection\.setReadOnly\(true\)/, 'adversarial: JDBC connection must remain read-only')
assert.match(controller, /JDBC_BRIDGE_TECHNICAL_MAX_RESPONSE_BYTES/, 'adversarial: transport byte ceiling must remain enforced')
assert.match(controllerTests, /rejectsEmbeddedJdbcCredentials/, 'adversarial: embedded credential rejection must remain covered')
assert.match(controllerTests, /capsQueryResponseBeforeVercelPayloadLimit/, 'adversarial: oversized response behavior must remain covered')
assert.doesNotMatch(workflow, /\bvercel\s+(deploy|--prod)\b/i, 'adversarial: CI must not perform a Vercel deployment')
assert.match(workflow, /github\.event_name == 'workflow_dispatch'/, 'adversarial: live PoC probe must require explicit dispatch')
assert.match(docs, /Production JDBC_BRIDGE_URL remains unchanged/, 'adversarial: production cutover boundary must remain explicit')
assert.match(docs, /Private or allowlisted database connectivity is not certified by this PoC/i, 'adversarial: unsupported enterprise networking must not be implied as certified')

console.log('Independent adversarial Vercel JDBC PoC audit passed.')
