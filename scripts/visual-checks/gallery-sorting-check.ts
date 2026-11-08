import { chromium, firefox } from 'playwright'
import { mkdir, readFile } from 'node:fs/promises'
const base = process.env.FEATURE_CHECK_URL ?? 'http://127.0.0.1:4173'
const output = 'output/playwright/gallery-sorting'
await mkdir(output, { recursive: true })
const imageExports = [
  ...(await readFile('src/lib/api/image.remote.ts', 'utf8')).matchAll(
    /^export const (\w+)/gm,
  ),
]
  .map(match => match[1])
  .filter(name => name !== 'getImageIntentOptions')
  .map(name => `export async function ${name}(){return []}`)
  .join('\n')
const mock = `
const entry = id => ({imageRevisionId:id,intent:id==='a'?'canonical':'general',isPublished:id!=='c',caption:{en:''},alt:{en:id}});
const entries=Object.fromEntries(['c','b','a'].map(id=>[id,entry(id)]));
let review=JSON.parse(localStorage.getItem('review')||'null')||{taskId:'task',proposalId:'proposal',proposalVersion:'v1',featureId:null,reviewId:null,currentRevisionId:null,currentGeneration:0,status:'submitted',stale:false,initialProposal:true,excluded:[],intentOrder:['canonical','general','undefined'],imageIds:['c','b','a'],
content:{gallery:{order:['c','b','a'],entries}},submitted:{gallery:{order:['c','b','a'],entries:structuredClone(entries)}},images:Object.fromEntries(['a','b','c'].map((id,index)=>[id,{createdAt:'2026-01-0'+(3-index),metadata:{presentationMode:'contain'},originalMetadata:{presentationMode:'contain'},originalRevisionId:id}]))};
globalThis.calls=[];
export async function getTaskImageReviews(){return [structuredClone(review)]}
export async function saveTaskImageReview(input){
if(input.expectedReviewId!==review.reviewId)throw Error('Stale review');
if(globalThis.failSort){globalThis.failSort=false;throw Error('Simulated stale review')}
globalThis.calls.push(input);review.reviewId=crypto.randomUUID();
if(input.patch.order)review.content.gallery.order=input.patch.order;
if(input.patch.sortMode)review.content.gallery.sortMode=input.patch.sortMode;
localStorage.setItem('review',JSON.stringify(review));return structuredClone(review)}
export async function replaceTaskReviewImage(){} export async function acceptTaskImageReview(){}
`
for (const [name, engine] of Object.entries({ chromium, firefox })) {
  const browser = await engine.launch()
  try {
    for (const width of [1280, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } })
      const errors: string[] = []
      page.on('pageerror', e => {
        errors.push(e.message)
        console.log('PAGE ERROR', e.message)
      })
      await page.route('**/__gallery-sorting.html', r =>
        r.fulfill({
          contentType: 'text/html',
          body: '<html lang="en" data-theme="breadline-light"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>@layer theme,base,components,utilities;</style><script>globalThis.__sveltekit_dev={env:{}}</script></head><body><div id="app"></div><script type="module" src="/src/tests/fixtures/taskImageReviewCheck.ts"></script></body></html>',
        }),
      )
      await page.route('**/src/lib/api/taskImageReview.remote.*', r =>
        r.fulfill({ contentType: 'application/javascript', body: mock }),
      )
      await page.route('**/src/lib/api/image.remote.*', r =>
        r.fulfill({
          contentType: 'application/javascript',
          body:
            imageExports +
            `export async function getImageIntentOptions(){return {intents:[{id:'canonical',label:'Featured',isPublished:true},{id:'general',label:'General',isPublished:true},{id:'undefined',label:'Unclassified',isPublished:false}]}}`,
        }),
      )
      await page.route('**/api/images/revisions/**', r =>
        r.fulfill({
          contentType: 'image/svg+xml',
          body: '<svg xmlns="http://www.w3.org/2000/svg" width="900" height="600"><rect width="900" height="600" fill="#698675"/></svg>',
        }),
      )
      await page.goto(base + '/__gallery-sorting.html')
      const sorting = page.getByRole('button', {
        name: 'Automatic image sorting',
        exact: true,
      })
      const undo = page.getByRole('button', {
        name: 'Restore manual image order',
        exact: true,
      })
      await page.locator('[data-gallery-thumb-id="a"]').waitFor({ timeout: 60000 })
      const order = () =>
        page
          .locator('[aria-label="Gallery thumbnails"] > [data-gallery-thumb-id]')
          .evaluateAll(nodes =>
            nodes.map(n => n.getAttribute('data-gallery-thumb-id')).join(','),
          )
      if (
        (await order()) !== 'a,b,c' ||
        (await sorting.count()) ||
        (await undo.count())
      )
        throw Error('Fresh automatic gallery exposes manual tools')
      const first = page.locator('[data-gallery-thumb-id="a"]')
      await first.focus()
      await page.keyboard.press('Space')
      await page.waitForTimeout(100)
      await page.keyboard.press('ArrowRight')
      await page.waitForTimeout(250)
      await page.keyboard.press('Space')
      await page.waitForFunction(() => (globalThis as any).calls.length === 1)
      await sorting.waitFor()
      await page.waitForTimeout(300)
      if ((await order()) !== 'b,a,c' || (await undo.count()))
        throw Error('Manual drag did not expose only restore-auto')
      if (
        await sorting.evaluate(node => Boolean(node.closest('[data-gallery-thumb-id]')))
      )
        throw Error('Controls are attached to a thumbnail')
      const anchor = await sorting.boundingBox()
      await page
        .locator('[data-gallery-thumb-id="b"]')
        .getByRole('button', { name: 'b', exact: true })
        .click()
      const afterSelection = await sorting.boundingBox()
      if (anchor?.x !== afterSelection?.x || anchor?.y !== afterSelection?.y)
        throw Error('Controls moved with selection')
      await page
        .locator('[aria-label="Gallery thumbnails"]')
        .evaluate(node => (node.scrollLeft = 100))
      const afterScroll = await sorting.boundingBox()
      if (anchor?.x !== afterScroll?.x || anchor?.y !== afterScroll?.y)
        throw Error('Controls scrolled with thumbnails')
      await page
        .locator('[aria-label="Gallery thumbnails"]')
        .evaluate(node => (node.scrollLeft = 0))
      const rail = await sorting.boundingBox()
      const photo = await first
        .getByRole('button', { name: 'a', exact: true })
        .boundingBox()
      if (!rail || !photo || rail.x + rail.width > photo.x)
        throw Error('Sorting control overlaps the photo')
      await sorting.click()
      await undo.waitFor()
      if ((await order()) !== 'a,b,c') throw Error('Automatic order was not restored')
      if ((await sorting.count()) || (await undo.count()) !== 1)
        throw Error('Automatic sort must be replaced by one reset control')
      await undo.click()
      await page.waitForFunction(() => (globalThis as any).calls.length === 3)
      if ((await order()) !== 'b,a,c' || (await undo.count()))
        throw Error('Undo did not recover the exact manual arrangement')
      await page.reload()
      await sorting.waitFor()
      if ((await order()) !== 'b,a,c' || (await undo.count()))
        throw Error('Reload lost manual arrangement')
      await page.evaluate(() => {
        ;(globalThis as any).failSort = true
      })
      await sorting.click()
      await page.getByText('Simulated stale review', { exact: true }).first().waitFor()
      if ((await order()) !== 'b,a,c' || (await undo.count()))
        throw Error('Failure lost the manual arrangement')
      await sorting.click()
      await undo.waitFor()
      await page.waitForTimeout(300)
      await page.screenshot({
        path: output + '/' + name + '-' + width + '-auto-undo.png',
        fullPage: true,
      })
      await page.reload()
      await page.locator('[data-gallery-thumb-id="a"]').waitFor()
      if (
        (await order()) !== 'a,b,c' ||
        (await sorting.count()) ||
        (await undo.count())
      )
        throw Error('Saved automatic gallery retained manual tools after reload')
      if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth))
        throw Error('Overflow')
      if (errors.length) throw Error(errors.join('\n'))
      await page.screenshot({
        path: output + '/' + name + '-' + width + '.png',
        fullPage: true,
      })
      console.log(
        name,
        width,
        'left rail, manual recovery, reload and error recovery passed',
      )
      await page.close()
    }
  } finally {
    await browser.close()
  }
}
