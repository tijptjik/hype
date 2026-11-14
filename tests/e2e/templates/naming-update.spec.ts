import { expect, test } from '@playwright/test'
import path from 'node:path'

test('reviews existing donor names before staging a changed naming default', async ({
  page,
}) => {
  test.setTimeout(180000)
  const artifacts = process.env.DEV_RUNNER_ARTIFACTS
  if (!artifacts) throw new Error('Run through dev-remote')
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/admin/layers/1msQMcuqfHrP#location')
  const session = await (
    await page.context().request.get('/api/auth/get-session')
  ).json()
  expect(session.user.id).toBe('hype-local-agent-admin')
  await expect(page).toHaveURL(/\/admin\/layers\/1msQMcuqfHrP/)
  await page.getByRole('button', { name: 'Edit', exact: true }).click()
  const custom = page.getByRole('switch', { name: 'Custom', exact: true })
  if ((await custom.getAttribute('aria-checked')) !== 'true') await custom.click()
  await page.getByRole('heading', { name: 'Place', exact: true }).click()
  await page
    .getByRole('button', { name: 'Configure naming rule', exact: true })
    .first()
    .click()
  const editor = page.getByRole('dialog', {
    name: /How should the features in your .* be named\?/,
  })
  await editor.getByRole('combobox', { name: 'Naming template' }).click()
  await page.getByRole('option', { name: /Breadline donor naming/ }).click()
  await expect(editor.getByText(/^Example:/).first()).toBeVisible({ timeout: 60000 })
  await expect(editor.getByText('Could not load saved examples.')).toHaveCount(0)
  await page.screenshot({ path: path.join(artifacts, 'real-naming-examples.png') })
  await editor.getByRole('button', { name: 'Accept naming rule' }).click()
  const prompt = page.getByRole('dialog', {
    name: 'Where should this naming rule apply?',
  })
  await expect(prompt).toBeVisible()
  await expect(prompt.getByRole('radio', { name: /Keep custom titles/ })).toBeChecked()
  await expect(
    prompt.getByText('organisations, projects and layers', { exact: true }),
  ).toHaveCount(0)
  await prompt.getByRole('radio', { name: /Reset all custom titles/ }).check()
  await prompt.getByRole('button', { name: 'Review changes' }).click()
  const review = page.getByRole('dialog', { name: 'Are you sure?' })
  await expect(review.getByRole('button', { name: 'Confirm changes' })).toBeEnabled({
    timeout: 120000,
  })
  await expect(
    review.getByRole('columnheader', { name: 'Before', exact: true }),
  ).toBeVisible()
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 700 })
    await expect(
      review.getByRole('button', { name: 'Confirm changes' }),
    ).toBeInViewport()
    const box = await review.boundingBox()
    expect(box?.width).toBeLessThanOrEqual(width)
    await page.screenshot({ path: path.join(artifacts, `naming-update-${width}.png`) })
  }
  await review.getByRole('button', { name: 'Back' }).click()
  await prompt.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(prompt).not.toBeVisible()
  await page.setViewportSize({ width: 1440, height: 900 })
  // Leave the parent unsaved: this check previews real data without renaming donors.
  await expect(
    page.getByText('Existing Feature updates will be included when you save.'),
  ).toHaveCount(0)
})
