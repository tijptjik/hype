import { chromium, firefox } from 'playwright'
import { mkdir, readFile } from 'node:fs/promises'
const base = process.env.FEATURE_CHECK_URL ?? 'http://127.0.0.1:4173'
const output = 'output/playwright/optimistic-gallery-order'
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
const taskMock = `
const entry = id => ({imageRevisionId:id,intent:id==='a'?'canonical':'general',isPublished:id!=='c',caption:{en:''},alt:{en:id}});
const entries=Object.fromEntries(['c','b','a'].map(id=>[id,entry(id)]));
let review=JSON.parse(localStorage.getItem('review')||'null')||{taskId:'task',proposalId:'proposal',proposalVersion:'v1',featureId:'feature',reviewId:null,currentRevisionId:null,currentGeneration:0,status:'submitted',stale:false,initialProposal:true,excluded:[],intentOrder:['canonical','general','undefined'],imageIds:['c','b','a'],
content:{gallery:{order:['c','b','a'],entries}},submitted:{gallery:{order:['c','b','a'],entries:structuredClone(entries)}},images:Object.fromEntries(['a','b','c'].map((id,index)=>[id,{createdAt:'2026-01-0'+(3-index),metadata:{presentationMode:'contain'},originalMetadata:{presentationMode:'contain'},originalRevisionId:id}]))};
globalThis.requests=[];globalThis.calls=[]; globalThis.sortReleases=[]; globalThis.holdSort=true;
export async function getTaskImageReviews(){return [structuredClone(review)]}
export async function saveTaskImageReview(input){
globalThis.requests.push(input);
if(globalThis.holdSort)await new Promise(resolve=>globalThis.sortReleases.push(resolve));
if(input.expectedReviewId!==review.reviewId)throw Error('Stale review');
if(globalThis.failSort){globalThis.failSort=false;throw Error('Simulated stale review')}
globalThis.calls.push(input);review.reviewId=crypto.randomUUID();globalThis.savedReviewId=review.reviewId;
if(input.patch.order)review.content.gallery.order=input.patch.order;
if(input.patch.sortMode)review.content.gallery.sortMode=input.patch.sortMode;
localStorage.setItem('review',JSON.stringify(review));return structuredClone(review)}
export async function replaceTaskReviewImage(){} export async function acceptTaskImageReview(input){globalThis.acceptInput=input;return {status:'accepted'}}
`

const featureExports = [
  ...(await readFile('src/lib/api/featureRevisions.remote.ts', 'utf8')).matchAll(
    /^export const (\w+)/gm,
  ),
]
  .map(match => match[1])
  .filter(
    name =>
      !['getFeatureGalleryRevisionEditor', 'saveFeatureGalleryRevision'].includes(name),
  )
  .map(name => `export async function ${name}(){return null}`)
  .join('\n')
