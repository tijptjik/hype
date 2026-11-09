// PLAYWRIGHT
import { chromium, firefox } from 'playwright'
// NODE
import assert from 'node:assert/strict'
import { mkdir, readFile } from 'node:fs/promises'
const base = process.env.FEATURE_CHECK_URL ?? 'http://localhost:5175'
const output = 'output/playwright/staff-save'
await mkdir(output, { recursive: true })
const imageExports = [
  ...(await readFile('src/lib/api/image.remote.ts', 'utf8')).matchAll(
    /^export const (\w+)/gm,
  ),
]
  .map(match => match[1])
  .filter(name => !['updateImage', 'rotateImage'].includes(name))
  .map(name => `export async function ${name}(){return []}`)
  .join('\n')
for (const [name, engine] of Object.entries({ chromium, firefox })) {
  const browser = await engine.launch({ headless: true })
  try {
    for (const manager of [true, false]) {
      const page = await browser.newPage({ viewport: { width: 390, height: 900 } })
      const errors: string[] = []
      page.on('pageerror', error => errors.push(error.message))
      await page.route('**/__staff-save.html', route =>
        route.fulfill({
          contentType: 'text/html',
          body: '<html lang="en" data-theme="hype-light"><head><meta name="viewport" content="width=device-width,initial-scale=1"><script>globalThis.__sveltekit_dev={env:{}}</script></head><body><div id="app"></div><script type="module" src="/src/tests/fixtures/staffSaveCheck.ts"></script></body></html>',
        }),
      )
      await page.route('**/src/lib/api/locationCorrections.remote.*', route =>
        route.fulfill({
          contentType: 'application/javascript',
          body: `
        let revision=null;let current='Original';globalThis.staffSaveCalls=[];
        export async function getLocationCorrectionWorkspace(){return {locationId:'location',version:'v1',organisationRevision:revision,
          current:{names:{en:current},phoneNumber:[],brands:[]},canReview:${manager},canEditFacts:false,proposals:[]}}
        export async function submitLocationCorrection(input){globalThis.staffSaveCalls.push(input);${manager ? "current=input.patch.names.en.value;revision='accepted';return {status:'accepted',revisionId:revision}" : "return {status:'submitted',id:'proposal'}"}}
        export async function reviewLocationCorrection(){throw Error('Staff save must not request review')}
      `,
        }),
      )
      await page.route('**/src/lib/api/image.remote.*', route =>
        route.fulfill({
          contentType: 'application/javascript',
          body:
            imageExports +
            `
          globalThis.imageSaveCalls=[];
          export async function updateImage(input){globalThis.imageSaveCalls.push(input);return {data:null,revisionAccepted:{revisionId:'feature-2'}}}
          export async function rotateImage(input){globalThis.imageSaveCalls.push(input);return {data:null,revisionAccepted:{revisionId:'feature-3'}}}
        `,
        }),
      )
      await page.goto(base + '/__staff-save.html')
      await page.locator('summary').click()
      await page
        .getByRole('combobox', { name: 'Name (en)', exact: true })
        .selectOption('override')
      await page
        .locator('label')
        .filter({ hasText: /^Name \(en\)/ })
        .locator('input')
        .fill('Saved staff name')
      await page
        .getByRole('textbox', { name: 'Reason for the correction', exact: true })
        .fill('Corrected spelling')
      await page
        .getByRole('button', {
          name: manager ? 'Save shared correction' : 'Submit shared correction',
          exact: true,
        })
        .click()
      const status = page.getByRole('status')
      await status.waitFor()
      assert.match(
        await status.innerText(),
        manager
          ? /^Shared correction saved\./
          : /submitted for separate Organisation review/,
      )
      assert.equal(
        await page.evaluate(
          () =>
            (globalThis as unknown as { staffSaveCalls: unknown[] }).staffSaveCalls
              .length,
        ),
        1,
      )
      if (manager) {
        await page
          .getByRole('combobox', { name: 'Name (en)', exact: true })
          .selectOption('override')
        assert.equal(
          await page
            .locator('label')
            .filter({ hasText: /^Name \(en\)/ })
            .locator('input')
            .inputValue(),
          'Saved staff name',
        )
      }
      assert.deepEqual(errors, [])
      await page.screenshot({
        path: `${output}/${name}-${manager ? 'manager' : 'feature-editor'}.png`,
        fullPage: true,
      })
      console.log(
        `${name}: ${manager ? 'manager direct save and refresh' : 'shared-resource permission boundary'} passed`,
      )
      if (manager) {
        // Run the real Svelte image-context methods against accepted remote receipts and a bounded viewer.
        const imageResult = await page.evaluate(async () => {
          const path = '/src/lib/context/image.svelte.ts'
          const { ImageCtx } = await import(path)
          const viewer = Object.create(ImageCtx.prototype)
          let current = { image: { id: 'photo', imageRevisionId: 'image-1' } }
          let refreshes = 0
          Object.defineProperty(viewer, 'state', {
            value: {
              context: { featureId: 'fixture' },
              images: new Map(),
              activeImage: null,
            },
          })
          viewer.getCtx = () => ({ ctxType: 'feature', ctxId: 'fixture' })
          viewer.getImage = () => current
          viewer.reconcileImageMutation = async () => {}
          viewer.refreshImages = async () => {
            refreshes++
            current = {
              image: { id: 'photo', imageRevisionId: `image-${refreshes + 1}` },
            }
          }
          const metadata = await viewer.updateMetadata('photo', {
            presentationMode: 'cover',
          })
          const rotation = await viewer.handleRotate(90, 'photo')
          const calls = (
            globalThis as unknown as { imageSaveCalls: { imageRevisionId: string }[] }
          ).imageSaveCalls
          return {
            metadata,
            rotation,
            refreshes,
            pins: calls.map(call => call.imageRevisionId),
            current: current.image.imageRevisionId,
          }
        })
        assert.deepEqual(imageResult, {
          metadata: 'saved',
          rotation: 'saved',
          refreshes: 2,
          pins: ['image-1', 'image-2'],
          current: 'image-3',
        })
        console.log(`${name}: image metadata and rotation refresh accepted pins passed`)
      }
      await page.close()
    }
  } finally {
    await browser.close()
  }
}
