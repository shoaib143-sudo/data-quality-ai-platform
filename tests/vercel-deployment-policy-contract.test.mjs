import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const config = JSON.parse(
  await readFile(new URL("../vercel.json", import.meta.url), "utf8"),
);
const releaseWorkflow = await readFile(
  new URL("../.github/workflows/release-governance.yml", import.meta.url),
  "utf8",
);

test("Vercel automatic Git deployments are disabled", () => {
  assert.equal(config.git?.deploymentEnabled, false);
});

test("Vercel production certification only accepts the current protected main SHA", () => {
  const start = releaseWorkflow.indexOf("  certify-vercel-production:");
  assert.notEqual(start, -1);
  const certification = releaseWorkflow.slice(start);

  assert.match(certification, /Checkout current protected main/);
  assert.match(certification, /ref: main/);
  assert.match(certification, /CURRENT_MAIN_SHA="\$\(git rev-parse HEAD\)"/);
  assert.match(certification, /test "\$EXPECTED_SHA" = "\$CURRENT_MAIN_SHA"/);
  assert.match(certification, /Requested Vercel certification SHA is stale/);
});

test("Vercel certification verifies live identity, readiness, and protected R2 boundary", () => {
  const start = releaseWorkflow.indexOf("  certify-vercel-production:");
  const certification = releaseWorkflow.slice(start);

  assert.match(certification, /\/api\/health\/live/);
  assert.match(certification, /\/api\/build-info/);
  assert.match(certification, /\/api\/health\/ready/);
  assert.match(certification, /\/api\/health\/supabase/);
  assert.match(certification, /\/api\/health\/release-schema/);
  assert.match(certification, /cloudflare-supabase-release-v1/);
  assert.match(certification, /\/api\/internal\/storage\/certify-r2/);
  assert.match(certification, /test "\$code" = "401"/);
});
