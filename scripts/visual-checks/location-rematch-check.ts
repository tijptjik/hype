// PLAYWRIGHT
import { chromium, firefox } from 'playwright'
// FILESYSTEM
import { mkdir } from 'node:fs/promises'

await mkdir('output/playwright', { recursive: true })
const failures: string[] = []
for (const [name, engine] of [
  ['chromium', chromium],
  ['firefox', firefox],
] as const) {
  const browser = await engine.launch(
    name === 'chromium'
      ? { executablePath: process.env.CHROMIUM_PATH, args: ['--disable-web-security'] }
      : { executablePath: process.env.FIREFOX_PATH },
  )
  try {
    const page = await browser.newPage({ viewport: { width: 1000, height: 1000 } })
    page.on('pageerror', error => failures.push(`${name}: ${error.message}`))
    const facts = {
      names: { en: 'Example Cafe', 'zh-hant': '示例咖啡店' },
      phoneNumber: [],
      brands: [],
      location: {
        geometry: { type: 'Point', coordinates: [114.15, 22.3] },
        address: {
          status: 'unresolved',
          address2dId: null,
          address3dId: null,
          address3dUnitId: null,
          snapshotId: null,
          rawSource: {},
          fallbackDisplay: { en: '11–16 Example Road' },
        },
      },
    }
    const detail = {
      id: 'fixture-review',
      locationId: 'fixture-location',
      stale: false,
      rejected: false,
      previousSsId: null,
      previousState: 'unresolved',
      before: facts,
      candidate: {
        ssId: 'fixture-source',
        releaseId: 'fixture-release',
        snapshotId: 'fixture-snapshot',
        facts,
        issueKinds: [],
      },
      createdAt: '2026-10-29T00:00:00Z',
      rematch: { score: 70, distance: 24, numberConflict: true, incomplete: true },
    }
    await page.route('**/src/lib/api/locationIdentity.remote.ts*', route =>
      route.fulfill({
        contentType: 'text/javascript',
        body: `
      export async function getLocationIdentityReviewAccess(){return {allowed:true}}
      export async function retryLocationRematch(){sessionStorage.setItem('rematch-fixture-phase','review');return {queued:true}}
      export async function getLocationIdentityReview(){return {...${JSON.stringify(detail)},stale:sessionStorage.getItem('rematch-fixture-phase')==='applied'}}
      export function acceptLocationIdentityReview(){const p=Promise.resolve({status:'applied'});p.updates=()=>{sessionStorage.setItem('rematch-fixture-phase','applied');return p};return p}
      export async function rejectLocationIdentityReview(){return {status:'rejected'}}
      export async function prepareMirroredLocationIdentityReview(){}
      export async function prepareLocationMergeReview(){}
      export async function getLocationMergeReview(){}
      export async function acceptLocationMergeReview(){}
    `,
      }),
    )
    await page.route('**/src/lib/api/location.remote.ts*', route =>
      route.fulfill({
        contentType: 'text/javascript',
        body: `export async function getFeatureLocation(){return null}; export async function searchFeatureLocations(){}; export async function getFeatureLocationCandidate(){}; export async function importFeatureLocationCandidate(){}`,
      }),
    )
    await page.route('**/__location-rematch.html', route =>
      route.fulfill({
        contentType: 'text/html',
        body: '<html lang="en" data-theme="breadline-light"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>@layer theme,base,components,utilities;</style><script>globalThis.__sveltekit_dev={env:{}}</script></head><body><div id="app"></div><script type="module" src="/src/tests/fixtures/locationRematchCheck.ts"></script></body></html>',
      }),
    )
    await page.goto('http://127.0.0.1:4173/__location-rematch.html')
    await page.getByRole('button', { name: 'Retry lookup', exact: true }).click()
    await page
      .getByText('Match evidence: 70/100 · 24 m away', { exact: true })
      .waitFor()
    await page
      .getByText(
        'Street number evidence differs. A range and an individual entrance are not equivalent.',
        { exact: true },
      )
      .waitFor()
    for (const width of [1000, 390]) {
      await page.setViewportSize({ width, height: 1000 })
      if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth))
        throw new Error(`${name}: horizontal overflow at ${width}`)
      await page.screenshot({
        path: `output/playwright/rematch-${name}-${width}.png`,
        fullPage: true,
      })
    }
    await page
      .locator('#location-identity-reason')
      .fill('Reviewed fixture identity and retained independent values')
    await page
      .getByRole('button', { name: 'Confirm same establishment', exact: true })
      .click()
    await page
      .getByText('Fixture saved. Independent Feature values retained.', { exact: true })
      .waitFor()
    await page.reload()
    await page
      .getByText('Fixture saved. Independent Feature values retained.', { exact: true })
      .waitFor()
    if (
      !(await page
        .getByRole('button', { name: 'Confirm same establishment', exact: true })
        .isDisabled())
    )
      throw new Error(`${name}: stale reopened review can be accepted`)
    console.log(
      `${name}: retry, comparison, acceptance, reopen and narrow layout passed with fixture APIs`,
    )
  } finally {
    await browser.close()
  }
}
if (failures.length) throw new Error(failures.join('\n'))
