import { expect, test } from '@playwright/test'
import path from 'node:path'

test('edits fixed blocks and keeps options visible while editing surrounding text', async ({
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
  const block = '{{ pair(brand.name, branch, " - ") ?? source.name }}'
  await expect(page.getByRole('group', { name: 'Options', exact: true })).toBeVisible()
  const token = page.getByRole('button', { name: `Select ${block}`, exact: true })
  const beforeHover = await token.locator('..').boundingBox()
  await token.hover()
  const afterHover = await token.locator('..').boundingBox()
  expect(afterHover?.width).toBe(beforeHover?.width)
  const remove = page.getByRole('button', { name: `Remove ${block}`, exact: true })
  await expect(remove).toHaveCSS('opacity', '1')
  for (const theme of ['breadline-light', 'hype-black']) {
    await page.evaluate(
      theme => document.documentElement.setAttribute('data-theme', theme),
      theme,
    )
    await page.screenshot({
      path: path.join(artifacts, `token-remove-overlay-${theme}.png`),
    })
  }
  await page.evaluate(() =>
    document.documentElement.setAttribute('data-theme', 'breadline-light'),
  )
  const removeBox = await remove.boundingBox()
  expect(removeBox!.x + removeBox!.width).toBeLessThanOrEqual(
    afterHover!.x + afterHover!.width,
  )
  await page.getByRole('button', { name: `Select ${block}`, exact: true }).click()
  await expect(page.getByRole('group', { name: 'Options', exact: true })).toContainText(
    'fallback',
  )
  await page.getByRole('textbox', { name: 'Separator', exact: true }).fill(' / ')
  await expect(page.locator('output')).toHaveText('Sample Brand / Sample Branch')
  await page.getByRole('textbox', { name: 'Text 1', exact: true }).fill('Hello ')
  await expect(
    page.getByRole('textbox', { name: 'Separator', exact: true }),
  ).toHaveValue(' / ')
  await expect(page.locator('output')).toHaveText('Hello Sample Brand / Sample Branch')
  await page.getByRole('textbox', { name: 'Text 3', exact: true }).click()
  await page.getByRole('button', { name: 'Insert Optional text', exact: true }).click()
  await page.getByRole('textbox', { name: 'Prefix', exact: true }).fill(' (')
  await page.getByRole('textbox', { name: 'Suffix', exact: true }).fill(')')
  await expect(page.locator('output')).toContainText('(Sample Name)')
  const optionalBlock = page.getByRole('button', {
    name: 'Select {{ optional(source.name, " (", ")") }}',
    exact: true,
  })
  const pairBlock = page.getByRole('button', {
    name: 'Select {{ pair(brand.name, branch, " / ") ?? source.name }}',
    exact: true,
  })
  await optionalBlock.dragTo(pairBlock)
  await expect(page.locator('output')).toHaveText(
    'Hello  (Sample Name)Sample Brand / Sample Branch',
  )
  await optionalBlock.focus()
  await optionalBlock.press('Alt+ArrowRight')
  await expect(page.locator('output')).toHaveText(
    'Hello Sample Brand / Sample Branch (Sample Name)',
  )
  const optional = page.getByRole('button', {
    name: 'Remove {{ optional(source.name, " (", ")") }}',
    exact: true,
  })
  await optional.focus()
  await optional.press('Enter')
  await expect(optional).toHaveCount(0)
  await expect(page.getByRole('group', { name: 'Options', exact: true })).toContainText(
    'Select a component block',
  )
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 })
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    ).toBe(true)
    await page.screenshot({
      path: path.join(artifacts, `template-blocks-${width}.png`),
      fullPage: true,
    })
  }
  await page.getByRole('button', { name: 'About template components' }).hover()
  await expect(page.getByText('Build a name with components')).toBeVisible()
})

test('chooses case values and removes a mapping', async ({ page }) => {
  await page.goto('/')
  const session = await (
    await page.context().request.get('/api/auth/get-session')
  ).json()
  expect(session.user.id).toBe('hype-local-agent-admin')
  expect((await page.context().request.get('/admin')).status()).toBe(200)
  await page.route('**/__template-check.html', route =>
    route.fulfill({
      contentType: 'text/html',
      body: '<html lang="en"><head><script>globalThis.__sveltekit_dev={env:{}}</script></head><body class="bits-theme"><div id="app"></div><script type="module" src="/src/tests/fixtures/displayTemplateCheck.ts"></script></body></html>',
    }),
  )
  await page.goto('/__template-check.html')
  await page.getByRole('button', { name: 'Insert Cases' }).click()
  await page.getByRole('button', { name: /properties.open/ }).click()
  await expect(
    page.getByRole('button', { name: /Select .*properties\.opening_status/ }),
  ).toBeVisible()
  await page.getByLabel('Value 1').selectOption('Open')
  await page.getByLabel('Replacement 1').fill('O')
  await page.getByRole('button', { name: 'Add mapping' }).click()
  await page.getByLabel('Value 2').selectOption('Closed')
  await page.getByRole('button', { name: 'Remove mapping 1' }).click()
  await expect(page.getByLabel('Value 1')).toHaveValue('Closed')
  await expect(page.getByRole('button', { name: 'Remove mapping 1' })).toHaveCount(0)
})
