import { test, expect } from '@playwright/test'
import { join } from 'node:path'

test('station connector relief renders exposed edge faces', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto('/premises/kennedy-town-mtr')
  await expect(page.getByRole('list', { name: 'Map symbol legend' })).toBeVisible({
    timeout: 60000,
  })
  expect((await (await page.request.get('/api/auth/get-session')).json()).user.id).toBe(
    'hype-local-agent-admin',
  )
  expect((await page.request.get('/admin')).ok()).toBe(true)
  await page
    .getByRole('button', { name: 'Open Concourse Level', exact: true })
    .last()
    .click()
  await expect(page.locator('[data-station-scene="plan"]')).toBeVisible()
  await page.getByRole('button', { name: 'Map settings', exact: true }).click()
  await page.getByRole('slider', { name: 'Station tilt', exact: true }).fill('45')
  await page.getByRole('button', { name: 'Close map controls' }).click()
  await expect(page.locator('[data-connector-recess-face]').first()).toBeVisible()
  const relief = page.locator('[data-connector-relief]')
  expect(await relief.count()).toBeGreaterThan(1)
  expect(await relief.locator('linearGradient').count()).toBeGreaterThan(0)
  await expect(page.locator('[data-connector-symbol]')).toHaveCount(0)
  const scene = page.locator('[data-station-scene="plan"]')
  const before = await scene.getAttribute('viewBox')
  const target = page.locator('[data-connector-relief]').first()
  const box = await target.boundingBox()
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2 + 70, box.y + box.height / 2 + 40, {
    steps: 10,
  })
  await page.mouse.up()
  await expect(scene).not.toHaveAttribute('viewBox', before)
  expect(await page.evaluate(() => window.getSelection()?.toString())).toBe('')
  const bearing = Number(await scene.getAttribute('data-bearing'))
  await page.keyboard.press('ArrowRight')
  await expect(scene).toHaveAttribute('data-bearing', String(bearing + 10))
  await page.keyboard.press('ArrowLeft')
  await expect(scene).toHaveAttribute('data-bearing', String(bearing))
  const controls = page.getByRole('application', {
    name: 'Station plan controls',
    exact: true,
  })
  await controls.focus()
  for (let i = 0; i < 4; i++) await controls.press('+')
  // biome-ignore lint/suspicious/noUndeclaredEnvVars: managed browser evidence.
  await page.screenshot({
    path: join(process.env.DEV_RUNNER_ARTIFACTS, 'connector-relief.png'),
  })
})

test('raised platform flights are not clipped by the floor boundary', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto('/premises/kennedy-town-mtr')
  await expect(page.getByRole('list', { name: 'Map symbol legend' })).toBeVisible({
    timeout: 60000,
  })
  expect((await (await page.request.get('/api/auth/get-session')).json()).user.id).toBe(
    'hype-local-agent-admin',
  )
  expect((await page.request.get('/admin')).ok()).toBe(true)
  await page
    .getByRole('button', { name: 'Open Platform Level', exact: true })
    .last()
    .click()
  await expect(page.locator('[data-station-scene="plan"]')).toBeVisible()
  await page.getByRole('button', { name: 'Map settings', exact: true }).click()
  await page.getByRole('slider', { name: 'Station tilt', exact: true }).fill('45')
  await page.getByRole('button', { name: 'Close map controls' }).click()
  const raised = page.locator('[data-connector-relief][data-descending="false"]')
  await expect(raised.first()).toBeVisible()
  await expect(page.locator('[data-station-scene="plan"]')).toHaveAttribute(
    'data-station-transition',
    'settled',
  )
  await expect(page.locator('[data-station-scene="plan"]')).toHaveAttribute(
    'data-camera-animating',
    'false',
  )
  const checks = await raised.evaluateAll(flights =>
    flights.map(element => {
      let unclipped = true
      for (let node = element; node instanceof SVGElement; node = node.parentElement) {
        if (
          getComputedStyle(node).clipPath !== 'none' ||
          getComputedStyle(node).maskImage !== 'none'
        )
          unclipped = false
      }
      const id = element.getAttribute('data-connector-relief')
      const walls = [
        ...element.parentElement.querySelectorAll('[data-connector-walls]'),
      ].find(node => node.getAttribute('data-connector-walls') === id)
      return {
        unclipped,
        faces: walls?.querySelectorAll('[data-connector-recess-face]').length ?? 0,
        wallsBehind: Boolean(
          walls &&
            walls.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING,
        ),
      }
    }),
  )
  expect(checks.length).toBeGreaterThan(0)
  for (const check of checks) {
    expect(check.unclipped).toBe(true)
    expect(check.wallsBehind).toBe(true)
    expect(check.faces).toBeGreaterThan(0)
  }
  const controls = page.getByRole('application', {
    name: 'Station plan controls',
    exact: true,
  })
  await controls.focus()
  for (let i = 0; i < 3; i++) await controls.press('+')
  // biome-ignore lint/suspicious/noUndeclaredEnvVars: managed browser evidence.
  await page.screenshot({
    path: join(process.env.DEV_RUNNER_ARTIFACTS, 'platform-raised-flights.png'),
  })
})
