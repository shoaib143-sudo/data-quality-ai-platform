import { createClient } from '@supabase/supabase-js';

const baseUrl = process.env.PRODUCTION_URL || 'https://data-quality-ai-platform.vercel.app';
const requests = Number(process.env.BENCHMARK_REQUESTS || 25);
const concurrency = Math.max(1, Number(process.env.BENCHMARK_CONCURRENCY || 5));
const path = process.env.BENCHMARK_PATH || '/login';
const requestTimeoutMs = Number(process.env.BENCHMARK_TIMEOUT_MS || 15000);
const maxP95Ms = Number(process.env.BENCHMARK_MAX_P95_MS || 1500);
const maxP99Ms = Number(process.env.BENCHMARK_MAX_P99_MS || 3000);
const maxErrorRate = Number(process.env.BENCHMARK_MAX_ERROR_RATE || 0.01);
const minSuccessfulRequests = Number(process.env.BENCHMARK_MIN_SUCCESSFUL_REQUESTS || Math.min(20, requests));
const expectedStatuses = new Set(
  (process.env.BENCHMARK_EXPECTED_STATUSES || '200')
    .split(',')
    .map((value) => Number(value.trim()))
    .filter(Number.isFinite),
);

if (!Number.isInteger(requests) || requests < 1 || requests > 5000) throw new Error('BENCHMARK_REQUESTS must be an integer from 1 to 5000');
if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > requests || concurrency > 250) throw new Error('BENCHMARK_CONCURRENCY must be an integer from 1 to min(BENCHMARK_REQUESTS, 250)');
if (!Number.isFinite(requestTimeoutMs) || requestTimeoutMs < 100 || requestTimeoutMs > 120000) throw new Error('BENCHMARK_TIMEOUT_MS must be from 100 to 120000');
if (!Number.isFinite(maxP95Ms) || maxP95Ms <= 0) throw new Error('BENCHMARK_MAX_P95_MS must be positive');
if (!Number.isFinite(maxP99Ms) || maxP99Ms < maxP95Ms) throw new Error('BENCHMARK_MAX_P99_MS must be >= BENCHMARK_MAX_P95_MS');
if (!Number.isFinite(maxErrorRate) || maxErrorRate < 0 || maxErrorRate > 1) throw new Error('BENCHMARK_MAX_ERROR_RATE must be from 0 to 1');
if (!Number.isInteger(minSuccessfulRequests) || minSuccessfulRequests < 1 || minSuccessfulRequests > requests) throw new Error('BENCHMARK_MIN_SUCCESSFUL_REQUESTS must be from 1 to BENCHMARK_REQUESTS');
if (expectedStatuses.size === 0) throw new Error('BENCHMARK_EXPECTED_STATUSES must contain at least one HTTP status');

const url = new URL(path, baseUrl).toString();
const samples = [];
let cursor = 0;
const benchmarkStartedAt = new Date();
const benchmarkStarted = performance.now();

async function worker() {
  while (true) {
    const index = cursor++;
    if (index >= requests) return;
    const started = performance.now();
    try {
      const response = await fetch(url, {
        redirect: 'manual',
        cache: 'no-store',
        signal: AbortSignal.timeout(requestTimeoutMs),
      });
      await response.arrayBuffer();
      samples.push({ ms: performance.now() - started, status: response.status });
    } catch (error) {
      samples.push({ ms: performance.now() - started, status: 'ERROR', error: error instanceof Error ? error.message : String(error) });
    }
  }
}

await Promise.all(Array.from({ length: concurrency }, () => worker()));

const totalDurationMs = performance.now() - benchmarkStarted;
const successful = samples.filter((sample) => typeof sample.status === 'number' && expectedStatuses.has(sample.status));
const failedHttp = samples.filter((sample) => typeof sample.status === 'number' && !expectedStatuses.has(sample.status));
const transportErrors = samples.filter((sample) => sample.status === 'ERROR');
const latencies = successful.map((sample) => sample.ms).sort((a, b) => a - b);
const percentile = (p) => latencies.length ? latencies[Math.min(latencies.length - 1, Math.ceil(latencies.length * p) - 1)] : null;
const p50 = percentile(0.50);
const p95 = percentile(0.95);
const p99 = percentile(0.99);
const errorRate = (failedHttp.length + transportErrors.length) / samples.length;
const throughputRps = totalDurationMs > 0 ? samples.length / (totalDurationMs / 1000) : 0;
const statusCounts = Object.fromEntries(
  [...new Set(samples.map((sample) => String(sample.status)))].map((status) => [
    status,
    samples.filter((sample) => String(sample.status) === status).length,
  ]),
);

const violations = [];
if (successful.length < minSuccessfulRequests) violations.push(`successful_requests ${successful.length} < ${minSuccessfulRequests}`);
if (errorRate > maxErrorRate) violations.push(`error_rate ${errorRate.toFixed(4)} > ${maxErrorRate.toFixed(4)}`);
if (p95 !== null && p95 > maxP95Ms) violations.push(`p95_ms ${p95.toFixed(2)} > ${maxP95Ms.toFixed(2)}`);
if (p99 !== null && p99 > maxP99Ms) violations.push(`p99_ms ${p99.toFixed(2)} > ${maxP99Ms.toFixed(2)}`);

const report = {
  status: violations.length === 0 ? 'PASSED' : 'FAILED',
  url,
  requests,
  concurrency,
  successful: successful.length,
  failedHttp: failedHttp.length,
  transportErrors: transportErrors.length,
  errorRate: Number(errorRate.toFixed(4)),
  throughputRps: Number(throughputRps.toFixed(2)),
  durationMs: Number(totalDurationMs.toFixed(2)),
  statusCounts,
  latencyMs: latencies.length ? {
    min: Number(latencies[0].toFixed(2)),
    p50: Number(p50.toFixed(2)),
    p95: Number(p95.toFixed(2)),
    p99: Number(p99.toFixed(2)),
    max: Number(latencies[latencies.length - 1].toFixed(2)),
  } : null,
  slo: {
    maxP95Ms,
    maxP99Ms,
    maxErrorRate,
    minSuccessfulRequests,
    expectedStatuses: [...expectedStatuses],
    requestTimeoutMs,
  },
  violations,
};

async function persistReadinessEvidence() {
  const projectId = process.env.READINESS_PROJECT_ID?.trim();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!projectId && !supabaseUrl && !serviceRoleKey) return null;
  if (!projectId || !supabaseUrl || !serviceRoleKey) {
    throw new Error('READINESS_PROJECT_ID, NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must all be set to persist benchmark evidence');
  }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(projectId)) {
    throw new Error('READINESS_PROJECT_ID must be a UUID');
  }
  const client = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await client.schema('orchestration').from('production_readiness_runs').insert({
    project_id: projectId,
    gate_name: 'HTTP_BENCHMARK',
    status: report.status,
    started_at: benchmarkStartedAt.toISOString(),
    completed_at: new Date().toISOString(),
    evidence: report,
    notes: `Automated HTTP benchmark for ${url}`,
  }).select('id,status,completed_at').single();
  if (error) throw new Error(`Unable to persist HTTP benchmark readiness evidence: ${error.message}`);
  return data;
}

const readinessEvidence = await persistReadinessEvidence();
console.log(JSON.stringify({ ...report, readinessEvidence }, null, 2));
if (violations.length > 0) process.exitCode = 1;
