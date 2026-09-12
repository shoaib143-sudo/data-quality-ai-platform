import {test, expect} from '@playwright/test'
import {SYNTHETIC_SNAPSHOT} from '../../fixtures/execution-monitor/synthetic'
const ROOT = SYNTHETIC_SNAPSHOT.rootId
const QUALITY = SYNTHETIC_SNAPSHOT.runs[2].id
const INVESTIGATOR = SYNTHETIC_SNAPSHOT.runs[3].id
let snapshot: typeof SYNTHETIC_SNAPSHOT
let mutations: string[]
let failRefresh: boolean
let errors: string[]
test.beforeEach(async ({page}) => {
  snapshot = structuredClone(SYNTHETIC_SNAPSHOT); mutations=[]; errors=[]; failRefresh=false
  snapshot.steps=[{id:'synthetic-step',agent_run_id:QUALITY,step_name:'Quality rules',step_order:1,status:'RUNNING',attempt:2,started_at:null,completed_at:null,error_code:null}]
  page.on('pageerror',e=>errors.push(e.message))
  await page.route('**/api/**', async route => {
    const request=route.request(),url=new URL(request.url())
    if(request.method()!=='GET') {mutations.push(url.pathname);await route.fulfill({status:405,json:{error:'Mutations forbidden in synthetic fixture'}});return}
    if(url.pathname.includes('/branches/')) {
      const branch=url.pathname.split('/branches/')[1]
      await route.fulfill({json:{steps:snapshot.steps.filter(s=>s.agent_run_id===branch),attempts:branch===QUALITY?[{evidenceId:'synthetic-old',stepId:'synthetic-step',attempt:1,status:'FAILED',error_code:'SYNTHETIC_RETRY'}]:[],checkpoints:[],events:[],historyCoverage:'Synthetic previous attempt snapshot',nextOffset:null}});return
    }
    if(url.pathname.endsWith('/logs')) {await route.fulfill({json:{logs:[]}});return}
    if(url.pathname==='/api/monitoring/executions') {await route.fulfill({json:{runs:[snapshot.runs[0]],nextOffset:null}});return}
    await route.fulfill(failRefresh?{status:503,json:{error:'Synthetic connection failure'}}:{json:{...snapshot,fetchedAt:new Date().toISOString()}})
  })
})
test.afterEach(()=>{expect(mutations).toEqual([]);expect(errors).toEqual([])})
test('renders hierarchy, waiting dependencies, and synchronized retry details',async({page})=>{
  await page.goto('/')
  await expect(page.getByRole('button',{name:'Governance: running',exact:true})).toBeVisible()
  await page.getByRole('button',{name:'Investigator: waiting',exact:true}).click()
  const panel=page.getByRole('complementary',{name:'Selected branch details'})
  await expect(panel).toContainText('Prerequisite unmet: Data Quality (must succeed)')
  await expect(page).toHaveURL(new RegExp(`branch=${INVESTIGATOR}`))
  await page.getByRole('button',{name:'Data Quality: running',exact:true}).click()
  await expect(panel).toContainText('Quality rules')
  await expect(panel).toContainText('SYNTHETIC_RETRY')
  await expect(panel).toContainText('total unknown')
  await expect(panel.getByRole('progressbar')).toHaveCount(0)
  await page.screenshot({path:'test-results/execution-monitor/living-tree-desktop.png',fullPage:true})
})
test('keyboard selection and Tree/List toggles preserve selected run and zoom',async({page})=>{
  await page.goto('/')
  await page.getByRole('button',{name:'Data Quality: running',exact:true}).press('Enter')
  await page.getByRole('button',{name:'Zoom in',exact:true}).click()
  await expect(page.getByText('125%',{exact:true})).toBeVisible()
  await page.getByRole('button',{name:'List view',exact:true}).click()
  await expect(page.getByRole('button',{pressed:true})).toContainText('Data Quality')
  await page.getByRole('button',{name:'Tree view',exact:true}).click()
  await expect(page.getByText('125%',{exact:true})).toBeVisible()
  await expect(page.getByRole('complementary')).toContainText('Data Quality')
})
test('collapse and expand are read-only and retain the root',async({page})=>{
  await page.goto('/')
  await page.getByRole('button',{name:'Collapse selected branch',exact:true}).click()
  await expect(page.getByRole('button',{name:'Data Quality: running',exact:true})).toHaveCount(0)
  await expect(page.getByRole('button',{name:'Governance: running',exact:true})).toBeVisible()
  await page.getByRole('button',{name:'Expand all',exact:true}).click()
  await expect(page.getByRole('button',{name:'Data Quality: running',exact:true})).toBeVisible()
})
test('recorded plan completion, failure, and changed scope update without moving branches',async({page})=>{
  snapshot.plans=[{version:1,runId:QUALITY,revision:'test-1',complete:true,steps:[{id:'a',runId:QUALITY,name:'Quality rules',order:1,dependsOn:[]},{id:'b',runId:QUALITY,name:'Publish',order:2,dependsOn:['a']}]}]
  snapshot.steps[0].status='SUCCEEDED'
  await page.goto(`/?run=${ROOT}&branch=${QUALITY}`)
  const progress=page.getByRole('progressbar',{name:'Planned step completion'})
  await expect(progress).toHaveAttribute('value','50')
  const rect=page.getByRole('button',{name:'Data Quality: running',exact:true}).locator('rect')
  const x=await rect.getAttribute('x')
  snapshot.runs[2].status='FAILED'
  snapshot.plans[0].steps.push({id:'c',runId:QUALITY,name:'Finalize',order:3,dependsOn:['b']})
  await page.getByRole('button',{name:'Refresh',exact:true}).click()
  await expect(progress).toHaveAttribute('value','33')
  await expect(page.getByRole('button',{name:'Data Quality: failed',exact:true}).locator('rect')).toHaveAttribute('x',x!)
  await expect(page.getByRole('button',{name:'Governance: running',exact:true})).toBeVisible()
})
test('stale connection stops illumination and recovery restores it',async({page})=>{
  await page.clock.install()
  await page.goto('/')
  await expect(page.locator('.tree-pulse').first()).toBeVisible()
  failRefresh=true
  await page.clock.runFor(12000)
  await expect(page.getByRole('status')).toContainText('Updates delayed')
  await expect(page.locator('.tree-pulse')).toHaveCount(0)
  failRefresh=false
  await page.getByRole('button',{name:'Refresh',exact:true}).click()
  await expect(page.locator('.tree-pulse').first()).toBeVisible()
})
test('terminal history does not become stale just because polling stopped',async({page})=>{
  await page.clock.install()
  snapshot.runs=snapshot.runs.map(r=>({...r,status:'SUCCEEDED'}))
  await page.goto('/')
  await expect(page.getByRole('button',{name:'Governance: complete',exact:true})).toBeVisible()
  await page.clock.runFor(30000)
  await expect(page.getByText('Updates delayed.',{exact:false})).toHaveCount(0)
  await expect(page.locator('.tree-pulse')).toHaveCount(0)
})
test('legacy child links restore selection and diagnostics without mutations',async({page})=>{
  await page.goto(`/?run=${QUALITY}`)
  await expect(page.getByRole('complementary')).toContainText('Data Quality')
  await page.getByRole('button',{name:'Open diagnostics',exact:true}).click()
  await expect(page.getByRole('heading',{name:'Execution logs & diagnostics'})).toBeVisible()
  await expect(page.getByLabel('Run to inspect')).toHaveValue(QUALITY)
})
test('reduced motion and mobile layout retain readable controls',async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'})
  await page.setViewportSize({width:390,height:844})
  await page.goto('/')
  await expect(page.getByRole('heading',{name:'Living Tree',exact:true})).toBeVisible()
  await expect(page.locator('.tree-pulse').first()).toHaveCSS('animation-name','none')
  const width=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,window:window.innerWidth}))
  expect(width.scroll).toBeLessThanOrEqual(width.window)
  await page.screenshot({path:'test-results/execution-monitor/living-tree-mobile.png',fullPage:true})
})
test('feature flag uses the same safe list and evidence semantics',async({page})=>{
  await page.goto('/?tree=false')
  await expect(page.getByRole('button',{name:'Tree view',exact:true})).toHaveCount(0)
  await page.getByRole('button',{name:/Investigator · waiting/}).click()
  await expect(page.getByRole('complementary')).toContainText('total unknown')
})
