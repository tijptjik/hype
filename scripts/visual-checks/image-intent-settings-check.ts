import { chromium, firefox } from 'playwright'
import { mkdir } from 'node:fs/promises'
import { DEFAULT_IMAGE_INTENTS } from '../../src/lib/images/intents'

const base = process.env.FEATURE_CHECK_URL ?? 'http://localhost:5175'
const output = 'output/playwright/image-intents'
await mkdir(output, { recursive: true })
const settingsMock = `
let policy = { intents: ${JSON.stringify(DEFAULT_IMAGE_INTENTS)}, hubIntents: ${JSON.stringify(DEFAULT_IMAGE_INTENTS)}, inherited: true,
 autoPublishUnclassified: true, version: 0, hubVersion: 0, usage: { research: 12 } };
globalThis.intentSaves = [];
globalThis.intentLoads = 0;
export async function getImageIntentSettings(){ globalThis.intentLoads++; return structuredClone(policy) }
export async function updateImageIntentSettings(input){ globalThis.intentSaves.push(input); policy = {...policy, intents: input.intents ?? policy.hubIntents, inherited: input.intents === null, autoPublishUnclassified: input.autoPublishUnclassified, version: policy.version+1}; return {saved:true} }
`
const publicationMock = `
export async function getUnclassifiedPublicationPreview(){return {count:3,label:'Gallery photos',token:'reviewed'}}
export async function publishUnclassifiedImages(input){globalThis.publicationInput=input;return {count:3}}
`

