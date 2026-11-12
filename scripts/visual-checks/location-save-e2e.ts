// Run through dev-check against an admin-persona server backed by a private DB snapshot.
// This deliberately writes real revisions; it never mocks authentication or remote APIs.
import assert from 'node:assert/strict'
import { chromium, type Page } from 'playwright'

// biome-ignore lint/suspicious/noUndeclaredEnvVars: Manual browser check is not a cached Turbo task.
const origin = process.env.HYPE_E2E_ORIGIN
assert(
  origin && new URL(origin).hostname === '127.0.0.1',
  'Set HYPE_E2E_ORIGIN to the isolated local admin server',
)
assert(
  // biome-ignore lint/suspicious/noUndeclaredEnvVars: Explicit guard for this manual write check.
  process.env.HYPE_E2E_PRIVATE_STATE === '1',
  'Confirm the server uses private HYPE_DEV_STATE',
)
const browser = await chromium.launch({
  headless: true,
  args: ['--disable-web-security'],
})
const page = await browser.newPage({ viewport: { width: 1560, height: 1050 } })
page.setDefaultTimeout(30000)
const header = page.locator('header').first()

/** Save the visible persisted editor and wait for its read-only state.
 * @param current Browser page. @returns Completion after the save finishes.
 */
async function saveExisting(current: Page): Promise<void> {
  await current
    .locator('header')
    .first()
    .getByRole('button', { name: 'Save', exact: true })
    .click()
  await current
    .locator('header')
    .first()
    .getByRole('button', { name: 'Edit', exact: true })
    .waitFor()
  assert.deepEqual(await current.getByRole('alert').allTextContents(), [])
}

try {
  for (const [saveLocationFirst, resultName] of [
    [true, /^\d+ Kee Wah Bakery Shop No\. 1020 Podium/],
    [false, /^\d+ Kee Wah Bakery \(Plaza Hollywood\) Shop/],
  ] as const) {
    await page.goto(`${origin}/admin/features/new`, {
      waitUntil: 'domcontentloaded',
      timeout: 120000,
    })
    await page.getByText('Local development: Admin', { exact: true }).waitFor()
    await page
      .getByRole('button', { name: 'HKFoodWorks Breadline Donors', exact: true })
      .click()
    await page
      .getByRole('textbox', {
        name: 'Search for a Business, Venue, Building, or Address',
        exact: true,
      })
      .fill('Kee Wah Bakery')
    await page.getByRole('button', { name: resultName }).click()
    await page.getByRole('button', { name: 'Use this location', exact: true }).click()
    await page.waitForURL('**/admin/features/new#core')
    await header.getByRole('button', { name: 'Location', exact: true }).click()
    await page.locator('main').last().locator('a[href="/admin/locations/new"]').click()
    await page.waitForURL('**/admin/locations/new')
    await page
      .getByRole('button', {
        name: saveLocationFirst ? 'Kee Wah Bakery' : 'Kee Wah Bakery (Plaza Hollywood)',
        exact: true,
      })
      .click()
    const name = `Kee Wah Bakery E2E ${saveLocationFirst ? 'location' : 'feature'} first`
    await page.locator('#draft-location-name-en').fill(name)
    if (saveLocationFirst) {
      await header.getByRole('button', { name: 'Save', exact: true }).click()
    } else {
      await page.getByRole('link', { name: 'New Feature', exact: true }).click()
      await page.waitForURL('**/admin/features/new#location')
      await page.getByRole('link', { name, exact: true }).click()
      await page.waitForURL('**/admin/locations/new')
      await page.getByRole('button', { name, exact: true }).waitFor()
      await page.getByRole('link', { name: 'New Feature', exact: true }).click()
    }
    await page.waitForURL('**/admin/features/new#location')
    const reviewedHref = await page
      .getByRole('link', { name, exact: true })
      .getAttribute('href')
    if (saveLocationFirst)
      assert.match(reviewedHref ?? '', /\/locations\/(?!new)[^/]+$/)
    if (saveLocationFirst) {
      // Recover the older checkpoint shape and retry a failed transport without losing intent.
      await page.waitForFunction(() => {
        const saved = sessionStorage.getItem(
          'hype:dev:new-feature:v1:hype-local-agent-admin',
        )
        return saved && JSON.parse(saved).value?.data?.featureType
      })
      await page.evaluate(() => {
        const key = 'hype:dev:new-feature:v1:hype-local-agent-admin'
        const saved = JSON.parse(sessionStorage.getItem(key)!)
        delete saved.value.selectedFeatureType
        sessionStorage.setItem(key, JSON.stringify(saved))
      })
      await page.reload({ waitUntil: 'domcontentloaded' })
      await page.getByRole('link', { name, exact: true }).waitFor()
      await page.route('**/_app/remote/*/featureForm', route => route.abort('failed'), {
        times: 1,
      })
      const failedRequest = page.waitForEvent('requestfailed', request =>
        request.url().endsWith('/featureForm'),
      )
      await header.getByRole('button', { name: 'Save', exact: true }).click()
      await failedRequest
      await page.waitForFunction(() => {
        const button = [...document.querySelectorAll('header button')].find(
          button => button.textContent?.trim() === 'Save',
        )
        return button && !button.hasAttribute('disabled')
      })
      assert.match(page.url(), /features\/new/)
      await page.getByRole('link', { name, exact: true }).waitFor()
    }
    await header.getByRole('button', { name: 'Save', exact: true }).click()
    await page.waitForURL(url => /\/admin\/features\/(?!new)[^/]+$/.test(url.pathname))
    const featureUrl = page.url()
    const locationHref = await page
      .getByRole('link', { name, exact: true })
      .getAttribute('href')
    if (saveLocationFirst) assert.equal(locationHref, reviewedHref)
    // Consecutive revisions must use refreshed optimistic-concurrency tokens.
    for (const number of ['81', '82']) {
      await header.getByRole('button', { name: 'Edit', exact: true }).click()
      if (saveLocationFirst) {
        await page
          .getByRole('textbox', { name: 'Street number', exact: true })
          .fill(number)
      } else {
        if (
          await page
            .getByRole('button', {
              name: 'Write a custom display address',
              exact: true,
            })
            .isVisible()
        )
          await page
            .getByRole('button', {
              name: 'Write a custom display address',
              exact: true,
            })
            .click()
        await page
          .getByRole('textbox', { name: 'Display address', exact: true })
          .fill(`E2E Plaza entrance ${number}`)
      }
      await saveExisting(page)
    }
    await page.getByRole('link', { name, exact: true }).click()
    await page.waitForURL(`${origin}${locationHref}`)
    for (const number of ['83', '84']) {
      await header.getByRole('button', { name: 'Edit', exact: true }).click()
      if (
        await page
          .getByRole('button', { name: 'Write a custom display address', exact: true })
          .isVisible()
      )
        await page
          .getByRole('button', { name: 'Write a custom display address', exact: true })
          .click()
      await page
        .getByRole('textbox', { name: 'Display address', exact: true })
        .fill(`E2E Location entrance ${number}`)
      await saveExisting(page)
    }
    await page.reload()
    await header.getByRole('button', { name: 'Edit', exact: true }).click()
    assert.equal(
      await page
        .getByRole('textbox', { name: 'Display address', exact: true })
        .inputValue(),
      'E2E Location entrance 84',
    )
    console.log(
      JSON.stringify({
        saveLocationFirst,
        featureUrl,
        locationHref,
        consecutiveSaves: 'passed',
      }),
    )
  }
} finally {
  await browser.close()
}
