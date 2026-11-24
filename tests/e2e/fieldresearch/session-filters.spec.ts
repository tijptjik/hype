import { expect, test } from '@playwright/test'

test('filters field sessions by creator and record presence', async ({ page }) => {
  test.setTimeout(120000)
  await page.goto('/admin/field-recorder', { waitUntil: 'commit', timeout: 60000 })
  const session = await (await page.request.get('/api/auth/get-session')).json()
  expect(session.user.id).toBe('hype-local-agent-admin')
  await expect(page).toHaveURL(/\/admin\/field-recorder/)
  await expect(page.getByRole('region', { name: 'Field sessions' })).toBeVisible({
    timeout: 60000,
  })
  await page.getByRole('button', { name: 'Show filters' }).click()
  const creator = page.getByRole('combobox', { name: 'Filter by creator' })
  await expect(creator).toBeVisible()
  await creator.click()
  const creatorChoice = page
    .getByRole('option')
    .filter({ hasNotText: 'All creators' })
    .first()
  if (await creatorChoice.count()) {
    const name = await creatorChoice.innerText()
    await creatorChoice.click()
    await expect(page.getByText(name, { exact: true }).first()).toBeVisible()
  } else await page.keyboard.press('Escape')
  const noRecords = page.waitForResponse(
    response =>
      response.url().includes('/getResearchSessions') && response.status() === 200,
  )
  await page.getByRole('button', { name: 'None', exact: true }).click()
  await noRecords
  const rows = page.getByRole('region', { name: 'Field sessions' }).locator('a')
  await expect
    .poll(async () => {
      const texts = await rows.allTextContents()
      return texts.every(text => /0\s+records/.test(text))
    })
    .toBe(true)
  const withRecords = page.waitForResponse(
    response =>
      response.url().includes('/getResearchSessions') && response.status() === 200,
  )
  await page.getByRole('button', { name: 'Has', exact: true }).click()
  await withRecords
  await expect
    .poll(async () => {
      const texts = await rows.allTextContents()
      return texts.every(text => !/0\s+records/.test(text))
    })
    .toBe(true)
})
