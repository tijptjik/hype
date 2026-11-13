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
  expect(new URL(page.url()).pathname).toMatch(/^\/admin/)
  await page.goto(`${origin}/admin/catalog/brand/maxims`, { timeout: 120_000 })
  const parents = page.getByRole('list', { name: 'Parent groups', exact: true })
  await expect(
    parents.getByRole('link', { name: 'DFI Retail Group', exact: true }),
  ).toBeVisible()
  await expect(parents.getByText('Part of', { exact: true })).toBeVisible()
  const identity = page.getByRole('region', { name: 'Identity', exact: true })
  const wikidata = identity.getByRole('region', { name: 'Wikidata', exact: true })
  await expect(wikidata).toBeVisible()
  await expect(
    wikidata.getByRole('textbox', { name: 'Search Wikidata', exact: true }),
  ).toHaveCount(0)
  const directGroup = identity
    .locator('a[href="/admin/catalog/group/maxims-group"]')
    .first()
  const groupBox = await directGroup.boundingBox()
  const wikiBox = await wikidata.boundingBox()
  if (!groupBox || !wikiBox) throw new Error('Missing identity field bounds')
  expect(wikiBox.y).toBeGreaterThan(groupBox.y)
  expect(Math.abs(wikiBox.x - groupBox.x)).toBeLessThan(25)
  await page.screenshot({
    path: resolve(artifacts, 'identity-hierarchy-read.png'),
    fullPage: true,
  })
  await page
    .getByRole('banner')
    .getByRole('button', { name: 'Edit', exact: true })
    .click()
  await expect(
    wikidata.getByRole('textbox', { name: 'Search Wikidata', exact: true }),
  ).toBeVisible()
  await expect(
    parents.getByRole('link', { name: 'DFI Retail Group', exact: true }),
  ).toBeVisible()
  await page.setViewportSize({ width: 1200, height: 900 })
  await page.screenshot({
    path: resolve(artifacts, 'identity-hierarchy-edit-1200.png'),
    fullPage: true,
  })
  await page.reload()
  await parents.getByRole('link', { name: 'DFI Retail Group', exact: true }).click()
  await expect(page).toHaveURL(/\/admin\/catalog\/group\/dfi$/)
  await page.setViewportSize({ width: 1440, height: 1000 })
  // Record DOM identity, not just visible text: navigation must reuse the mounted shell and form.
  const live = await page.locator('[data-route-live]').elementHandle()
  const card = await page.locator('[data-catalogue-card]').elementHandle()
  const form = await page.locator('form[data-translation-tab="core"]').elementHandle()
  if (!live || !card || !form) throw new Error('Missing mounted catalogue elements')
  const subgroups = page.getByRole('region', { name: 'Subgroups', exact: true })
  await expect(
    subgroups.getByRole('link', { name: "Maxim's Group", exact: true }),
  ).toBeVisible()
  await expect(page.getByText('Parent group', { exact: true })).toBeVisible()
  await expect(page.getByText('Parent group (optional)', { exact: true })).toHaveCount(
    0,
  )
  await subgroups.getByRole('link', { name: "Maxim's Group", exact: true }).click()
  await expect(page).toHaveURL(/\/admin\/catalog\/group\/maxims-group$/)
  await expect(page.getByRole('region', { name: 'Names', exact: true })).toContainText(
    "Maxim's Group",
  )
  await page
    .getByRole('region', { name: 'Brands', exact: true })
    .locator('a[href="/admin/catalog/brand/maxims"]')
    .click()
  await expect(page).toHaveURL(/\/admin\/catalog\/brand\/maxims$/)
  await expect(page.getByRole('region', { name: 'Names', exact: true })).toContainText(
    "Maxim's",
  )
  await page
    .getByRole('region', { name: 'Sibling brands', exact: true })
    .locator('a[href="/admin/catalog/brand/arome"]')
    .click()
  await expect(page).toHaveURL(/\/admin\/catalog\/brand\/arome$/)
  await expect(page.getByRole('region', { name: 'Names', exact: true })).toContainText(
    'Arome',
  )
  for (const element of [live, card, form])
    expect(await element.evaluate(node => node.isConnected)).toBe(true)
  await page.goBack()
  await expect(page).toHaveURL(/\/admin\/catalog\/brand\/maxims$/)
  await expect(page.getByRole('region', { name: 'Names', exact: true })).toContainText(
    "Maxim's",
  )
  for (const element of [live, card, form])
    expect(await element.evaluate(node => node.isConnected)).toBe(true)
  await page.screenshot({
    path: resolve(artifacts, 'reused-catalogue-profile.png'),
    fullPage: true,
  })
  // Explicitly requested corrections go through normal attributed, version-guarded saves.
  if (process.argv.includes('--apply')) {
    for (const [path, label, name, query] of [
      ['brand/maxims', 'Search groups', "Maxim's Group", 'Maxim'],
      ['group/maxims-group', 'Search parent groups', 'DFI Retail Group', 'DFI'],
    ]) {
      await page.goto(`${origin}/admin/catalog/${path}`, { timeout: 120_000 })
      await page
        .getByRole('banner')
        .getByRole('button', { name: 'Edit', exact: true })
        .click()
      const clearGroup = page.getByRole('button', { name: 'Clear group', exact: true })
      if (await clearGroup.count()) await clearGroup.click()
      await page.getByRole('button', { name: `Open ${label}`, exact: true }).click()
      await page.getByRole('combobox', { name: label, exact: true }).fill(query)
      await page.getByRole('option', { name, exact: true }).click()
      await page.getByRole('button', { name: /^(Save|Save catalogue record)$/ }).click()
      await expect(
        page.getByRole('banner').getByRole('button', { name: 'Edit', exact: true }),
      ).toBeVisible()
      await page.reload()
      await expect(page.getByRole('link', { name, exact: true })).toBeVisible()
    }
  }
  for (const code of ['maxims', 'arome', '7eleven']) {
    await page.goto(`${origin}/admin/catalog/brand/${code}`, { timeout: 120_000 })
    const siblings = page.getByRole('region', { name: 'Sibling brands', exact: true })
    for (const other of ['maxims', 'arome', '7eleven'].filter(other => other !== code))
      await expect(
        siblings.locator(`a[href="/admin/catalog/brand/${other}"]`),
      ).toBeVisible()
    await expect(
      siblings.locator(`a[href="/admin/catalog/brand/${code}"]`),
    ).toHaveCount(0)
    if (code !== '7eleven')
      await expect(
        page.locator('a[href="/admin/catalog/group/maxims-group"]'),
      ).toBeVisible()
    await page.screenshot({
      path: resolve(artifacts, `${code}-siblings.png`),
      fullPage: true,
    })
  }
  for (const [group, brands] of [
    ['maxims-group', ['maxims', 'arome']],
    ['dfi', ['maxims', 'arome', '7eleven']],
  ] as const) {
    await page.goto(`${origin}/admin/catalog/group/${group}`, { timeout: 120_000 })
    const region = page.getByRole('region', { name: 'Brands', exact: true })
    for (const brand of brands)
      await expect(
        region.locator(`a[href="/admin/catalog/brand/${brand}"]`),
      ).toBeVisible()
    if (group === 'maxims-group')
      await expect(
        region.locator('a[href="/admin/catalog/brand/7eleven"]'),
      ).toHaveCount(0)
    await page.screenshot({
      path: resolve(artifacts, `${group}-brands.png`),
      fullPage: true,
    })
  }
  await page
    .getByRole('region', { name: 'Brands', exact: true })
    .locator('a[href="/admin/catalog/brand/arome"]')
    .click()
  await expect(page).toHaveURL(/\/admin\/catalog\/brand\/arome$/)
  await page.setViewportSize({ width: 1200, height: 900 })
  await expect(
    page.getByRole('region', { name: 'Sibling brands', exact: true }),
  ).toBeVisible()
  await page.screenshot({
    path: resolve(artifacts, 'siblings-1200.png'),
    fullPage: true,
  })
  await writeFile(
    resolve(artifacts, 'verification.txt'),
    'Authenticated admin; corrections saved and reloaded; symmetric siblings across group intermediary; self excluded; group subtrees isolated; brand navigation; 1200px layout.\n',
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
