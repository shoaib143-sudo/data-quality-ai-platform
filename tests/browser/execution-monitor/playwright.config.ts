import {defineConfig} from '@playwright/test'
import {resolve} from 'node:path'
const root = resolve(__dirname, '../../..')
export default defineConfig({
  testDir: '.', testMatch: '*.spec.ts', timeout: 30000, retries: 0, workers: 1,
  reporter: [['list'], ['html', {outputFolder: resolve(root, 'test-results/execution-monitor-report'), open: 'never'}]],
  outputDir: resolve(root, 'test-results/execution-monitor'),
  use: {baseURL: 'http://127.0.0.1:4173', viewport: {width:1440,height:1000}, trace:'retain-on-failure', screenshot:'only-on-failure'},
  webServer: {command: 'node scripts/serve-monitor-fixture.mjs', cwd: root, url:'http://127.0.0.1:4173', reuseExistingServer: false, timeout:30000},
})
