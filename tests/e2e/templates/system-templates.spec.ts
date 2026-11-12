import { expect, test } from '@playwright/test'
import path from 'node:path'

test('system templates remain inspectable and read only in the catalogue', async ({
  page,
}) => {
  const artifacts = process.env.DEV_RUNNER_ARTIFACTS
  if (!artifacts) throw new Error('Run through dev-remote')
  await page.goto('/')
  const session = await (
    await page.context().request.get('/api/auth/get-session')
  ).json()
  expect(session.user.id).toBe('hype-local-agent-admin')
  const response = await page.goto('/admin/templates')
  expect(response?.ok()).toBe(true)
  await expect(page).toHaveURL(/\/admin\/templates/)
  await expect(page.getByRole('button', { name: /Naming check/ })).toHaveCount(0)
  const newTemplate = page.getByRole('button', { name: 'New template', exact: true })
  await expect(newTemplate).toBeVisible({ timeout: 30000 })
  expect(
    await newTemplate.evaluate(element =>
      Boolean(element.closest('[data-adaptive-toolbar-left-group]')),
    ),
  ).toBe(true)
  for (const width of [1440]) {
    await page.setViewportSize({ width, height: 1000 })
    for (const [name, property] of [
      ['Feature name', '{{ feature.name }}'],
      ['Location name', '{{ source.name }}'],
      [
        'Location brand and branch',
        '{{ pair(brand.name, branch, " - ") ?? brand.name ?? source.name }}',
      ],
    ]) {
      await page.getByRole('button', { name: new RegExp(`${name} system-`) }).click()
      await expect(
        page.getByRole('textbox', { name: 'Expression', exact: true }),
      ).toHaveValue(property)
      await expect(
        page.getByRole('textbox', { name: 'Expression', exact: true }),
      ).not.toBeEditable()
      await expect(page.getByRole('button', { name: 'Edit', exact: true })).toHaveCount(
        0,
      )
      await expect(
        page.getByRole('button', { name: 'Apply to Feature', exact: true }),
      ).toHaveCount(0)
    }
    await page.setViewportSize({ width, height: 600 })
    const main = page.locator('main[data-responsive-main]')
    await main.evaluate(element => {
      element.scrollTop = element.scrollHeight
    })
    await expect
      .poll(() => main.evaluate(element => element.scrollTop))
      .toBeGreaterThan(0)
    await expect(page.locator('output')).toBeInViewport()
    await page.setViewportSize({ width, height: 1000 })
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true)
    await page.screenshot({
      path: path.join(artifacts, `system-templates-${width}.png`),
      fullPage: true,
    })
  }
  await newTemplate.click()
  await expect(page.getByRole('textbox', { name: 'Name', exact: true })).toBeEditable()
  await expect(
    page.getByRole('button', { name: 'Insert Property', exact: true }),
  ).toBeVisible()
  await page.getByRole('textbox', { name: 'Name', exact: true }).fill('Unsaved preview')
  await expect(newTemplate).toBeDisabled()
})
