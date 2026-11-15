import { test, expect } from '@playwright/test'
import { join } from 'node:path'

test('advanced map display has independent complex and building controls', async ({
  page,
}) => {
  test.setTimeout(120000)
  await page.goto('/admin/projects/hkghostsigns#advanced')
  expect((await (await page.request.get('/api/auth/get-session')).json()).user.id).toBe(
    'hype-local-agent-admin',
  )
  await page.getByRole('button', { name: 'Edit', exact: true }).click()
  const building = page.getByRole('switch', {
    name: 'Show building interior maps',
    exact: true,
  })
  const complex = page.getByRole('switch', {
    name: 'Show complex interior maps',
    exact: true,
  })
  await expect(building).toBeVisible()
  await expect(complex).toBeVisible()
  const beforeBuilding = await building.getAttribute('aria-checked')
  const beforeComplex = await complex.getAttribute('aria-checked')
  await building.click()
  await expect(building).toHaveAttribute(
    'aria-checked',
    beforeBuilding === 'true' ? 'false' : 'true',
  )
  await expect(complex).toHaveAttribute('aria-checked', beforeComplex)
  await complex.click()
  await expect(complex).toHaveAttribute(
    'aria-checked',
    beforeComplex === 'true' ? 'false' : 'true',
  )
  for (const width of [1440, 1200]) {
    await page.setViewportSize({ width, height: 1000 })
    await building.scrollIntoViewIfNeeded()
    await expect(building).toBeVisible()
    const box = await building.boundingBox()
    expect(box.x + box.width).toBeLessThanOrEqual(width)
    // biome-ignore lint/suspicious/noUndeclaredEnvVars: managed runner artifact directory.
    await page.screenshot({
      path: join(process.env.DEV_RUNNER_ARTIFACTS, `map-display-${width}.png`),
    })
  }
  // Restore both draft values; no test preferences are saved to the shared project.
  await building.click()
  await complex.click()
  await expect(building).toHaveAttribute('aria-checked', beforeBuilding)
  await expect(complex).toHaveAttribute('aria-checked', beforeComplex)
})
