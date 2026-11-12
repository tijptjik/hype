import { expect, test } from '@playwright/test'
import path from 'node:path'

test('installed donor template exposes the approved expression', async ({ page }) => {
  const artifacts = process.env.DEV_RUNNER_ARTIFACTS
  if (!artifacts) throw new Error('Run through dev-remote')
  await page.goto('/')
  const session = await (
    await page.context().request.get('/api/auth/get-session')
  ).json()
  expect(session.user.id).toBe('hype-local-agent-admin')
  const response = await page.goto('/admin/templates')
  expect(response?.ok()).toBe(true)
  await page.getByRole('button', { name: /Breadline Donor breadline-donor/ }).click()
  const expression = page.getByRole('textbox', { name: 'Expression', exact: true })
  await expect(expression).toHaveValue(
    /optional\(join\(accessHint, cases\(properties\.4ql4aG0vBWsc, "Paid", "", ""\), " - "\), " \(", "\)"\)/,
  )
  await page.screenshot({
    path: path.join(artifacts, 'installed-donor-template.png'),
    fullPage: true,
  })
})
