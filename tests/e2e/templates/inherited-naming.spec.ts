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
  const editor = page.getByRole('dialog', { name: 'Feature naming', exact: true })
  await expect(editor).toBeVisible()
  expect(await editor.evaluate(element => Boolean(element.closest('form')))).toBe(false)
  await expect(editor.getByText('Inherited default', { exact: true })).toBeVisible()
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
  await editor.getByRole('button', { name: 'Create template', exact: true }).click()
  await editor
    .getByRole('textbox', { name: 'Template name' })
    .fill('Unsaved modal test')
  const expression = editor.getByRole('textbox', { name: 'Expression', exact: true })
  await expression.fill('{{ feature.name }}{{ optional(brand.name, " - ", "") }}')
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 700 })
    await expect(editor).toBeVisible()
    await expect
      .poll(() =>
        editor.evaluate(element => {
          const box = element.getBoundingClientRect()
          return element.contains(
            document.elementFromPoint(box.x + box.width / 2, box.y + 20),
          )
        }),
      )
      .toBe(true)
    await expect(
      editor.getByRole('button', { name: 'Accept naming rule' }),
    ).toBeInViewport()
    const box = await editor.boundingBox()
    expect(box?.width).toBeLessThanOrEqual(width)
    const scroller = editor.locator('[data-naming-scroll]')
    await scroller.evaluate(element => {
      element.scrollTop = element.scrollHeight
    })
    await expect(
      editor.getByRole('button', { name: 'Save template', exact: true }),
    ).toBeInViewport()
    await expect(expression).toHaveValue(
      '{{ feature.name }}{{ optional(brand.name, " - ", "") }}',
    )
    await page.screenshot({ path: path.join(artifacts, `naming-modal-${width}.png`) })
  }
  await page.setViewportSize({ width: 1440, height: 1000 })
  await editor.getByRole('button', { name: 'Cancel template', exact: true }).click()
  await editor.getByRole('button', { name: 'Accept naming rule' }).click()
  await expect(
    page.getByRole('button', { name: 'Define custom rules', exact: true }).first(),
  ).toBeVisible()
})
