import assert from 'node:assert/strict'
import fs from 'node:fs'
import { resolve } from 'node:path'

const repositoryRoot = resolve(import.meta.dirname, '..')
const read = (path) => fs.readFileSync(resolve(repositoryRoot, path), 'utf8')

const dockerfile = read('services/jdbc-bridge/Dockerfile.vercel')
const config = JSON.parse(read('services/jdbc-bridge/vercel.json'))
const application = read('services/jdbc-bridge/src/main/resources/application.properties')
const controller = read('services/jdbc-bridge/src/main/java/com/datanexus/jdbcbridge/JdbcBridgeController.java')
const workflow = read('.github/workflows/jdbc-bridge.yml')
const docs = read('docs/vercel-jdbc-bridge-poc.md')

assert.equal(config.fluid, true, 'Vercel JDBC PoC must use Fluid compute')
assert.equal(config.git?.deploymentEnabled, false, 'Vercel JDBC PoC must not enable automatic Git deployments')
assert.equal(config.services?.jdbc?.runtime, 'container', 'Vercel JDBC PoC must declare an explicit container service')
assert.equal(config.services?.jdbc?.root, '.', 'Vercel JDBC PoC container service must use the service directory as its root')
assert.equal(config.services?.jdbc?.entrypoint, 'Dockerfile.vercel', 'Vercel JDBC PoC must explicitly bind Dockerfile.vercel')
assert.deepEqual(config.rewrites, [{ source: '/(.*)', destination: { service: 'jdbc' } }], 'Vercel JDBC PoC must route all public traffic to the JDBC container service')
assert.match(dockerfile, /eclipse-temurin:21-jre/, 'Vercel JDBC PoC must remain on Java 21')
assert.match(dockerfile, /^USER 10001$/m, 'Vercel JDBC PoC container must run non-root')
assert.match(dockerfile, /^CMD \["sh", "-c", "exec java \$JAVA_OPTS -jar \/app\/app\.jar"\]$/m, 'Vercel JDBC PoC must launch the existing Spring Boot app')
assert.match(application, /server\.port=\$\{PORT:10000\}/, 'Bridge must bind Vercel-provided PORT')
assert.match(controller, /JDBC_BRIDGE_TECHNICAL_MAX_RESPONSE_BYTES", 3_500_000, 256_000, 4_000_000/, 'Bridge must enforce a response budget below Vercel 4.5 MB ceiling')
assert.match(controller, /Response payload safety ceiling reached/, 'Bridge must surface deterministic payload truncation evidence')
assert.match(workflow, /workflow_dispatch:/, 'JDBC workflow must support manual PoC probing')
assert.match(workflow, /Build Vercel JDBC PoC container/, 'CI must build Dockerfile.vercel')
assert.match(workflow, /Verify Vercel JDBC PoC contract/, 'CI must enforce the Vercel PoC contract')
assert.doesNotMatch(workflow, /vercel\s+(deploy|--prod)/, 'CI must not deploy the PoC automatically')
assert.match(docs, /Production JDBC_BRIDGE_URL remains unchanged/, 'PoC documentation must preserve the production cutover boundary')
assert.match(docs, /private or allowlisted database connectivity is not certified/i, 'PoC documentation must preserve the private-networking caveat')

console.log('Vercel JDBC bridge proof-of-fit contract passed.')
