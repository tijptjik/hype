// NODE
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
// PLAYWRIGHT
import { chromium, expect } from '@playwright/test'

const origin = process.env.PLAYWRIGHT_BASE_URL
const artifacts = process.env.DEV_RUNNER_ARTIFACTS
const placement = process.env.DEV_RUNNER_CHROME_CLASS
if (!origin || !artifacts || !placement)
  throw new Error('Use dev-remote --port PORT chrome')
await mkdir(artifacts, { recursive: true })
const browser = await chromium.launch({
  channel: 'chrome',
  headless: false,
  args: ['--ozone-platform=x11', `--class=${placement}`],
})
const errors: string[] = []
const responses: { path: string; status: number }[] = []
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  page.setDefaultTimeout(30_000)
  page.on('console', message => {
    if (message.type() === 'error') errors.push(message.text())
  })
  page.on('pageerror', error => errors.push(error.stack ?? error.message))
  page.on('response', response => {
    if (response.status() >= 400)
      responses.push({
        path: new URL(response.url()).pathname,
        status: response.status(),
      })
  })
  await page.goto(`${origin}/admin`, { timeout: 120_000 })
  const session = await (
    await page.request.get(`${origin}/api/auth/get-session`)
  ).json()
  expect(session?.user?.id).toBe('hype-local-agent-admin')
  expect(new URL(page.url()).pathname).toMatch(/^\/admin/)
  const response = await page.goto(`${origin}/admin/catalogue`, { timeout: 120_000 })
  expect(response?.ok()).toBe(true)
  await page
    .getByRole('button', { name: 'Arome', exact: true })
    .click({ timeout: 120_000 })
  await expect(page).toHaveURL(/\/admin\/catalog\/brand\/arome$/)
  const catalogueUrl = page.url()
  await page.goto(`${origin}/admin/catalogue?id=bl-brand-7414c730dd836bb4cddefc9b`)
  await expect(page).toHaveURL(/\/admin\/catalog\/brand\/7eleven$/)
  await page.goto(catalogueUrl)
  await page.reload()

  const logo = page.getByRole('img', { name: 'Catalogue logo', exact: true })
  await expect(logo).toBeVisible()
  await expect
    .poll(() => logo.evaluate((image: HTMLImageElement) => image.naturalWidth))
    .toBeGreaterThan(0)
  const logoSrc = await logo.getAttribute('src')
  if (!logoSrc) throw new Error('Catalogue logo has no URL')
  const logoResponse = await page.request.get(new URL(logoSrc, origin).href)
  expect(logoResponse.status()).toBe(200)
  expect(logoResponse.headers()['content-type']).toBe('image/png')
  await page
    .getByRole('banner')
    .getByRole('button', { name: 'Features', exact: true })
    .click()
  await expect(page).toHaveURL(/facet=features/)
  await expect(
    page.getByPlaceholder('Filter resources').filter({ visible: true }),
  ).toBeVisible()
  await expect(page.getByRole('status', { name: /^Results: \d+$/ })).toBeVisible()
  const featureSearch = page
    .getByPlaceholder('Filter resources')
    .filter({ visible: true })
  await featureSearch.fill('Arome')
  await expect(featureSearch).toHaveValue('Arome')
  await featureSearch.fill('')
  await page.screenshot({ path: resolve(artifacts, 'catalogue-features.png') })
  await page
    .getByRole('banner')
    .getByRole('button', { name: 'Profile', exact: true })
    .click()
  await expect(page).toHaveURL(catalogueUrl)
  await expect(logo).toBeVisible()
  const name = page.locator('#catalogue-name-en')
  await expect(page.getByRole('group', { name: 'Name · en', exact: true })).toHaveText(
    'Arome',
  )
  await page.getByRole('button', { name: 'Multilingual', exact: true }).click()
  await expect(
    page.getByRole('group', { name: 'Name · zh-Hant', exact: true }),
  ).toHaveText('東海堂')
  console.log('Editing catalogue')
  await page.getByRole('button', { name: 'Edit', exact: true }).click()
  const logoPicker = page.locator('[data-catalogue-logo-picker]')
  await logoPicker.hover()
  await expect(logoPicker.locator('[data-logo-overlay]')).toHaveCSS('opacity', '1')
  const chooserPromise = page.waitForEvent('filechooser')
  await logoPicker.click()
  await chooserPromise
  await expect(
    page.getByRole('button', { name: 'Change logo', exact: true }),
  ).toHaveCount(0)

  await page.getByRole('button', { name: 'Name · en', exact: true }).click()
  await expect(name).toBeEditable()
  const category = page.getByRole('combobox', { name: 'Add category', exact: true })
  await category.fill('convenience store')
  await category.press('ArrowDown')
  await page.keyboard.press('Enter')
  await expect(
    page.getByRole('group', { name: 'Categories', exact: true }),
  ).toContainText('Convenience store')
  await expect(category).toBeFocused()
  await expect(category).toHaveValue('')
  const group = page.getByRole('combobox', { name: 'Search groups', exact: true })
  if (await page.getByRole('button', { name: 'Clear group', exact: true }).count())
    await page.getByRole('button', { name: 'Clear group', exact: true }).click()
  await group.fill('DFI')
  await expect(
    page.getByRole('option', { name: 'DFI Retail Group', exact: true }),
  ).toBeVisible()
  await group.press('ArrowDown')
  await page.keyboard.press('Enter')
  await expect(group).toHaveCount(0)
  await expect(page.getByText('DFI Retail Group', { exact: true })).toBeVisible()
  const clearGroup = page.getByRole('button', { name: 'Clear group', exact: true })
  await clearGroup.locator('..').hover()
  await expect(clearGroup).toHaveCSS('opacity', '1')
  await clearGroup.click()
  await expect(clearGroup).toHaveCount(0)
  await expect(group).toBeFocused()
  await group.fill('DFI')
  await expect(
    page.getByRole('option', { name: 'DFI Retail Group', exact: true }),
  ).toBeVisible()
  await group.press('ArrowDown')
  await page.keyboard.press('Enter')
  await expect(page.getByText('DFI Retail Group', { exact: true })).toBeVisible()

  await expect(
    page.getByRole('button', { name: 'Clear group', exact: true }),
  ).toBeAttached()
  await clearGroup.click()
  await expect(group).toBeFocused()
  expect(await group.evaluate(node => getComputedStyle(node).backgroundColor)).toBe(
    'rgba(0, 0, 0, 0)',
  )
  expect(await category.evaluate(node => getComputedStyle(node).backgroundColor)).toBe(
    'rgba(0, 0, 0, 0)',
  )
  await group.fill('Catalogue inline group check')
  await expect(
    page.getByRole('option', {
      name: 'Create group “Catalogue inline group check”',
      exact: true,
    }),
  ).toBeVisible()
  await group.press('ArrowDown')
  await page.keyboard.press('Enter')
  await expect(
    page.getByRole('group', { name: 'New group names', exact: true }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Group name · en', exact: true }).click()
  await page.locator('#catalogue-group-name-en').fill('Edited group draft')
  await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeEnabled()
  await page.screenshot({ path: resolve(artifacts, 'catalogue-inline-group.png') })
  await page.getByRole('button', { name: 'Cancel new group', exact: true }).click()
  await expect(group).toBeVisible()

  await page.getByRole('button', { name: 'Name · en', exact: true }).click()
  console.log('Editing name after category and group checks')
  await name.fill('Unsaved catalogue check')
  await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeEnabled()
  await page.getByRole('button', { name: 'Reset', exact: true }).click()
  await page.goto(`${origin}/admin/catalogue`)
  await expect(
    page.getByRole('banner').getByRole('button', { name: 'Brands', exact: true }),
  ).toBeVisible({ timeout: 60_000 })
  await page
    .getByRole('banner')
    .getByRole('button', { name: 'Groups', exact: true })
    .click()
  await expect(
    page.getByPlaceholder('Search groups').filter({ visible: true }),
  ).toBeVisible()
  await page
    .getByRole('banner')
    .getByRole('button', { name: 'Brands', exact: true })
    .click()
  await page.getByPlaceholder('Search brands').filter({ visible: true }).fill('Arome')
  await expect(page.getByRole('button', { name: '7-Eleven', exact: true })).toHaveCount(
    0,
  )
  await page.getByPlaceholder('Search brands').filter({ visible: true }).fill('')
  await page.getByRole('button', { name: 'Show cards', exact: true }).click()
  await expect(
    page.getByRole('button', { name: 'Show rows', exact: true }),
  ).toBeVisible()
  await page.screenshot({ path: resolve(artifacts, 'donor-catalogue-cards.png') })
  await page.getByRole('button', { name: 'Show rows', exact: true }).click()
  await page.screenshot({ path: resolve(artifacts, 'donor-catalogue-index.png') })
  await page
    .getByRole('banner')
    .getByRole('button', { name: 'New', exact: true })
    .click()
  await expect(
    page.getByRole('button', { name: 'Name · en', exact: true }),
  ).toBeVisible()
  await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled()
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  await page.getByRole('button', { name: 'Arome', exact: true }).click()
  await page.getByRole('button', { name: 'Multilingual', exact: true }).click()
  await expect(page.locator('[data-catalogue-columns] > section')).toHaveCount(3)
  expect(
    (
      await page
        .locator(
          '[data-catalogue-columns] > section .bits-form__section-header-heading',
        )
        .allTextContents()
    ).map(text => text.trim()),
  ).toEqual(['Brand', 'Names', 'Identity'])
  const multilingualControl = page
    .getByRole('banner')
    .getByRole('button', { name: 'Multilingual', exact: true })
  await expect(multilingualControl).toBeVisible()
  const languageBox = await multilingualControl.boundingBox()
  const editBox = await page
    .getByRole('banner')
    .getByRole('button', { name: 'Edit', exact: true })
    .boundingBox()
  expect(languageBox && editBox && languageBox.x + languageBox.width <= editBox.x).toBe(
    true,
  )
  const widths = await page
    .locator('[data-catalogue-columns] > section')
    .evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect().width))
  expect(widths[2]).toBeGreaterThan(widths[0] + widths[1] - 2)
  await page.waitForTimeout(750)
  await page.screenshot({ path: resolve(artifacts, 'donor-catalogue-desktop.png') })
  await page.setViewportSize({ width: 1200, height: 900 })
  await expect(
    page.getByRole('group', { name: 'Name · en', exact: true }),
  ).toBeVisible()
  await page.screenshot({ path: resolve(artifacts, 'donor-catalogue-1200.png') })
  await page.setViewportSize({ width: 390, height: 844 })
  // The admin shell deliberately blocks widths below 1200px; do not claim hidden form usability.
  await expect(page.getByText('Window Too Small', { exact: true })).toBeVisible()
  await page.screenshot({ path: resolve(artifacts, 'donor-catalogue-mobile.png') })
  expect(errors).toEqual([])
  await writeFile(
    resolve(artifacts, 'donor-catalogue.json'),
    JSON.stringify({
      admin: true,
      catalogueSelection: true,
      editCancel: true,
      headerSearchAndTabs: true,
      newRecordValidation: true,
      locales: 3,
      narrowViewportBlockedByAdminShell: true,
      errors,
    }),
  )
} catch (error) {
  await writeFile(
    resolve(artifacts, 'errors.json'),
    JSON.stringify({ errors, responses }, null, 2),
  )
  for (const context of browser.contexts())
    for (const page of context.pages()) {
      await page.screenshot({ path: resolve(artifacts, 'failure.png') }).catch(() => {})
      await writeFile(
        resolve(artifacts, 'failure.txt'),
        await page.locator('body').innerText(),
      ).catch(() => {})
    }
  throw error
} finally {
  await browser.close()
}
