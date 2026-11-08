// PLAYWRIGHT
import { chromium } from 'playwright'
// NODE
import assert from 'node:assert/strict'
import { mkdir, readFile } from 'node:fs/promises'

const origin = process.env.HYPE_CHECK_ORIGIN ?? 'http://127.0.0.1:4173'
const output = 'output/playwright'
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 1560, height: 900 } })
  const errors: string[] = []
  page.on('pageerror', e => {
    errors.push(e.message)
    console.log('Page error', e.message)
  })
  await page.route('**/__scoped-switch.html', r =>
    r.fulfill({
      contentType: 'text/html',
      body: '<html data-theme="black"><head><script>globalThis.__sveltekit_dev={env:{}}</script></head><body><div id="app"></div><script type="module" src="/src/tests/fixtures/scopedFeatureSwitchCheck.ts"></script></body></html>',
    }),
  )
  for (const file of ['feature', 'featureIndex', 'property']) {
    const source = await readFile(`src/lib/api/${file}.remote.ts`, 'utf8')
    const names = [
      ...source.matchAll(/export (?:const|(?:async )?function) (\w+)/g),
    ].map(m => m[1])
    const api = names
      .map(
        name =>
          `export function ${name}(input){const result=${file === 'property' ? '[]' : '{data:[],totalCount:0,hasMore:false,nextOffset:0}'};const p=new Promise(resolve=>setTimeout(()=>resolve(result),2000));return Object.assign(p,{refresh:async()=>result});}`,
      )
      .join('\n')
    await page.route(`**/src/lib/api/${file}.remote.ts*`, r =>
      r.fulfill({ contentType: 'text/javascript', body: api }),
    )
  }
  // Unexpected remote traffic fails this isolated check instead of reaching live data.
  await page.route('**/_app/remote/**', async r => {
    errors.push('Unexpected remote request')
    await r.abort()
  })
  await page.goto(`${origin}/__scoped-switch.html`)
  const header = page.locator('.bits-pattern-header-stack')
  const search = page.getByRole('textbox', { name: 'Filter', exact: true })
  await search.waitFor({ timeout: 10000 })
  await page.getByRole('status', { name: 'Loading resources' }).waitFor()
  assert.equal(await page.getByText('Fields', { exact: true }).count(), 0)
  await page.screenshot({ path: `${output}/scoped-switch-loading.png` })
  await page.getByRole('button', { name: 'Resolve profile', exact: true }).click()
  await page.getByRole('button', { name: 'Filter By', exact: true }).first().waitFor()
  await page
    .getByRole('button', { name: 'Mount next organisation', exact: true })
    .click()
  await page.waitForTimeout(150)
  await page
    .getByRole('button', { name: 'Dispose previous organisation', exact: true })
    .click()
  await search.waitFor()
  await page.getByRole('button', { name: 'Filter By', exact: true }).first().waitFor()
  await page.getByRole('button', { name: 'Resolve profile', exact: true }).click()
  await page.waitForTimeout(1800)
  assert((await header.boundingBox())!.y >= 0)
  await page.getByText('No results found', { exact: true }).waitFor()
  await search.fill('second owner')
  await page.waitForTimeout(200)
  assert.equal(await search.inputValue(), 'second owner')
  await page.getByText('No results found', { exact: true }).waitFor()
  await page.screenshot({ path: `${output}/scoped-switch-empty.png` })
  await page.getByRole('button', { name: 'Toggle Features', exact: true }).click()
  await page.getByRole('button', { name: 'Edit', exact: true }).waitFor()
  await page
    .getByRole('button', { name: 'Filter By', exact: true })
    .first()
    .waitFor({ state: 'hidden' })
  console.log(
    'Index skeleton, late profile metadata, overlapping owner disposal, search, header position and return to profile passed. Page errors:',
    errors,
  )
  assert.deepEqual(errors, [])
} finally {
  await browser.close()
}
