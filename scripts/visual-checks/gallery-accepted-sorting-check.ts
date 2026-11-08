import { chromium, firefox } from 'playwright'
import { readFile, mkdir } from 'node:fs/promises'
const base = process.env.FEATURE_CHECK_URL ?? 'http://localhost:5175'
await mkdir('output/playwright/gallery-sorting', { recursive: true })
const stubs = [
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
const mock =
  stubs +
  `
let revision=0;
let gallery={order:['c','b','a'],entries:Object.fromEntries(['a','b','c'].map(id=>[id,{imageRevisionId:id,intent:id==='a'?'canonical':'general',isPublished:true,caption:{},alt:{}}]))};
globalThis.calls=[];
export async function getFeatureGalleryRevisionEditor(){globalThis.readCount=(globalThis.readCount||0)+1;return {enabled:true,comparisonRevisionId:'v'+revision,gallery:structuredClone(gallery),locales:['en']}}
export async function saveFeatureGalleryRevision(input){globalThis.sortSaving=true;await new Promise(resolve=>setTimeout(resolve,500));globalThis.sortSaving=false;if(input.baseRevisionId!=='v'+revision)throw Error('Stale gallery');globalThis.calls.push(input);gallery.order=input.order;gallery.sortMode=input.sortMode;revision++;return {revisionId:'v'+revision}}
`
for (const [name, engine] of Object.entries({ chromium, firefox })) {
  const browser = await engine.launch()
  try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 900 } }),
      errors: string[] = []
    page.on('pageerror', e => {
      errors.push(e.message)
      console.log(e.message)
    })
    await page.route('**/__accepted-sorting.html', r =>
      r.fulfill({
        contentType: 'text/html',
        body: '<html data-theme="breadline-light"><head><style>@layer theme,base,components,utilities;</style><script>globalThis.__sveltekit_dev={env:{}}</script></head><body><div id="app"></div><script type="module" src="/src/tests/fixtures/gallerySortingCheck.ts"></script></body></html>',
      }),
    )
    await page.route('**/src/lib/api/featureRevisions.remote.*', r =>
      r.fulfill({ contentType: 'application/javascript', body: mock }),
    )
    await page.route('**/__sorting-image.svg', r =>
      r.fulfill({
        contentType: 'image/svg+xml',
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="900" height="600"><rect width="900" height="600" fill="#698675"/></svg>',
      }),
    )
    await page.goto(base + '/__accepted-sorting.html')
    const sort = page.getByRole('button', {
      name: 'Automatic image sorting',
      exact: true,
    })
    const first = page.locator('[data-gallery-thumb-id="a"]')
    await page.waitForFunction(
      () =>
        document
          .querySelector('[data-gallery-thumb-id="a"]')
          ?.getAttribute('tabindex') === '0',
    )
    if (await sort.count())
      throw Error('Automatic gallery shows sorting controls before a drag')
    await first.focus()
    await page.keyboard.press('Space')
    await page.waitForTimeout(100)
    await page.keyboard.press('ArrowDown')
    await page.waitForTimeout(250)
    await page.keyboard.press('Space')
    await page.waitForFunction(() => (globalThis as any).sortSaving === true)
    if (!(await sort.isVisible()) || !(await sort.isEnabled()))
      throw Error('Magic sort must remain actionable during manual reorder save')
    await page.waitForFunction(() => (globalThis as any).calls.length === 1)
    await page.waitForFunction(
      () =>
        document.querySelector<HTMLButtonElement>(
          '[aria-label="Automatic image sorting"]',
        )?.disabled === false,
    )
    const saved = await page.evaluate(() => (globalThis as any).calls[0])
    if (
      saved.sortMode !== 'manual' ||
      saved.order.join(',') !== 'c,a,b' ||
      saved.baseRevisionId !== 'v0'
    )
      throw Error(JSON.stringify(saved))
    if (
      (await page.locator('[data-active-image]').getAttribute('data-active-image')) !==
      'a'
    )
      throw Error('Drag changed selection')
    await page.waitForTimeout(300)
    const control = await sort.boundingBox(),
      photo = await first.getByRole('button', { name: 'a', exact: true }).boundingBox()
    const footer = await page
      .getByRole('navigation')
      .filter({ has: sort })
      .boundingBox()
    if (
      !control ||
      !photo ||
      !footer ||
      control.y < footer.y ||
      control.y + control.height > footer.y + footer.height ||
      control.y < photo.y + photo.height
    )
      throw Error('Sorting control is not in the bottom toolbar')
    await sort.click()
    const undo = page.getByRole('button', { name: 'Restore manual image order' })
    await undo.waitFor()
    if (!(await undo.isEnabled()))
      throw Error(
        'Optimistic reset must remain actionable while automatic sorting saves',
      )
    if ((await sort.count()) || (await undo.count()) !== 1)
      throw Error('Expected only the reset control')
    await page.waitForFunction(() => (globalThis as any).sortSaving === true)
    await undo.click()
    await page.waitForFunction(() => (globalThis as any).calls.length === 3)
    await page.waitForFunction(
      () =>
        document.querySelector<HTMLButtonElement>(
          '[aria-label="Automatic image sorting"]',
        )?.disabled === false,
    )
    const restored = await page.evaluate(() => (globalThis as any).calls[2])
    if (
      restored.baseRevisionId !== 'v2' ||
      restored.sortMode !== 'manual' ||
      restored.order.join(',') !== 'c,a,b'
    )
      throw Error('Manual restore did not use refreshed revision and saved arrangement')
    if (await page.getByText(/could not be cloned/i).count())
      throw Error('Gallery snapshot failed to clone')
    if (errors.length) throw Error(errors.join('\n'))
    await page.waitForTimeout(300)
    await page.screenshot({
      path: `output/playwright/gallery-sorting/${name}-accepted.png`,
    })
    console.log(
      name,
      'accepted adapter, keyboard ordering, stable selection and guarded undo passed',
    )
  } finally {
    await browser.close()
  }
}
