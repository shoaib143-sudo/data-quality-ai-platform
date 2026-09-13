import {createServer} from 'node:http'
import {readFileSync, writeFileSync, mkdtempSync, rmSync} from 'node:fs'
import {join, resolve} from 'node:path'
import {tmpdir} from 'node:os'
import {build} from 'esbuild'
import postcss from 'postcss'
import tailwindcss from '@tailwindcss/postcss'
const dir = mkdtempSync(join(tmpdir(), 'monitor-browser-'))
// next/link is used by the real execution-actions component. Next normally
// inlines these routing constants; this isolated esbuild fixture must supply
// the same defaults as next.config.mjs. Do not shim the whole process object:
// unexpected server environment access should still fail browser acceptance.
const define = {
  'process.env.NODE_ENV': '"development"',
  'process.env.__NEXT_ROUTER_BASEPATH': '""',
  'process.env.__NEXT_TRAILING_SLASH': 'false',
  'process.env.__NEXT_MANUAL_TRAILING_SLASH': 'false',
  'process.env.__NEXT_MANUAL_CLIENT_BASE_PATH': 'false',
  'process.env.__NEXT_I18N_SUPPORT': 'false',
  'process.env.__NEXT_LINK_NO_TOUCH_START': 'false',
}
await build({entryPoints:['tests/browser/execution-monitor/entry.tsx'],outfile:join(dir,'bundle.js'),bundle:true,jsx:'automatic',platform:'browser',tsconfig:'tsconfig.json',nodePaths:[resolve('node_modules')],define})
// Include the real application theme and utility styles so screenshot review
// covers the existing diagnostics/actions as well as the tree's own CSS.
const globalCss = await postcss([tailwindcss()]).process(readFileSync('app/globals.css','utf8'), {from:resolve('app/globals.css')})
const bundleCss = join(dir,'bundle.css')
writeFileSync(bundleCss,globalCss.css+'\n'+readFileSync(bundleCss,'utf8'))
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Synthetic Living Tree verification</title><link rel="stylesheet" href="/bundle.css"><style>body{margin:24px;background:#070e18;color:#e2e8f0;font-family:Arial,sans-serif}*{box-sizing:border-box}button{font:inherit}a{color:#93c5fd}#root{max-width:1600px;margin:auto}</style></head><body><p>SYNTHETIC VALIDATION ONLY. No live jobs or credentials.</p><div id="root"></div><script src="/bundle.js"></script></body></html>`
const server = createServer((req,res) => {
  if(req.url === '/bundle.js' || req.url === '/bundle.css') {res.setHeader('Content-Type',req.url.endsWith('css')?'text/css':'text/javascript');res.end(readFileSync(join(dir,req.url.slice(1))));return}
  if(req.url?.startsWith('/api/')) {res.writeHead(503,{'Content-Type':'application/json'});res.end('{"error":"Synthetic APIs must be supplied by the browser test"}');return}
  res.setHeader('Content-Type','text/html');res.end(html)
})
server.listen(4173,'127.0.0.1',()=>console.log('Synthetic monitor fixture ready on port 4173'))
const close = () => server.close(() => {rmSync(dir,{recursive:true,force:true});process.exit(0)})
process.on('SIGTERM',close);process.on('SIGINT',close)
