import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("Vercel deploys only the main branch", async () => {
  const config = JSON.parse(
    await readFile(new URL("../vercel.json", import.meta.url), "utf8"),
  );

  assert.deepEqual(config.git?.deploymentEnabled, {
    "*": false,
    main: true,
  });
});
