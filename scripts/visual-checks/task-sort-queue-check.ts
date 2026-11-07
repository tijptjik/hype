import { chromium, firefox } from 'playwright'
import { mkdir, readFile } from 'node:fs/promises'
const base = process.env.FEATURE_CHECK_URL ?? 'http://127.0.0.1:4173'
const output = 'output/playwright/task-sort-queue'
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
let review=JSON.parse(localStorage.getItem('review')||'null')||{taskId:'task',proposalId:'proposal',proposalVersion:'v1',featureId:'feature',reviewId:null,currentRevisionId:null,currentGeneration:0,status:'submitted',stale:false,initialProposal:true,excluded:[],intentOrder:['canonical','general','undefined'],imageIds:['c','b','a'],
content:{gallery:{order:['c','b','a'],entries}},submitted:{gallery:{order:['c','b','a'],entries:structuredClone(entries)}},images:Object.fromEntries(['a','b','c'].map((id,index)=>[id,{createdAt:'2026-01-0'+(3-index),metadata:{presentationMode:'contain'},originalMetadata:{presentationMode:'contain'},originalRevisionId:id}]))};
globalThis.calls=[]; globalThis.sortReleases=[]; globalThis.holdSort=true;
export async function getTaskImageReviews(){return [structuredClone(review)]}
export async function saveTaskImageReview(input){
if(globalThis.holdSort)await new Promise(resolve=>globalThis.sortReleases.push(resolve));
if(input.expectedReviewId!==review.reviewId)throw Error('Stale review');
if(globalThis.failSort){globalThis.failSort=false;throw Error('Simulated stale review')}
globalThis.calls.push(input);review.reviewId=crypto.randomUUID();globalThis.savedReviewId=review.reviewId;
if(input.patch.order)review.content.gallery.order=input.patch.order;
if(input.patch.sortMode)review.content.gallery.sortMode=input.patch.sortMode;
localStorage.setItem('review',JSON.stringify(review));return structuredClone(review)}
export async function replaceTaskReviewImage(){} export async function acceptTaskImageReview(input){globalThis.acceptInput=input;return {status:'accepted'}}
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
      await page.route('**/__gallery-sorting.html*', r =>
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
      await page.goto(base + '/__gallery-sorting.html?photo&top')
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
      await page.keyboard.press('ArrowRight')
      await page.keyboard.press('Space')
      await page.waitForFunction(() => (globalThis as any).sortReleases.length === 1)
      await sorting.waitFor()
      const accept = page.getByRole('button', { name: 'Accept All', exact: true })
      if ((await sorting.isDisabled()) || (await accept.isDisabled()))
        throw Error('Sorting locked automatic sorting or acceptance')
      if (
        (await page.locator('[data-review-busy]').getAttribute('data-review-busy')) !==
        'false'
      )
        throw Error('Sorting locked the task header')
      await sorting.click()
      await accept.click()
      if (await page.evaluate(() => Boolean((globalThis as any).acceptInput)))
        throw Error('Acceptance raced the pending order')
      await page.evaluate(() => (globalThis as any).sortReleases.shift()())
      await page.waitForFunction(() => (globalThis as any).sortReleases.length === 1)
      if (await page.evaluate(() => Boolean((globalThis as any).acceptInput)))
        throw Error('Acceptance skipped queued automatic ordering')
      await page.evaluate(() => (globalThis as any).sortReleases.shift()())
      await page.waitForFunction(() => Boolean((globalThis as any).acceptInput))
      const saved = await page.evaluate(() => ({
        calls: (globalThis as any).calls,
        accepted: (globalThis as any).acceptInput,
        reviewId: (globalThis as any).savedReviewId,
      }))
      if (
        saved.calls.length !== 2 ||
        saved.calls[0].patch.sortMode !== 'manual' ||
        saved.calls[1].patch.sortMode !== 'automatic'
      )
        throw Error('Unexpected order sequence')
      if (
        saved.calls[1].expectedReviewId === null ||
        saved.accepted.expectedReviewId !== saved.reviewId
      )
        throw Error('Queued action used stale review tokens')
      if ((await order()) !== 'a,b,c')
        throw Error('Queued automatic ordering did not apply')
      // A failed predecessor cancels queued ordering, acceptance and the task-header waiter.
      await page.evaluate(() => localStorage.clear())
      await page.reload()
      await first.waitFor()
      await page.evaluate(() => {
        ;(globalThis as any).failSort = true
      })
      await first.focus()
      await page.keyboard.press('Space')
      await page.keyboard.press('ArrowRight')
      await page.keyboard.press('Space')
      await page.waitForFunction(() => (globalThis as any).sortReleases.length === 1)
      await sorting.click()
      await accept.click()
      await page.evaluate(() => {
        void (globalThis as any).waitForImageOrder().then((result: boolean) => {
          ;(globalThis as any).waitResult = result
        })
      })
      await page.evaluate(() => (globalThis as any).sortReleases.shift()())
      await page.waitForFunction(() => (globalThis as any).waitResult === false)
      if (
        await page.evaluate(
          () =>
            Boolean((globalThis as any).acceptInput) ||
            (globalThis as any).calls.length !== 0 ||
            (globalThis as any).sortReleases.length !== 0,
        )
      )
        throw Error('Failed ordering allowed a dependent action')
      if ((await order()) !== 'a,b,c')
        throw Error('Failed ordering did not restore saved order')
      if (errors.length) throw Error(errors.join('\n'))
      console.log(
        name,
        width,
        'queued order, latest acceptance tokens and failure cancellation passed',
      )
      await page.close()
    }
  } finally {
    await browser.close()
  }
}