const featureMock =
  featureExports +
  `
let revision=0;
let gallery={order:['c','b','a'],entries:Object.fromEntries(['a','b','c'].map(id=>[id,{imageRevisionId:id,intent:id==='a'?'canonical':'general',isPublished:true,caption:{},alt:{}}]))};
globalThis.requests=[];globalThis.calls=[];globalThis.sortReleases=[];
export async function getFeatureGalleryRevisionEditor(){return {enabled:true,comparisonRevisionId:'v'+revision,gallery:structuredClone(gallery),locales:['en']}}
export async function saveFeatureGalleryRevision(input){
 globalThis.requests.push(input);await new Promise(resolve=>globalThis.sortReleases.push(resolve));
 if(input.baseRevisionId!=='v'+revision)throw Error('Stale gallery');
 if(globalThis.failSort){globalThis.failSort=false;throw Error('Simulated stale review')}
 globalThis.calls.push(input);gallery.order=input.order;gallery.sortMode=input.sortMode;revision++;return {revisionId:'v'+revision}
}
`
for (const [name, engine] of Object.entries({ chromium, firefox })) {
  const browser = await engine.launch()
  try {
    for (const kind of ['task', 'feature'])
      for (const width of process.env.POINTER_SORT_ONLY ? [1280] : [1280, 390])
        for (const fail of process.env.POINTER_SORT_ONLY ? [false] : [false, true]) {
          const page = await browser.newPage({ viewport: { width, height: 1000 } }),
            errors: string[] = []
          page.on('pageerror', error => errors.push(error.message))
          const entry =
            kind === 'task' ? 'taskImageReviewCheck.ts' : 'gallerySortingCheck.ts'
          await page.route('**/__optimistic-order.html*', r =>
            r.fulfill({
              contentType: 'text/html',
              body: `<html data-theme="breadline-light"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>@layer theme,base,components,utilities;</style><script>globalThis.__sveltekit_dev={env:{}}</script></head><body><div id="app"></div><script type="module" src="/src/tests/fixtures/${entry}"></script></body></html>`,
            }),
          )
          await page.route('**/src/lib/api/taskImageReview.remote.*', r =>
            r.fulfill({ contentType: 'application/javascript', body: taskMock }),
          )
          await page.route('**/src/lib/api/featureRevisions.remote.*', r =>
            r.fulfill({ contentType: 'application/javascript', body: featureMock }),
          )
          await page.route('**/src/lib/api/image.remote.*', r =>
            r.fulfill({
              contentType: 'application/javascript',
              body:
                imageExports +
                `export async function getImageIntentOptions(){return {intents:[{id:'canonical',label:'Featured',isPublished:true},{id:'general',label:'General',isPublished:true},{id:'undefined',label:'Unclassified',isPublished:false}]}}`,
            }),
          )
          const svg =
            '<svg xmlns="http://www.w3.org/2000/svg" width="900" height="600"><rect width="900" height="600" fill="#698675"/></svg>'
          await page.route('**/api/images/revisions/**', r =>
            r.fulfill({ contentType: 'image/svg+xml', body: svg }),
          )
          await page.route('**/__sorting-image.svg', r =>
            r.fulfill({ contentType: 'image/svg+xml', body: svg }),
          )
          await page.goto(base + '/__optimistic-order.html?photo&top')
          await page.waitForFunction(
            () =>
              document
                .querySelector('[data-gallery-thumb-id="a"]')
                ?.getAttribute('tabindex') === '0',
          )
          const order = () =>
            page
              .locator('[aria-label="Gallery thumbnails"] > [data-gallery-thumb-id]')
              .evaluateAll(nodes =>
                nodes.map(node => node.getAttribute('data-gallery-thumb-id')!),
              )
          const initial = await order()
          const advance = async (id: string, expected: string[]) => {
            const thumb = page.locator(
              `[aria-label="Gallery thumbnails"] > [data-gallery-thumb-id="${id}"]`,
            )
            if ((await thumb.getAttribute('tabindex')) !== '0')
              throw Error('Pending save disabled the next drag')
            if (process.env.POINTER_SORT_ONLY) {
              await thumb.scrollIntoViewIfNeeded()
              await thumb.evaluate(async node => {
                for (
                  let parent: Element | null = node;
                  parent;
                  parent = parent.parentElement
                )
                  await Promise.all(
                    parent.getAnimations().map(animation => animation.finished),
                  )
              })
              const current = await order(),
                index = current.indexOf(id)
              const target = page.locator(
                `[aria-label="Gallery thumbnails"] > [data-gallery-thumb-id="${current[index + 1]}"]`,
              )
              const from = await thumb.boundingBox(),
                to = await target.boundingBox()
              if (!from || !to) throw Error('Missing drag target')
              await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
              await page.mouse.down()
              await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, {
                steps: 12,
              })
              await page.waitForFunction(() =>
                document.querySelector('#dnd-action-dragged-el'),
              )
              await page.waitForFunction(
                expected =>
                  Array.from(
                    document.querySelectorAll(
                      '[aria-label="Gallery thumbnails"] > [data-gallery-thumb-id]',
                    ),
                  )
                    .map(node => node.getAttribute('data-gallery-thumb-id'))
                    .join(',') === expected,
                expected.join(','),
              )
              await page.mouse.up()
              await page
                .locator('#dnd-action-dragged-el')
                .waitFor({ state: 'detached' })
            } else {
              await thumb.focus()
              await page.keyboard.press('Space')
              await page.keyboard.press(kind === 'task' ? 'ArrowRight' : 'ArrowDown')
              await page.keyboard.press('Space')
            }
            await page.waitForFunction(
              expected =>
                Array.from(
                  document.querySelectorAll(
                    '[aria-label="Gallery thumbnails"] > [data-gallery-thumb-id]',
                  ),
                )
                  .map(node => node.getAttribute('data-gallery-thumb-id'))
                  .join(',') === expected,
              expected.join(','),
            )
          }
          const first = [initial[1], initial[0], initial[2]]
          await advance(initial[0], first)
          await page.waitForFunction(() => (globalThis as any).requests.length === 1)
          await advance(first[0], initial)
          const latest = [initial[0], initial[2], initial[1]]
          await advance(initial[1], latest)
          if ((await page.evaluate(() => (globalThis as any).requests.length)) !== 1)
            throw Error('Overlapping revision writes')
          await page.evaluate(() => (globalThis as any).sortReleases.shift()())
          await page.waitForFunction(() => (globalThis as any).requests.length === 2)
          if ((await order()).join(',') !== latest.join(','))
            throw Error('Old response displaced the latest optimistic order')
          const last = await page.evaluate(() => (globalThis as any).requests[1])
          if ((last.patch?.order ?? last.order).join(',') !== latest.join(','))
            throw Error('Intermediate order was not coalesced')
          if (
            kind === 'feature'
              ? last.baseRevisionId !== 'v1'
              : last.expectedReviewId === null
          )
            throw Error('Latest save used a stale revision token')
          await page.evaluate(fail => {
            ;(globalThis as any).failSort = fail
            ;(globalThis as any).sortReleases.shift()()
          }, fail)
          await page.waitForFunction(
            () =>
              document
                .querySelector('[data-gallery-thumb-id="a"]')
                ?.getAttribute('tabindex') === '0',
          )
          if (fail)
            await page
              .getByText('Simulated stale review', { exact: true })
              .first()
              .waitFor()
          else await page.waitForFunction(() => (globalThis as any).calls.length === 2)
          await page.waitForFunction(
            expected =>
              Array.from(
                document.querySelectorAll(
                  '[aria-label="Gallery thumbnails"] > [data-gallery-thumb-id]',
                ),
              )
                .map(node => node.getAttribute('data-gallery-thumb-id'))
                .join(',') === expected,
            (fail ? first : latest).join(','),
          )
          if (errors.length) throw Error(errors.join('\n'))
          console.log(
            name,
            kind,
            width,
            fail ? 'rollback passed' : 'latest optimistic order passed',
          )
          await page.close()
        }
  } finally {
    await browser.close()
  }
}
