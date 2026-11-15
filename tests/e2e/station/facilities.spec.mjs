import { test, expect } from '@playwright/test'
import { join } from 'node:path'
// biome-ignore lint/suspicious/noUndeclaredEnvVars: managed browser evidence.
const output = process.env.DEV_RUNNER_ARTIFACTS

test('facility legend distinguishes accessible toilets and station services', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto('/premises/kennedy-town')
  await expect(page.getByRole('list', { name: 'Map symbol legend' })).toBeVisible({
    timeout: 60000,
  })
  expect((await (await page.request.get('/api/auth/get-session')).json()).user.id).toBe(
    'hype-local-agent-admin',
  )
  const legend = page.getByRole('list', { name: 'Map symbol legend' })
  for (const label of [
    'Paid area',
    'Unpaid area',
    'Level change',
    'Accessible toilet',
    'Male toilet',
    'Female toilet',
    'Helpline',
    'SOS Intercom',
    'Police sign-in box',
    'Ticket machine',
  ]) {
    await expect(legend).toContainText(label)
  }
  const panel = page.getByRole('region', { name: 'Station layout panel' })
  await expect(panel.getByText('Paid area', { exact: true })).toHaveCount(0)
  await page.getByRole('combobox', { name: 'Station level' }).click()
  await page.getByRole('option', { name: 'Concourse Level', exact: true }).click()
  await expect(page.locator('[data-station-scene="plan"]')).toBeVisible()
  await page.getByRole('searchbox', { name: 'Search location index' }).fill('7-Eleven')
  await expect(panel).toContainText('7-Eleven')
  await page.getByRole('searchbox', { name: 'Search location index' }).fill('')
  await panel.getByRole('button', { name: 'Location index', exact: true }).click()
  await expect(
    page.getByRole('searchbox', { name: 'Search location index' }),
  ).toHaveCount(0)
  await panel.getByRole('button', { name: 'Location index', exact: true }).click()
  await panel.getByRole('button', { name: 'Levels', exact: true }).click()
  await expect(page.getByRole('combobox', { name: 'Station level' })).toHaveCount(0)
  await panel.getByRole('button', { name: 'Levels', exact: true }).click()
  const indexBounds = await panel
    .getByRole('button', { name: 'Location index', exact: true })
    .boundingBox()
  const levelBounds = await panel
    .getByRole('button', { name: 'Levels', exact: true })
    .boundingBox()
  expect(levelBounds.y).toBeLessThan(indexBounds.y)
  await expect(
    panel.getByRole('navigation', { name: 'Official station maps' }),
  ).toHaveCount(0)
  const settings = page.getByRole('button', { name: 'Map settings', exact: true })
  await settings.click()
  const controls = page.getByRole('region', { name: 'Map settings', exact: true })
  await expect(controls.getByRole('slider', { name: 'Station rotation' })).toBeVisible()
  await expect(controls.getByRole('slider', { name: 'Station tilt' })).toBeVisible()
  const settingsBounds = await settings.boundingBox()
  const controlsBounds = await controls.boundingBox()
  expect(controlsBounds.y + controlsBounds.height).toBeLessThan(settingsBounds.y)
  await page.getByRole('button', { name: 'Keyboard shortcuts', exact: true }).click()
  await expect(page.getByRole('dialog')).toContainText('Map shortcuts')
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await settings.focus()
  await page.keyboard.press('?')
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.keyboard.press('Escape')
  await page.getByRole('searchbox', { name: 'Search location index' }).fill('?')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.getByRole('searchbox', { name: 'Search location index' }).fill('')
  await page.getByRole('button', { name: 'Route preview', exact: true }).click()
  await expect(page.getByRole('combobox', { name: 'Route entrance' })).toBeVisible()
  await page.getByRole('button', { name: 'Close map controls' }).click()
  for (const item of await legend.getByRole('button').all()) {
    expect(await item.evaluate(el => getComputedStyle(el).backgroundColor)).not.toBe(
      'rgba(0, 0, 0, 0)',
    )
    expect(
      await item.evaluate(el => parseFloat(getComputedStyle(el).borderRadius)),
    ).toBeGreaterThan(0)
  }
  const legendStyle = await legend.locator('..').evaluate(el => ({
    background: getComputedStyle(el).backgroundColor,
    border: getComputedStyle(el).borderTopWidth,
    centre: el.getBoundingClientRect().y + el.getBoundingClientRect().height / 2,
  }))
  expect(legendStyle.background).toBe('rgba(0, 0, 0, 0)')
  expect(legendStyle.border).toBe('0px')
  expect(Math.abs(legendStyle.centre - 500)).toBeLessThan(2)
  const bounds = await legend.boundingBox()
  expect(bounds.x).toBeGreaterThan(1100)
  const symbols = await legend.locator('li').evaluateAll(items =>
    items.map(item => ({
      label: item.textContent.trim(),
      path: item.querySelector('path')?.getAttribute('d'),
      color: item.querySelector('path')?.getAttribute('stroke'),
    })),
  )
  const services = symbols.filter(item =>
    /Helpline|SOS Intercom|Police sign-in box|Ticket machine/.test(item.label),
  )
  expect(new Set(services.map(item => item.path)).size).toBe(4)
  expect(new Set(services.map(item => item.color)).size).toBe(4)
  await page.screenshot({ path: join(output, 'facility-colours-desktop.png') })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole('button', { name: 'Close station panel', exact: true }).click()
  await page.getByText('Map symbols', { exact: true }).click()
  await expect(legend).toBeVisible()
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  ).toBe(true)
  await page.screenshot({ path: join(output, 'facility-colours-mobile.png') })
})
