import { expect, test } from '@playwright/test'
import path from 'node:path'

test('project naming shows its inherited default before overriding', async ({
  page,
}) => {
  const artifacts = process.env.DEV_RUNNER_ARTIFACTS
  if (!artifacts) throw new Error('Run through dev-remote')
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto('/admin/projects/hkghostsigns#location')
  const session = await (
    await page.context().request.get('/api/auth/get-session')
  ).json()
  expect(session.user.id).toBe('hype-local-agent-admin')
  await expect(page).toHaveURL(/\/admin\/projects\/hkghostsigns/)
  await page.getByRole('button', { name: 'Edit', exact: true }).click()
  const custom = page.getByRole('switch', { name: 'Custom', exact: true })
  if ((await custom.count()) && (await custom.getAttribute('aria-checked')) !== 'true')
    await custom.click()
  await page
    .getByRole('button', { name: 'Define custom rules', exact: true })
    .first()
    .click()
  const editor = page.locator('[data-naming-editor]').first()
  await expect(
    editor.getByText('Using inherited default', { exact: true }),
  ).toBeVisible()
  const selector = editor.getByRole('combobox', { name: 'Naming template' })
  await expect(selector).toContainText(
    /(Feature name|Linked location name).*inherited default/,
  )
  await selector.click()
  await expect(page.getByRole('option', { name: /inherited default/ })).toHaveAttribute(
    'aria-selected',
    'true',
  )
  await page.screenshot({
    path: path.join(artifacts, 'inherited-naming-project.png'),
    fullPage: true,
  })
  await page.keyboard.press('Escape')
  await editor.getByRole('button', { name: 'Accept naming rule' }).click()
  await expect(
    page.getByRole('button', { name: 'Define custom rules', exact: true }).first(),
  ).toBeVisible()
})
