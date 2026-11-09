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
    for (const component of ['AddressMap', 'MapPrimitive'])
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
    await page
      .getByRole('textbox', { name: /English/ })
      .first()
      .waitFor({ timeout: 20000 })
      .catch(async error => {
        console.error(await page.locator('body').innerText())
        throw error
      })
    assert.equal(
      await page.getByRole('combobox', { name: 'Correction scope' }).count(),
      superAdmin ? 1 : 0,
    )
    if (superAdmin) {
      assert.equal(
        await page
          .getByRole('textbox', { name: /English/ })
          .first()
          .inputValue(),
        'Hype original name',
      )
      await page
        .getByRole('combobox', { name: 'Correction scope' })
        .selectOption('organisation')
      assert.equal(
        await page
          .getByRole('textbox', { name: /English/ })
          .first()
          .inputValue(),
        'Original name',
      )
      await page
        .getByRole('combobox', { name: 'Correction scope' })
        .selectOption('shared')
      assert.equal(
        await page
          .getByRole('textbox', { name: /English/ })
          .first()
          .inputValue(),
        'Hype original name',
      )
    }
    await page
      .getByRole('textbox', { name: /English/ })
      .first()
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
