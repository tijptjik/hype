import { chromium, firefox } from 'playwright'
import { mkdir, readFile } from 'node:fs/promises'
const base = process.env.FEATURE_CHECK_URL ?? 'http://127.0.0.1:4173'
const output = 'output/playwright/unclassified-rail'
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
const entry = id => ({imageRevisionId:id,intent:id==='c'?'undefined':id==='a'?'canonical':'general',isPublished:id!=='c',caption:{en:''},alt:{en:id}});
const entries=Object.fromEntries(['c','b','a'].map(id=>[id,entry(id)]));
let review=JSON.parse(localStorage.getItem('review')||'null')||{taskId:'task',proposalId:'proposal',proposalVersion:'v1',featureId:null,reviewId:null,currentRevisionId:null,currentGeneration:0,status:'submitted',stale:false,initialProposal:true,excluded:[],intentOrder:['canonical','general','undefined'],imageIds:['c','b','a'],
content:{gallery:{order:['c','b','a'],entries}},submitted:{gallery:{order:['c','b','a'],entries:structuredClone(entries)}},images:Object.fromEntries(['a','b','c'].map((id,index)=>[id,{createdAt:'2026-01-0'+(3-index),metadata:{presentationMode:'contain'},originalMetadata:{presentationMode:'contain'},originalRevisionId:id}]))};
globalThis.calls=[];
export async function getTaskImageReviews(){return [structuredClone(review)]}
export async function saveTaskImageReview(input){
if(input.expectedReviewId!==review.reviewId)throw Error('Stale review');
if(globalThis.failSort){globalThis.failSort=false;throw Error('Simulated stale review')}
globalThis.calls.push(input);review.reviewId=crypto.randomUUID();
if(input.patch.intent)review.content.gallery.entries[input.patch.imageId].intent=input.patch.intent;
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
      const thumb = page.locator('[data-gallery-thumb-id="c"]')
      await thumb.waitFor({ timeout: 60000 })
      const order = () =>
        page
          .locator('[aria-label="Gallery thumbnails"] > [data-gallery-thumb-id]')
          .evaluateAll(nodes =>
            nodes.map(n => n.getAttribute('data-gallery-thumb-id')).join(','),
          )
      if ((await order()) !== 'c,a,b')
        throw Error('Unclassified photo was not first: ' + (await order()))
      const label = thumb.getByText('Unclassified', { exact: true })
      const fits = await label.evaluate(node => node.scrollWidth <= node.clientWidth)
      if (!fits) throw Error('Unclassified label is truncated')
      const labelBox = await label.boundingBox(),
        thumbBox = await thumb.boundingBox()
      if (
        !labelBox ||
        !thumbBox ||
        labelBox.x < thumbBox.x ||
        labelBox.x + labelBox.width > thumbBox.x + thumbBox.width
      )
        throw Error('Label exceeds thumbnail width')
      await page.screenshot({
        path: output + '/' + name + '-' + width + '.png',
        fullPage: true,
      })
      await label.click()
      await page.getByRole('button', { name: 'General', exact: true }).click()
      await page.waitForFunction(
        () =>
          Array.from(
            document.querySelectorAll(
              '[aria-label="Gallery thumbnails"] > [data-gallery-thumb-id]',
            ),
          )
            .map(n => n.getAttribute('data-gallery-thumb-id'))
            .join(',') === 'a,b,c',
      )
      if (errors.length) throw Error(errors.join('\n'))
      console.log(
        name,
        width,
        'unclassified first, full label and classification reordering passed',
      )
      await page.close()
    }
  } finally {
    await browser.close()
  }
}
