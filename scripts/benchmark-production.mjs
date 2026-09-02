const baseUrl = process.env.PRODUCTION_URL || 'https://data-quality-ai-platform.vercel.app';
const requests = Number(process.env.BENCHMARK_REQUESTS || 25);
const concurrency = Math.max(1, Number(process.env.BENCHMARK_CONCURRENCY || 5));
const path = process.env.BENCHMARK_PATH || '/login';

if (!Number.isInteger(requests) || requests < 1 || requests > 500) {
  throw new Error('BENCHMARK_REQUESTS must be an integer from 1 to 500');
}
if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > requests) {
  throw new Error('BENCHMARK_CONCURRENCY must be an integer from 1 to BENCHMARK_REQUESTS');
}

const url = new URL(path, baseUrl).toString();
const samples = [];
let cursor = 0;

async function worker() {
  while (true) {
    const index = cursor++;
    if (index >= requests) return;
    const started = performance.now();
    try {
      const response = await fetch(url, { redirect: 'manual', cache: 'no-store' });
      samples.push({ ms: performance.now() - started, status: response.status });
      await response.arrayBuffer();
    } catch (error) {
      samples.push({ ms: performance.now() - started, status: 'ERROR', error: String(error) });
    }
  }
}

await Promise.all(Array.from({ length: concurrency }, () => worker()));

const successful = samples.filter((sample) => typeof sample.status === 'number');
const latencies = successful.map((sample) => sample.ms).sort((a, b) => a - b);
const percentile = (p) => latencies[Math.min(latencies.length - 1, Math.floor((latencies.length - 1) * p))];
const statusCounts = Object.fromEntries(
  [...new Set(samples.map((sample) => String(sample.status)))].map((status) => [
    status,
    samples.filter((sample) => String(sample.status) === status).length,
  ]),
);

console.log(JSON.stringify({
  url,
  requests,
  concurrency,
  successful: successful.length,
  errors: samples.length - successful.length,
  statusCounts,
  latencyMs: latencies.length ? {
    min: Number(latencies[0].toFixed(2)),
    p50: Number(percentile(0.5).toFixed(2)),
    p95: Number(percentile(0.95).toFixed(2)),
    max: Number(latencies[latencies.length - 1].toFixed(2)),
  } : null,
}, null, 2));

if (successful.length !== requests || successful.some((sample) => sample.status !== 200)) {
  process.exitCode = 1;
}
