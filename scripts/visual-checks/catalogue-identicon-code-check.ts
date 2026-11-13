// Integration fixture: local admin catalogue with archive actions available for cleanup.
// NODE
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
// PLAYWRIGHT
import { chromium, expect as baseExpect } from '@playwright/test'
const expect = baseExpect.configure({ timeout: 60000 })
const origin = process.env.PLAYWRIGHT_BASE_URL
const artifacts = process.env.DEV_RUNNER_ARTIFACTS
const placement = process.env.DEV_RUNNER_CHROME_CLASS
if (!origin || !artifacts || !placement) throw new Error('Use managed Chrome')
await mkdir(artifacts, { recursive: true })
const browser = await chromium.launch({
  channel: 'chrome',
  headless: false,
  args: ['--ozone-platform=x11', `--class=${placement}`],
})
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
page.setDefaultTimeout(60000)
try {
  await page.goto(`${origin}/admin`, { timeout: 120000 })
  expect(
    (await (await page.request.get(`${origin}/api/auth/get-session`)).json())?.user?.id,
  ).toBe('hype-local-agent-admin')
  const code = process.argv[2] || `identicon-check-${Date.now()}`
  const name = `Identicon check ${code.replace('identicon-check-', '')}`
  const skip = page.getByRole('button', {
    name: 'Continue without accepting',
    exact: true,
  })
  if (!process.argv[2]) {
    await page.goto(`${origin}/admin/catalogue?kind=group&new=true`)
    await page.getByRole('button', { name: 'Name · en', exact: true }).click()
    await page.locator('#catalogue-name-en').fill(name)
    await page.locator('#catalogue-name-en').press('Enter')
    await page.locator('#catalogue-code').fill(code)
    await page
      .getByRole('banner')
      .getByRole('button', { name: 'Save', exact: true })
      .click()
    if (
      await skip.waitFor({ timeout: 5000 }).then(
        () => true,
        () => false,
      )
    )
      await skip.click()
    await expect(page).toHaveURL(new RegExp(`/group/${code}$`), { timeout: 120000 })
  } else {
    await page.goto(`${origin}/admin/catalog/group/${code}`)
  }
  const logo = page.getByAltText('Catalogue logo', { exact: true })
  await expect(logo).toHaveAttribute('src', /^data:image\/svg\+xml/)
  const source = await logo.getAttribute('src')
  await page
    .getByRole('banner')
    .getByRole('button', { name: 'Edit', exact: true })
    .click()
  await page.locator('#catalogue-code').fill(`${code}-renamed`)
  await page
    .getByRole('banner')
    .getByRole('button', { name: 'Save', exact: true })
    .click()
  if (
    await skip.waitFor({ timeout: 5000 }).then(
      () => true,
      () => false,
    )
  )
    await skip.click()
  await expect(page).toHaveURL(new RegExp(`/group/${code}-renamed$`), {
    timeout: 120000,
  })
  await expect(logo).toHaveAttribute('src', source!)
  await page.reload()
  await expect(logo).toHaveAttribute('src', source!)
  await expect(page.getByText('Internal Error', { exact: true })).toHaveCount(0)
  await page.screenshot({ path: resolve(artifacts, 'renamed-group-identicon.png') })
  await page.goto(`${origin}/admin/catalogue?kind=group`)
  // The same stable entity seed must survive list/profile navigation and code changes.
  await expect
    .poll(() =>
      page
        .locator('img')
        .evaluateAll(
          (images, expected) =>
            images.some(image => image.getAttribute('src') === expected),
          source,
        ),
    )
    .toBe(true)
  await page.goto(`${origin}/admin/catalog/group/${code}-renamed`)
  await page
    .getByRole('banner')
    .getByRole('button', { name: `${name} actions`, exact: true })
    .click()
  await page.getByRole('menuitem', { name: /^(Archive|Delete)$/, exact: true }).click()
  await page
    .getByRole('banner')
    .getByRole('button', { name: `${name} actions`, exact: true })
    .click()
  await expect(
    page.getByRole('menuitem', { name: 'Restore', exact: true }),
  ).toBeVisible()
} finally {
  await browser.close()
}
