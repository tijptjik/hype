// NODE
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
// PLAYWRIGHT
import { chromium, expect as baseExpect } from '@playwright/test'
const expect = baseExpect.configure({ timeout: 60_000 })
const origin = process.env.PLAYWRIGHT_BASE_URL
const artifacts = process.env.DEV_RUNNER_ARTIFACTS
const placement = process.env.DEV_RUNNER_CHROME_CLASS
if (!origin || !artifacts || !placement)
  throw new Error('Use the managed Chrome runner')
await mkdir(artifacts, { recursive: true })
const browser = await chromium.launch({
  channel: 'chrome',
  headless: false,
  args: ['--ozone-platform=x11', `--class=${placement}`],
})
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
page.setDefaultTimeout(60_000)
try {
  await page.goto(`${origin}/admin`, { timeout: 120_000 })
  const session = await (
    await page.request.get(`${origin}/api/auth/get-session`)
  ).json()
  expect(session?.user?.id).toBe('hype-local-agent-admin')
  // Delay the real record response to inspect both first-load skeletons deterministically.
  for (const [kind, code] of [
    ['brand', 'maxims'],
    ['group', 'dfi'],
  ]) {
    let release: () => void = () => {}
    const gate = new Promise<void>(resolve => {
      release = resolve
    })
    const matcher = '**/_app/remote/**/getIdentityCatalogue*'
    await page.route(matcher, async route => {
      await gate
      await route.continue()
    })
    try {
      await page.goto(`${origin}/admin/catalog/${kind}/${code}`, {
        timeout: 120_000,
        waitUntil: 'domcontentloaded',
      })
      const skeleton = page.getByRole('status', {
        name: 'Loading catalogue details',
        exact: true,
      })
      await expect(skeleton).toBeVisible()
      await expect
        .poll(() =>
          skeleton.evaluate(element => {
            for (let node: Element | null = element; node; node = node.parentElement) {
              if (Number(getComputedStyle(node).opacity) < 0.99) return false
            }
            const bounds = element.getBoundingClientRect()
            return element.contains(
              document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + 80),
            )
          }),
        )
        .toBe(true)
      await page.screenshot({
        path: resolve(artifacts, `${kind}-skeleton.png`),
        fullPage: true,
      })
    } finally {
      release()
    }
    await expect(page.locator('[data-catalogue-card]')).toBeVisible()
    await expect(page.locator('[data-catalogue-skeleton]')).toHaveCount(0)
    await page.unroute(matcher)
    await expect(
      page.getByText('Unable to load or save the catalogue. Please try again.', {
        exact: true,
      }),
    ).toHaveCount(0)
  }
  // A transient record failure must be retryable even when the remote query cached the error.
  let failNext = true
  await page.route('**/_app/remote/**/getIdentityCatalogue*', route => {
    if (failNext) {
      failNext = false
      return route.abort('failed')
    }
    return route.continue()
  })
  await page.goto(`${origin}/admin/catalog/brand/maxims`, { timeout: 120_000 })
  await expect(
    page.getByText('Unable to load this catalogue record. Please retry.', {
      exact: true,
    }),
  ).toBeVisible()
  await page
    .getByRole('button', { name: 'Retry catalogue record', exact: true })
    .click()
  await expect(page.locator('[data-catalogue-card]')).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Retry catalogue record', exact: true }),
  ).toHaveCount(0)
  await page.unroute('**/_app/remote/**/getIdentityCatalogue*')
  // Read-only profiles must not request catalogue list/autocomplete searches at all.
  let searches = 0
  await page.route('**/_app/remote/**/findIdentityCatalogue*', route => {
    searches++
    return route.abort('failed')
  })
  await page.reload()
  await expect(page.locator('[data-catalogue-card]')).toBeVisible()
  await expect(
    page.locator('a[href="/admin/catalog/group/maxims-group"]'),
  ).toBeVisible()
  expect(searches).toBe(0)
  await page
    .getByRole('banner')
    .getByRole('button', { name: 'Edit', exact: true })
    .click()
  await expect(
    page.getByText('Unable to load group details.', { exact: true }),
  ).toBeVisible()
  await expect(
    page.getByText('Unable to save the catalogue change. Please try again.', {
      exact: true,
    }),
  ).toHaveCount(0)
  await page.unroute('**/_app/remote/**/findIdentityCatalogue*')
  await page.getByRole('button', { name: 'Retry group details', exact: true }).click()
  await expect(
    page.getByRole('button', { name: 'Retry group details', exact: true }),
  ).toHaveCount(0)
  await expect(
    page.locator('a[href="/admin/catalog/group/maxims-group"]'),
  ).toBeVisible()
  await page.screenshot({
    path: resolve(artifacts, 'recovered-editor.png'),
    fullPage: true,
  })
  await writeFile(
    resolve(artifacts, 'verification.txt'),
    'Authenticated admin; delayed brand/group skeletons; record failure and cached-query retry; no read-only search requests; isolated autocomplete failure and retry without losing the profile.\n',
  )
} catch (error) {
  await page
    .screenshot({ path: resolve(artifacts, 'failure.png'), fullPage: true })
    .catch(() => {})
  await writeFile(
    resolve(artifacts, 'failure.txt'),
    await page.locator('body').ariaSnapshot(),
  ).catch(() => {})
  throw error
} finally {
  await browser.close()
}
