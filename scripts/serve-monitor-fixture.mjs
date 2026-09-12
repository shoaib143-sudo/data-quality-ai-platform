import {createServer} from 'node:http'
import {readFileSync, mkdtempSync, rmSync} from 'node:fs'
import {join, resolve} from 'node:path'
import {tmpdir} from 'node:os'
import {build} from 'esbuild'
const dir = mkdtempSync(join(tmpdir(), 'monitor-browser-'))
await build({entryPoints:['tests/browser/execution-monitor/entry.tsx'],outfile:join(dir,'bundle.js'),bundle:true,jsx:'automatic',platform:'browser',tsconfig:'tsconfig.json',nodePaths:[resolve('node_modules')],define:{'process.env.NODE_ENV':'"development"'}})
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Synthetic Living Tree verification</title><link rel="stylesheet" href="/bundle.css"><style>body{margin:24px;background:#070e18;color:#e2e8f0;font-family:Arial,sans-serif}*{box-sizing:border-box}button{font:inherit}a{color:#93c5fd}#root{max-width:1600px;margin:auto}</style></head><body><p>SYNTHETIC VALIDATION ONLY. No live jobs or credentials.</p><div id="root"></div><script src="/bundle.js"></script></body></html>`
const server = createServer((req,res) => {
  if(req.url === '/bundle.js' || req.url === '/bundle.css') {res.setHeader('Content-Type',req.url.endsWith('css')?'text/css':'text/javascript');res.end(readFileSync(join(dir,req.url.slice(1))));return}
  if(req.url?.startsWith('/api/')) {res.writeHead(503,{'Content-Type':'application/json'});res.end('{"error":"Synthetic APIs must be supplied by the browser test"}');return}
  res.setHeader('Content-Type','text/html');res.end(html)
})
server.listen(4173,'127.0.0.1',()=>console.log('Synthetic monitor fixture ready on port 4173'))
const close = () => server.close(() => {rmSync(dir,{recursive:true,force:true});process.exit(0)})
process.on('SIGTERM',close);process.on('SIGINT',close)
