import assert from 'node:assert/strict'
import { chromium } from '@playwright/test'
const base = process.env.PLAYWRIGHT_BASE_URL
const output = process.env.DEV_RUNNER_ARTIFACTS
if (!base || !output) throw new Error('Run through dev-remote chrome')
const browser = await chromium.launch({
  channel: 'chrome',
  headless: false,
  args: ['--ozone-platform=x11', `--class=${process.env.DEV_RUNNER_CHROME_CLASS}`],
})
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  const signedOut = await context.request.get(
    `${base}/recorder/173461e7-4164-4cb4-b4a7-7a91bf6b8f60`,
    { maxRedirects: 0 },
  )
  assert.equal(signedOut.status(), 303)
  assert.match(signedOut.headers().location, /^\/signin\?returnTo=/)
  const page = await context.newPage()
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(base)
  const auth = await (await page.request.get(`${base}/api/auth/get-session`)).json()
  assert.equal(auth?.user?.id, 'hype-local-agent-admin')
  assert((await page.goto(`${base}/admin/field-recorder`))?.ok())
  await page
    .getByRole('heading', { name: 'Prepare a session' })
    .waitFor({ timeout: 120000 })
  await page
    .getByLabel('Session name', { exact: true })
    .fill('Recorder setup validation · temporary')
  const prefix = `URA/KC-017-M-CHECK-${Date.now()}`
  await page.getByLabel('Catalogue prefix').fill(prefix)
  await page.getByLabel('Project / Organisation').selectOption('frDemoProj01')
  await page.getByLabel('Layer', { exact: true }).selectOption('frDemoLayer1')
  await page.getByLabel('Feature type', { exact: true }).selectOption('object')
  await page.getByLabel('Find a building Location').fill('Nam Kok')
  await page.getByRole('button', { name: 'Search', exact: true }).click()
  await page
    .getByRole('button')
    .filter({ hasText: '60 Nam Kok Rd, Kowloon City' })
    .click()
  await page.getByLabel(/^material$/i).uncheck()
  await page.getByRole('button', { name: 'Create recorder session' }).click()
  await page
    .getByRole('link', { name: 'Launch Field Recorder →', exact: true })
    .waitFor({ timeout: 120000 })
  await page.getByRole('link', { name: 'Launch Field Recorder →', exact: true }).click()
  await page
    .getByRole('button', { name: 'Save draft', exact: true })
    .waitFor({ timeout: 120000 })
  assert.equal(await page.getByLabel('Material', { exact: true }).count(), 0)
  await page.getByRole('button', { name: 'Save draft', exact: true }).click()
  await page.getByRole('status').filter({ hasText: 'Saved to server.' }).waitFor()
  const sessionUrl = page.url()
  await page.getByRole('link', { name: 'Admin', exact: true }).click()
  await page.getByRole('heading', { name: 'Prepare a session' }).waitFor()
  await page.goBack()
  await page.getByRole('button', { name: /Records · 1/ }).waitFor({ timeout: 120000 })
  await page.setViewportSize({ width: 360, height: 800 })
  await page
    .getByRole('heading', { name: 'Field Recorder', exact: true })
    .scrollIntoViewIfNeeded()
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    true,
  )
  await page.screenshot({ path: `${output}/recorder-mobile-top.png`, fullPage: true })
  assert.deepEqual(errors, [])
  await Bun.write(
    `${output}/field-recorder-setup-results.json`,
    JSON.stringify(
      {
        signedOut: signedOut.status(),
        prefix,
        sessionUrl,
        configuredFields: true,
        serverSave: true,
        backNavigation: true,
        narrowWidth: 360,
        errors,
      },
      null,
      2,
    ),
  )
} catch (error) {
  for (const page of browser.contexts().flatMap(context => context.pages())) {
    await page.screenshot({ path: `${output}/setup-failure.png` }).catch(() => {})
    await Bun.write(
      `${output}/setup-failure.txt`,
      await page
        .locator('body')
        .textContent()
        .catch(() => 'No page'),
    )
  }
  throw error
} finally {
  await browser.close()
}
