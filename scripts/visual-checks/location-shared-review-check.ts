// BROWSER CHECKS
import { browserCases } from './lib/browser-cases'
import assert from 'node:assert/strict'
import { readFile, mkdir } from 'node:fs/promises'
const base = 'http://127.0.0.1:4173'
await mkdir('output/playwright/location-shared', { recursive: true })
for await (const { name, browser } of browserCases()) {
  for (const superAdmin of [true, false]) {
    const page = await browser.newPage({ viewport: { width: 1100, height: 1000 } })
    const errors: string[] = []
    page.on('pageerror', error => {
      errors.push(error.message)
      console.error(error.message)
    })
    for (const component of ['MapPrimitive'])
      await page.route(`**/${component}.svelte*`, route =>
        route.fulfill({
          contentType: 'application/javascript',
          body: "export { default } from '/src/tests/fixtures/components/LocationSharedMapStub.svelte'",
        }),
      )
    await page.route('**/src/lib/api/*.remote.*', async route => {
      const path = new URL(route.request().url()).pathname
        .replace(/^\//, '')
        .replace(/\.ts.*$/, '.ts')
      const source = await readFile(path, 'utf8')
      const exports = [...source.matchAll(/^export const (\w+)/gm)].map(
        match => match[1],
      )
      await route.fulfill({
        contentType: 'application/javascript',
        body: exports
          .map(
            key =>
              `export async function ${key}(input){${key === 'saveSharedLocationDirectoryCorrection' || key === 'saveLocalLocationAddress' ? `globalThis.savedLocation={method:'${key}',input};return {revisionId:'saved'}` : `return {rows:[],data:[],proposals:[],values:{},relationships:[],history:[]}`}}`,
          )
          .join('\n'),
      })
    })
    await page.route('**/__shared-editor.html*', route =>
      route.fulfill({
        contentType: 'text/html',
        body: '<html lang="en" data-theme="hype-light"><head><meta name="viewport" content="width=device-width,initial-scale=1"><script>globalThis.__sveltekit_dev={env:{}}</script></head><body><div id="app"></div><script type="module" src="/src/tests/fixtures/locationSharedEditorCheck.ts"></script></body></html>',
      }),
    )
    await page.goto(`${base}/__shared-editor.html?superadmin=${superAdmin}`)
    const names = page.locator('[data-draft-location-name]')
    await names
      .getByRole('button', {
        name: superAdmin ? 'Hype original name' : 'Original name',
        exact: true,
      })
      .waitFor()
    assert.equal(
      await page.getByRole('combobox', { name: 'Correction scope' }).count(),
      superAdmin ? 1 : 0,
    )
    const multilingual = page.getByRole('button', { name: 'Multilingual', exact: true })
    assert.equal(await multilingual.count(), 1)
    assert.equal(
      await page
        .locator('[data-address-toolbar-settings]')
        .getByRole('button', { name: 'Multilingual', exact: true })
        .count(),
      1,
    )
    assert.equal(await page.locator('[data-location-name-fields]').count(), 0)
    await multilingual.click()
    assert.equal(await names.locator('fieldset > div').count(), 3)
    await page.setViewportSize({ width: 390, height: 844 })
    await page.waitForTimeout(250)
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
    )
    await page.screenshot({
      path: `output/playwright/location-shared/${name}-${superAdmin}-narrow.png`,
      fullPage: true,
    })
    await page.setViewportSize({ width: 1100, height: 1000 })
    await multilingual.click()
    await page.waitForTimeout(250)
    assert.equal(await names.locator('fieldset > div').count(), 1)
    if (superAdmin) {
      await page
        .getByRole('combobox', { name: 'Correction scope' })
        .selectOption('organisation')
      await names.getByRole('button', { name: 'Original name', exact: true }).waitFor()
      await page
        .getByRole('combobox', { name: 'Correction scope' })
        .selectOption('shared')
    }
    await names
      .getByRole('button', {
        name: superAdmin ? 'Hype original name' : 'Original name',
        exact: true,
      })
      .click()
    await names
      .getByRole('textbox', { name: 'Name', exact: true })
      .fill('Verified corrected name')
    await page.screenshot({
      path: `output/playwright/location-shared/${name}-${superAdmin ? 'superadmin' : 'organisation'}-editing.png`,
      fullPage: true,
    })
    await page.getByRole('button', { name: 'Save fixture' }).click()
    await page.waitForFunction(() => Boolean((globalThis as any).savedLocation))
    const saved = await page.evaluate(() => (globalThis as any).savedLocation)
    assert.equal(
      saved.method,
      superAdmin ? 'saveSharedLocationDirectoryCorrection' : 'saveLocalLocationAddress',
    )
    assert.equal(
      superAdmin ? saved.input.patch.names.value.en : saved.input.names.en,
      'Verified corrected name',
    )
    assert.deepEqual(errors, [])
    await page.screenshot({
      path: `output/playwright/location-shared/${name}-${superAdmin ? 'superadmin' : 'organisation'}.png`,
      fullPage: true,
    })
    await page.close()
  }
  const page = await browser.newPage({ viewport: { width: 390, height: 900 } })
  await page.route('**/__shared-review.html', route =>
    route.fulfill({
      contentType: 'text/html',
      body: '<html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><script>globalThis.__sveltekit_dev={env:{}}</script></head><body><div id="app"></div><script type="module" src="/src/tests/fixtures/staffSaveCheck.ts"></script></body></html>',
    }),
  )
  await page.route('**/src/lib/api/locationCorrections.remote.*', route =>
    route.fulfill({
      contentType: 'application/javascript',
      body: `
    let outcome=null; const values={names:{en:'Original'},phoneNumber:[],brands:[]};
    export async function getLocationCorrectionWorkspace(){return {locationId:'l',version:'v',organisationRevision:null,current:values,freshness:{},canReview:true,canEditOrganisation:true,canEditSharedContacts:true,canEditFacts:false,proposals:[{id:'proposal',patch:{names:{en:{mode:'override',value:'New'}},phoneNumber:{mode:'override',value:['+85221234567']}},before:values,after:{...values,names:{en:'New'},phoneNumber:['+85221234567']},actorId:'Contributor',reason:'Updated details',outcome}]}}
    export async function reviewLocationCorrection(input){globalThis.mergedCorrection=input;outcome='accepted';return {outcome}}
    export async function submitLocationCorrection(){} export async function setOrganisationLocationFollowPolicy(){}
  `,
    }),
  )
  await page.route('**/src/lib/api/locationShared.remote.*', route =>
    route.fulfill({
      contentType: 'application/javascript',
      body: `export async function getSharedLocationCorrection(){return {facts:{phoneNumber:[]},upstream:{},history:[]}} export async function saveSharedLocationCorrection(){}`,
    }),
  )
  await page.goto(base + '/__shared-review.html')
  await page.getByRole('checkbox', { name: /names/ }).uncheck()
  await page
    .getByRole('textbox', { name: 'Review reason' })
    .fill('Accept verified phone only')
  await page.screenshot({
    path: `output/playwright/location-shared/${name}-merge-selection.png`,
    fullPage: true,
  })
  await page.getByRole('button', { name: 'Accept selected changes' }).click()
  await page.waitForFunction(() => Boolean((globalThis as any).mergedCorrection))
  assert.deepEqual(
    await page.evaluate(() => (globalThis as any).mergedCorrection.selectedFields),
    ['phoneNumber'],
  )
  await page.screenshot({
    path: `output/playwright/location-shared/${name}-merge.png`,
    fullPage: true,
  })
  await page.close()
  console.log(
    `${name}: SuperAdmin scope, Organisation save and selected-field merge passed`,
  )
}