for (const [name, engine] of [
  ['chromium', chromium],
  ['firefox', firefox],
] as const) {
  const browser = await engine.launch()
  try {
    for (const width of [1440, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 1000 } })
      const errors: string[] = []
      page.on('pageerror', cause => errors.push(cause.message))
      await page.route('**/__image-intents.html', route =>
        route.fulfill({
          contentType: 'text/html',
          body: '<html lang="en" class="bits-theme" data-theme="breadline-light"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>@layer theme,base,components,utilities;</style><script>globalThis.__sveltekit_dev={env:{}}</script></head><body><div id="app"></div><script type="module" src="/src/tests/fixtures/imageIntentSettingsCheck.ts"></script></body></html>',
        }),
      )
      await page.route('**/src/lib/api/imageIntents.remote.*', route =>
        route.fulfill({ contentType: 'application/javascript', body: settingsMock }),
      )
      await page.route('**/src/lib/api/imagePublication.remote.*', route =>
        route.fulfill({ contentType: 'application/javascript', body: publicationMock }),
      )
      await page.goto(`${base}/__image-intents.html`)
      await page.locator('[data-intent-id="research"]').waitFor({ timeout: 45000 })
      const panel = await page
        .getByRole('region', { name: 'Image intents' })
        .boundingBox()
      if (!panel || Math.abs(panel.x) > 1 || Math.abs(panel.width - width) > 1)
        throw new Error(`Image intents panel has outer gutters at ${width}px`)
      await page.getByRole('button', { name: 'About image intent visibility' }).hover()
      await page.getByRole('tooltip').waitFor()
      await page.screenshot({
        path: `${output}/${name}-${width}-tooltip.png`,
        fullPage: true,
      })
      await page.mouse.move(0, 0)
      await page.keyboard.press('Escape')
      await page.getByRole('tooltip').waitFor({ state: 'hidden' })
      const heading = await page
        .getByText('Image Intent', { exact: true })
        .boundingBox()
      const add = await page
        .getByRole('button', { name: 'About image intent visibility' })
        .boundingBox()
      if (
        heading &&
        add &&
        heading.x < add.x + add.width &&
        add.x < heading.x + heading.width &&
        heading.y < add.y + add.height &&
        add.y < heading.y + heading.height
      )
        throw new Error('Header controls overlap title')
      const inherited = page
        .locator('label')
        .filter({ hasText: 'Inherit from Hub' })
        .getByRole('switch')
      // The default inherited catalogue is read-only while automatic publication is enabled.
      const rows = page.locator('[data-intent-id]')
      if (await rows.locator('input, button, [data-intent-grip]').count())
        throw new Error('Inherited rows expose editing controls')
      if (await rows.getByRole('switch').count())
        throw new Error('Inherited visibility should be text')
      await page
        .locator('[data-intent-id="research"]')
        .getByText('Internal', { exact: true })
        .waitFor()
      await page
        .locator('[data-intent-id="canonical"]')
        .getByText('Public', { exact: true })
        .waitFor()
      await page.screenshot({
        path: `${output}/${name}-${width}-initial.png`,
        fullPage: true,
      })
      const inheritedRow = await page
        .locator('[data-intent-id="canonical"]')
        .boundingBox()
      const inheritedCount = await page
        .locator('[data-intent-id="canonical"] [title="Affected images"]')
        .boundingBox()
      await inherited.click()
      await page.waitForFunction(() =>
        document.getAnimations().every(animation => animation.playState !== 'running'),
      )
      const editableRow = await page
        .locator('[data-intent-id="canonical"]')
        .boundingBox()
      const editableCount = await page
        .locator('[data-intent-id="canonical"] [title="Affected images"]')
        .boundingBox()
      if (
        !inheritedRow ||
        !editableRow ||
        !inheritedCount ||
        !editableCount ||
        Math.abs(inheritedRow.y - editableRow.y) > 1 ||
        Math.abs(inheritedRow.height - editableRow.height) > 1 ||
        Math.abs(inheritedCount.x - editableCount.x) > 1
      )
        throw new Error('Inheritance transition shifted rows or columns')
      await page.locator('[data-intent-id="canonical"][draggable="true"]').waitFor()
      const source = await page
        .getByRole('button', { name: 'Reorder Featured', exact: true })
        .boundingBox()
      const target = await page.locator('[data-intent-id="context"]').boundingBox()
      if (!source || !target) throw new Error('Drag rows unavailable')
      await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2)
      await page.mouse.down()
      await page.mouse.move(source.x + source.width / 2, target.y + target.height - 2, {
        steps: 15,
      })
      await page.screenshot({
        path: `${output}/${name}-${width}-drag.png`,
        fullPage: true,
      })
      await page
        .locator('[data-intent-id].drop-after, [data-intent-id].drop-before')
        .waitFor()
      await page.mouse.up()
      const order = await page
        .locator('[data-intent-id]')
        .evaluateAll(rows => rows.map(row => row.getAttribute('data-intent-id')))
      if (order.slice(0, 3).join() !== 'closeUp,context,canonical')
        throw new Error(`Grip reorder failed: ${order}`)
      if (width >= 640) {
        const inputs = await page
          .locator('[data-intent-id] input')
          .evaluateAll(elements =>
            elements.map(element => element.getBoundingClientRect().right),
          )
        if (Math.max(...inputs) - Math.min(...inputs) > 1)
          throw new Error('Intent name columns are misaligned')
      }

      await page.getByRole('textbox', { name: 'General label' }).fill('Gallery photos')
      await page.getByRole('textbox', { name: 'Gallery photos label' }).press('Enter')
      if (
        await page
          .getByRole('textbox', { name: 'Gallery photos label' })
          .evaluate(element => element === document.activeElement)
      )
        throw new Error('Enter did not blur the intent name')
      if (
        await page.evaluate(() =>
          Boolean((globalThis as unknown as { intentDraft?: unknown }).intentDraft),
        )
      )
        throw new Error('Enter unexpectedly submitted the form')

      const loads = await page.evaluate(
        () => (globalThis as unknown as { intentLoads: number }).intentLoads,
      )
      await page.getByRole('button', { name: 'Toggle edit mode' }).click()
      if (
        !(await page
          .getByRole('textbox', { name: 'Gallery photos label' })
          .isDisabled())
      )
        throw new Error('View mode must lock fields')
      await page.getByRole('button', { name: 'Toggle edit mode' }).click()
      if (
        await page.getByRole('textbox', { name: 'Gallery photos label' }).isDisabled()
      )
        throw new Error('Edit mode must unlock fields')
      if (
        (await page.evaluate(
          () => (globalThis as unknown as { intentLoads: number }).intentLoads,
        )) !== loads
      )
        throw new Error('Edit/view toggling refetched settings')
      if (await page.getByText('Loading image intents…', { exact: true }).count())
        throw new Error('Edit/view toggling displayed loading')

      if (
        await page.getByRole('button', { name: 'Remove Featured', exact: true }).count()
      )
        throw new Error('Featured can be deleted')
      if (
        await page
          .getByRole('button', { name: 'Remove Unclassified', exact: true })
          .count()
      )
        throw new Error('Unclassified can be deleted')
      await page.getByRole('button', { name: 'Remove Research', exact: true }).click()
      await page.getByRole('dialog').getByText('12 images', { exact: false }).waitFor()
      await page.getByRole('dialog').getByRole('combobox').selectOption('alternative')
      await page.getByRole('button', { name: 'Reassign and remove' }).click()
      if (await page.getByRole('button', { name: 'Save image settings' }).count())
        throw new Error('Standalone save must not exist')
      await page.getByRole('button', { name: 'Save form', exact: true }).click()
      const saved = await page.evaluate(
        () =>
          (
            globalThis as unknown as {
              intentDraft: {
                intents: { id: string }[]
                autoPublishUnclassified: boolean
                reassignments: Record<string, string>
              }
            }
          ).intentDraft,
      )
      if (
        saved?.intents
          .slice(0, 3)
          .map(intent => intent.id)
          .join() !== 'closeUp,context,canonical'
      )
        throw new Error('Form draft lost the reordered intents')
      if (
        !saved?.autoPublishUnclassified ||
        saved.reassignments.research !== 'alternative'
      )
        throw new Error('Settings did not retain the reviewed choices')
      await page.getByRole('button', { name: 'Preview publication' }).click()
      await page.getByRole('button', { name: 'Publish as Gallery photos' }).waitFor()
      await page.screenshot({
        path: `${output}/${name}-${width}-publication.png`,
        fullPage: true,
      })
      await page.getByRole('button', { name: 'Keep images unclassified' }).click()
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth + 1,
      )
      if (overflow) throw new Error(`Horizontal overflow in ${name} at ${width}px`)
      await page.screenshot({
        path: `${output}/${name}-${width}-settings.png`,
        fullPage: true,
      })
      await page.getByRole('button', { name: 'Reset form' }).click()
      await page
        .locator('[data-intent-id="general"]')
        .getByText('General', { exact: true })
        .waitFor()
      if (
        !(await page
          .getByRole('button', { name: 'Save form', exact: true })
          .isDisabled())
      )
        throw new Error('Reset did not clear staged edits')
      if (errors.length) throw new Error(errors.join('\n'))
      console.log(
        `${name} ${width}px: inherited defaults, permanent roles, reassignment, save and publication dialog passed`,
      )
      await page.close()
    }
  } finally {
    await browser.close()
  }
}
