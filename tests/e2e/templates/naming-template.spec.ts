import { expect, test } from '@playwright/test'
import path from 'node:path'

test('inserts and edits components at the cursor without saving test records', async ({
  page,
}) => {
  const artifacts = process.env.DEV_RUNNER_ARTIFACTS
  if (!artifacts) throw new Error('Run through dev-remote')
  await page.goto('/')
  const session = await (
    await page.context().request.get('/api/auth/get-session')
  ).json()
  expect(session.user.id).toBe('hype-local-agent-admin')
  await page.route('**/__template-check.html', route =>
    route.fulfill({
      contentType: 'text/html',
      body: '<html lang="en" data-theme="breadline-light"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>@layer theme,base,components,utilities;</style><script>globalThis.__sveltekit_dev={env:{}}</script></head><body class="bits-theme"><div id="app"></div><script type="module" src="/src/tests/fixtures/displayTemplateCheck.ts"></script></body></html>',
    }),
  )
  await page.goto('/__template-check.html')
  const expression = page.getByRole('textbox', { name: 'Expression', exact: true })
  await expression.fill('Before  after')
  await expression.evaluate((element: HTMLTextAreaElement) => {
    element.focus()
    element.setSelectionRange(7, 7)
    element.dispatchEvent(new Event('select', { bubbles: true }))
  })
  await page.getByRole('button', { name: 'Insert Optional text', exact: true }).click()
  await expect(expression).toHaveValue(
    'Before {{ optional(source.name, "", "") }} after',
  )
  await expect(page.getByRole('group', { name: 'Component fields' })).toBeVisible()
  await page.getByRole('textbox', { name: 'Prefix', exact: true }).fill('Hello ')
  await expect(expression).toHaveValue(
    'Before {{ optional(source.name, "Hello ", "") }} after',
  )
  await expression.fill('{{ pair(brand.name, branch, " - ") ?? source.name }}')
  await expression.evaluate((element: HTMLTextAreaElement) => {
    element.setSelectionRange(5, 5)
    element.dispatchEvent(new Event('select', { bubbles: true }))
  })
  await page.getByRole('textbox', { name: 'Separator', exact: true }).fill(' / ')
  await expect(expression).toHaveValue(
    '{{ pair(brand.name, branch, " / ") ?? source.name }}',
  )
  await expect(page.locator('output')).toHaveText('Sample Brand / Sample Branch')
  const firstProperty = page.getByRole('group', { name: 'First property', exact: true })
  await firstProperty
    .getByRole('button', { name: 'Name Provided name text', exact: true })
    .click()
  await expect(expression).toHaveValue(
    '{{ pair(source.name, branch, " / ") ?? source.name }}',
  )
  await expect(page.locator('output')).toHaveText('Sample Name / Sample Branch')
  await expression.fill('')
  await expression.focus()
  await page.getByRole('button', { name: 'Insert Join', exact: true }).click()
  await expect(expression).toHaveValue(/join\(/)
  await page.getByRole('textbox', { name: 'Separator', exact: true }).fill(' + ')
  await expect(expression).toHaveValue(/, " \+ "\)/)
  await expect(page.getByText('Sample values', { exact: true })).toHaveCount(0)
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 })
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    ).toBe(true)
    await page.screenshot({
      path: path.join(artifacts, `shared-naming-editor-${width}.png`),
      fullPage: true,
    })
  }
})
