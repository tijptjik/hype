import { test, expect } from '@playwright/test'
import { join } from 'node:path'
// biome-ignore lint/suspicious/noUndeclaredEnvVars: managed evidence directory.
const output = process.env.DEV_RUNNER_ARTIFACTS

test('TKO vector geometry, facilities, overlay, exact links and two floors', async ({
  page,
}) => {
  test.setTimeout(180000)
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto('/buildings/tko-plaza')
  await expect(page.locator('[data-floor-artwork]')).toHaveCount(1, { timeout: 60000 })
  expect((await (await page.request.get('/api/auth/get-session')).json()).user.id).toBe(
    'hype-local-agent-admin',
  )
  await expect(
    page.getByRole('heading', { name: 'TKO Plaza', exact: true }),
  ).toBeVisible()
  await expect(
    page.getByText('Schematic floor directory.', { exact: false }),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Highlight route', exact: true }),
  ).toHaveCount(0)
  await expect(page.getByRole('link', { name: /Floor plan © TKO Plaza/ })).toBeVisible()
  const decoded = await page.locator('[data-floor-artwork]').evaluate(async el => {
    const img = new Image()
    img.src = el.getAttribute('href')
    await img.decode()
    return img.naturalWidth
  })
  expect(decoded).toBe(1820)
  await expect(page.locator('[data-floor-artwork]')).toHaveAttribute('opacity', '0')
  await expect(page.locator('svg text').filter({ hasText: /^001$/ })).toBeVisible()
  await expect(page.locator('[data-unit-label="L1-005"]')).toHaveCount(2)
  await expect(page.getByRole('list', { name: 'Map symbol legend' })).toContainText(
    'Baby changing',
  )
  await expect(page.getByRole('list', { name: 'Map symbol legend' })).toContainText(
    'Escalator',
  )
  // Logos come from current database occupancy, not the source directory snapshot.
  for (const logo of await page.locator('[data-shop-logo]').all())
    await expect(logo).toHaveAttribute('href', /^\/api\/identity-catalogue\/logos\//)
  for (const mark of await page.locator('[data-shop-logo]').all()) {
    expect(
      await mark.evaluate(async el => {
        const image = new Image()
        image.src = el.getAttribute('href')
        await image.decode()
        return image.naturalWidth > 0
      }),
    ).toBe(true)
  }
  const labelFit = await page.locator('[data-station-scene="plan"]').evaluate(root => {
    const codes = ['L1-004', 'L1-005', 'L1-133 - L1-134 - L1-135']
    return codes.flatMap(code =>
      [...root.querySelectorAll('text[data-unit-label]')]
        .filter(text => text.getAttribute('data-unit-label') === code)
        .map(text => {
          const path = [...root.querySelectorAll('path[role="button"]')].find(
            path => path.getAttribute('aria-label') === code,
          )
          const b = text.getBBox()
          return {
            code,
            inside: [
              [b.x, b.y],
              [b.x + b.width, b.y],
              [b.x, b.y + b.height],
              [b.x + b.width, b.y + b.height],
            ].every(([x, y]) => path.isPointInFill(new DOMPoint(x, y))),
          }
        }),
    )
  })
  expect(labelFit).toHaveLength(4)
  expect(
    labelFit.every(label => label.inside),
    JSON.stringify(labelFit),
  ).toBe(true)

  await page
    .locator('svg g[role="button"][aria-label="Accessible toilet · southwest"]')
    .click()
  await expect(
    page.getByRole('region', { name: 'Station place details' }),
  ).toContainText('Accessible toilet')
  await page.screenshot({ path: join(output, 'tko-level-1.png') })
  await page.getByText('Options', { exact: true }).click()
  const overlay = page.getByRole('slider', { name: 'Original plan opacity' })
  await overlay.fill('0.5')
  await expect(page.locator('[data-floor-artwork]')).toHaveAttribute('opacity', '0.5')
  await page.screenshot({ path: join(output, 'tko-overlay-50.png') })
  const originalTransform = await page
    .locator('[data-floor-artwork]')
    .getAttribute('transform')
  await page.getByRole('slider', { name: 'Station rotation' }).fill('25')
  await expect(page.locator('[data-floor-artwork]')).not.toHaveAttribute(
    'transform',
    originalTransform,
  )
  await page.screenshot({ path: join(output, 'tko-overlay-rotated.png') })
  await page.getByRole('slider', { name: 'Station rotation' }).fill('0')
  await overlay.fill('1')
  await expect(page.locator('[data-floor-artwork]')).toHaveAttribute('opacity', '1')
  await overlay.fill('0')
  await page.getByText('Options', { exact: true }).click()
  await page
    .locator('svg path[role="button"][aria-label="L1-133 - L1-134 - L1-135"]')
    .click()
  await expect(
    page.getByRole('region', { name: 'Station place details' }),
  ).toContainText('133')
  await page.screenshot({ path: join(output, 'tko-combined-unit.png') })
  await page.goto('/buildings/tko-plaza')
  await expect(page.locator('[data-floor-artwork]')).toHaveCount(1, { timeout: 60000 })
  await page.locator('svg path[role="button"][aria-label="L1-001"]').click()
  await expect(page).toHaveURL(/\/premises\/tko-plaza\/places\/[0-9a-f-]+$/)
  await expect(
    page.getByRole('region', { name: 'Station place details' }),
  ).toContainText('MILKSHA')
  await page.reload()
  await expect(
    page.getByRole('region', { name: 'Station place details' }),
  ).toContainText('MILKSHA', { timeout: 60000 })
  await page
    .getByRole('combobox', { name: 'Venue level' })
    .selectOption({ label: 'Level 2' })
  await expect(page.locator('[data-floor-artwork]')).toHaveAttribute(
    'href',
    /^data:image\/jpeg;base64,/,
  )
  await expect(page.locator('[data-floor-artwork]')).toHaveCount(1)
  await page.locator('svg path[role="button"][aria-label="L2-072"]').click()
  await expect(
    page.getByRole('region', { name: 'Station place details' }),
  ).toContainText('Shop L2-072, 2/F, TKO Plaza, 1 Tong Tak Street, Tseung Kwan O')
  await page.screenshot({ path: join(output, 'tko-level-2.png') })
  await page.getByRole('combobox', { name: 'Venue level' }).selectOption('all')
  await expect(page.locator('[data-floor-artwork]')).toHaveCount(2)
  await page.screenshot({ path: join(output, 'tko-exploded.png') })
  await page
    .getByRole('combobox', { name: 'Venue level' })
    .selectOption({ label: 'Level 1' })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole('button', { name: 'Close station panel', exact: true }).click()
  await expect(page.locator('[data-station-scene="plan"]')).toBeVisible()
  await page.screenshot({ path: join(output, 'tko-mobile.png') })
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  ).toBe(true)
})
