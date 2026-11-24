import { join } from 'node:path'
import { expect, test } from '@playwright/test'

test('keeps Field Sessions accessible after Field Entries is moved', async ({
  page,
}) => {
  test.setTimeout(120_000)
  await page.setViewportSize({ width: 1600, height: 1000 })
  await page.goto('/admin', { waitUntil: 'domcontentloaded' })
  const auth = await (await page.request.get('/api/auth/get-session')).json()
  expect(auth.user.id).toBe('hype-local-agent-admin')

  const menu = page.getByRole('navigation', { name: 'Admin menu' })
  await menu.getByRole('button', { name: 'All views' }).click()
  await expect(menu.getByRole('link', { name: 'Field Sessions' })).toHaveAttribute(
    'href',
    '/admin/field-recorder',
  )
  await expect(menu.getByRole('link', { name: 'Field Entries' })).toHaveCount(0)
  await menu.getByRole('link', { name: 'Field Sessions' }).click()
  const editor = page.getByRole('region', { name: 'Field sessions' })
  const session = editor.getByRole('link').first()
  await expect(editor).toBeVisible({ timeout: 60_000 })

  const toolbarTitle = page
    .getByRole('paragraph')
    .filter({ hasText: /^Field Sessions$/ })
  await expect(toolbarTitle).toBeVisible()
  await expect(
    page.getByRole('heading', { level: 1, name: 'Field Sessions', exact: true }),
  ).toHaveCount(0)
  await expect(session).toBeVisible({ timeout: 60_000 })
  await expect(session).toContainText(/\d+\s+records?/)
  await expect(session).toContainText(/Created by .+/)
  await expect(session.locator('time')).toHaveAttribute('datetime', /\d{4}-\d{2}-\d{2}/)

  // Check the actual rendered row against its column headings in the dark palette.
  await page.evaluate(() =>
    document.documentElement.setAttribute('data-theme', 'hype-dark'),
  )
  const heading = editor.getByText('Session', { exact: true }).first()
  await expect(heading).toBeVisible()
  const starts = (element: Element) =>
    Array.from(element.children, child =>
      Math.round(child.getBoundingClientRect().left),
    )
  expect(await session.evaluate(starts)).toEqual(
    await heading.locator('..').evaluate(starts),
  )
  const contrast = await session.evaluate(row => {
    const ctx = document.createElement('canvas').getContext('2d')!
    const luminance = (color: string) => {
      ctx.fillStyle = color
      ctx.fillRect(0, 0, 1, 1)
      const rgb = Array.from(ctx.getImageData(0, 0, 1, 1).data)
        .slice(0, 3)
        .map(v => v / 255)
        .map(v => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
      return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722
    }
    const background = luminance(getComputedStyle(row).backgroundColor)
    return Array.from(
      row.querySelectorAll('span, time'),
      cell => (luminance(getComputedStyle(cell).color) + 0.05) / (background + 0.05),
    )
  })
  expect(Math.min(...contrast)).toBeGreaterThanOrEqual(4.5)
  const artifacts = process.env.DEV_RUNNER_ARTIFACTS
  if (artifacts)
    await page.screenshot({ path: join(artifacts, 'field-sessions-dark-desktop.png') })

  // Lengthen the displayed title without changing the persisted session.
  const title = session.locator(':scope > span').first().locator('span').first()
  const original = await title.innerText()
  await title.evaluate(el => {
    el.textContent = 'A long field session title '.repeat(8)
  })
  expect(await session.evaluate(starts)).toEqual(
    await heading.locator('..').evaluate(starts),
  )
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(heading).toBeHidden()
  await expect(session.locator('time')).toBeInViewport()
  expect(await session.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true)
  if (artifacts)
    await page.screenshot({ path: join(artifacts, 'field-sessions-dark-mobile.png') })
  await title.evaluate((el, value) => {
    el.textContent = value
  }, original)
  await page.setViewportSize({ width: 1600, height: 1000 })

  await expect(page.getByLabel('Session name')).toHaveCount(0)
  await page.getByRole('button', { name: 'New', exact: true }).click()
  await expect(page.getByLabel('Session name')).toBeVisible()
  await page.getByRole('link', { name: 'Cancel' }).click()
  await page.locator('a[href*="field-recorder?session="]').first().click()
  const profile = page
    .getByRole('banner')
    .getByRole('button', { name: 'Profile', exact: true })
  const fields = page
    .getByRole('banner')
    .getByRole('button', { name: 'Fields', exact: true })
  const locations = page
    .getByRole('banner')
    .getByRole('button', { name: 'Locations', exact: true })
  await expect(profile).toHaveAttribute('aria-current', 'page')
  const surface = page.locator('[data-form-surface]')
  const sectionTitle = (title: string) =>
    surface.locator('header').getByText(title, { exact: true })
  await expect(
    page.getByRole('heading', { name: 'Field Sessions', exact: true }),
  ).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'All sessions' })).toHaveCount(0)
  const code = page.getByLabel('Session code', { exact: true })
  await expect(code).toBeVisible()
  await expect(sectionTitle('Title template')).toBeVisible()
  await expect(
    surface.getByRole('switch', { name: /Visible.*Feature type/ }),
  ).toBeDisabled()
  await expect(surface.getByText('Recording settings', { exact: true })).toHaveCount(0)
  await expect(
    surface.getByRole('button', { name: 'Save session configuration' }),
  ).toHaveCount(0)
  await fields.click()
  await expect(sectionTitle('Project properties')).toBeVisible()
  await expect(code).toBeHidden()
  await locations.click()
  await expect(page.getByRole('region', { name: 'Vetted Locations' })).toBeVisible()
  await page.goBack()
  await expect(fields).toHaveAttribute('aria-current', 'page')
  await page.reload()
  await expect(sectionTitle('Project properties')).toBeVisible({ timeout: 60_000 })
  await profile.click()
  await expect(code).toBeVisible()

  await page.goto('/admin/fieldresearch', { waitUntil: 'domcontentloaded' })
  await expect(page).toHaveURL(/\/admin\/field-recorder$/)
  await expect(editor).toBeVisible({ timeout: 60_000 })
  await expect(toolbarTitle).toBeVisible()
})

test('shows and clears the required session code error', async ({ page }) => {
  test.setTimeout(120_000)
  await page.goto('/admin/field-recorder', { waitUntil: 'domcontentloaded' })
  const auth = await (await page.request.get('/api/auth/get-session')).json()
  expect(auth.user.id).toBe('hype-local-agent-admin')
  await page.locator('a[href*="field-recorder?session="]').first().click()
  const code = page.getByLabel('Session code', { exact: true })
  await expect(code).toBeVisible({ timeout: 60_000 })
  const fields = page
    .getByRole('banner')
    .getByRole('button', { name: 'Fields', exact: true })

  // Validate and highlight the required code before submitting it.
  await page
    .getByRole('banner')
    .getByRole('button', { name: 'Edit', exact: true })
    .click()
  await code.fill('  ')
  await page
    .getByRole('banner')
    .getByRole('button', { name: 'Save', exact: true })
    .click()
  await expect(code).toHaveAttribute('aria-invalid', 'true')
  await expect(page.getByRole('alert')).toContainText('Enter a session code.')
  await code.fill('SURVEY')
  await expect(code).not.toHaveAttribute('aria-invalid', 'true')
  await expect(page.getByText('Enter a session code.', { exact: true })).toHaveCount(0)
  await code.fill('  ')
  await fields.click()
  await expect(page.getByRole('alert')).toContainText(
    'Enter a session code on the Profile tab.',
  )
})
