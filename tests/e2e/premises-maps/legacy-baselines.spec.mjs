import { test, expect } from '@playwright/test'

test('repaired legacy publications serve original baselines and curated connections', async ({
  page,
}) => {
  test.setTimeout(240000)
  await page.goto('/admin/premises-maps')
  expect((await (await page.request.get('/api/auth/get-session')).json()).user.id).toBe(
    'hype-local-agent-admin',
  )
  await expect(
    page.getByRole('combobox', { name: 'Choose a map', exact: true }),
  ).toBeVisible({ timeout: 60000 })
  for (const [id, count] of [
    ['kennedy-town-mtr', 17],
    ['hong-kong-mtr', 12],
    ['hysan-place', 40],
  ]) {
    const pointer = await (await page.request.get(`/api/premises-maps/${id}`)).json()
    const resource = await page.request.get(pointer.url)
    expect(resource.ok()).toBe(true)
    const bundle = await resource.json()
    expect(bundle.data.sourceSnapshotHash).toMatch(/^[a-f0-9]{64}$/)
    expect(bundle.data.connections).toHaveLength(count)
    await page.goto(`/${id === 'hysan-place' ? 'buildings' : 'premises'}/${id}`)
    await expect(page.locator('[data-station-scene]')).toBeVisible({ timeout: 60000 })
  }
  await page.reload()
  await expect(page.locator('[data-station-scene]')).toBeVisible({ timeout: 60000 })
})
