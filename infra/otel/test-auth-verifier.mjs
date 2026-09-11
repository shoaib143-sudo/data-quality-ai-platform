import http from 'node:http'
import { timingSafeEqual } from 'node:crypto'

const port = Number.parseInt(process.env.OTLP_TEST_AUTH_PORT || '14319', 10)
const expected = process.env.OTLP_TEST_AUTHORIZATION || 'Bearer otel-runtime-contract-test-token'

function matches(value) {
  if (!value) return false
  const left = Buffer.from(value, 'utf8')
  const right = Buffer.from(expected, 'utf8')
  return left.length === right.length && timingSafeEqual(left, right)
}

http.createServer((request, response) => {
  if (request.method !== 'POST' || request.url !== '/verify') {
    response.writeHead(404)
    response.end()
    return
  }
  response.writeHead(matches(request.headers.authorization) ? 204 : 401, { 'cache-control': 'no-store' })
  response.end()
}).listen(port, '127.0.0.1', () => {
  console.log(`OTLP test auth verifier listening on ${port}`)
})
