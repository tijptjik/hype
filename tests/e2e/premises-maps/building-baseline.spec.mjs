import { test, expect } from '@playwright/test'
import { createHash } from 'node:crypto'
import { join } from 'node:path'

test('published building baseline exposes catalogue entries and renders representative maps', async ({
  page,
}) => {
  test.setTimeout(300000)
  await page.goto('/admin')
  expect((await (await page.request.get('/api/auth/get-session')).json()).user.id).toBe(
    'hype-local-agent-admin',
  )
  await expect(page).toHaveURL(/\/admin/)
  const response = await page.request.get('/api/premises-maps')
  expect(response.ok()).toBe(true)
  const catalogue = await response.json()
  expect(catalogue.filter(map => map.kind === 'station')).toHaveLength(98)
  expect(catalogue.filter(map => map.kind === 'building')).toHaveLength(689)
  for (const name of ['Lee Theatre', 'Windsor House', 'Festival City', 'Hysan Place']) {
    const map = catalogue.find(map => map.name.toLowerCase() === name.toLowerCase())
    expect(map, name).toBeTruthy()
    const pointer = await (
      await page.request.get(`/api/premises-maps/${map.id}`)
    ).json()
    expect(pointer.hash).toBe(map.publishedHash)
    const resource = await page.request.get(pointer.url)
    expect(resource.ok()).toBe(true)
    const bytes = await resource.body()
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(pointer.hash)
    await resource.dispose()
    await page.goto(`/premises/${map.id}`)
    await expect(page.locator('[data-station-scene]')).toBeVisible({ timeout: 60000 })
    await expect(page.getByRole('navigation', { name: 'Indoor levels' })).toBeVisible()
    await page.reload()
    await expect(page.locator('[data-station-scene]')).toBeVisible({ timeout: 60000 })
    await page.screenshot({
      path: join(process.env.DEV_RUNNER_ARTIFACTS, `${map.id}.png`),
    })
  }
})
