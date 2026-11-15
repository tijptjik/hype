import { test, expect } from '@playwright/test'
import { join } from 'node:path'

test('indoor refresh review issues appear in the super-admin system task queue', async ({
  page,
}) => {
  test.setTimeout(120000)
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto('/admin/tasks')
  expect((await (await page.request.get('/api/auth/get-session')).json()).user.id).toBe(
    'hype-local-agent-admin',
  )
  await expect(page).toHaveURL(/\/admin\/tasks/)
  const resource = page.getByRole('combobox').filter({ hasText: 'All resources' })
  await expect(resource).toBeVisible({ timeout: 60000 })
  await resource.click()
  await page.getByRole('option', { name: 'System tasks', exact: true }).click()
  for (const id of ['kennedy-town-mtr', 'hong-kong-mtr']) {
    const heading = page.getByRole('heading', {
      name: `${id} · Upstream map blocked`,
      exact: true,
    })
    await expect(heading).toBeVisible({ timeout: 60000 })
    await expect(
      heading
        .locator('..')
        .locator('..')
        .getByRole('link', { name: 'Open map editor', exact: true }),
    ).toHaveAttribute('href', `/admin/premises-maps?map=${id}`)
  }
  await expect(page.getByText('Action', { exact: true })).toBeHidden()
  await page.screenshot({
    // biome-ignore lint/suspicious/noUndeclaredEnvVars: managed browser evidence directory.
    path: join(process.env.DEV_RUNNER_ARTIFACTS, 'indoor-refresh-system-tasks.png'),
  })
})
