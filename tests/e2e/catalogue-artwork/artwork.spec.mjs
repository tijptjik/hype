import { test, expect } from '@playwright/test'
import { join } from 'node:path'
test('local catalogue shows active logos with concise labels and no research controls', async ({
  page,
}) => {
  test.setTimeout(180000)
  page.setDefaultTimeout(30000)
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto('/admin/catalogue?id=mtr-brand-mos-burger', {
    waitUntil: 'domcontentloaded',
  })
  expect((await (await page.request.get('/api/auth/get-session')).json()).user.id).toBe(
    'hype-local-agent-admin',
  )
  await expect(page).toHaveURL(/admin\/catalogue/)
  const library = page.getByRole('region', { name: 'Logo library' })
  await expect(library).toBeVisible({ timeout: 60000 })
  await expect(library).toContainText('svg')
  await expect(library).not.toContainText(
    /Needs review|Approved|Scalable|Candidates|source resolution/i,
  )
  const identity = page.getByRole('region', { name: 'Identity', exact: true })
  await expect
    .poll(async () => {
      const identityBox = await identity.boundingBox()
      const libraryBox = await library.boundingBox()
      return Boolean(
        identityBox && libraryBox && libraryBox.y >= identityBox.y + identityBox.height,
      )
    })
    .toBe(true)
  const source = library.locator('[data-artwork-slot="logo"] img')
  await expect(source).toBeVisible()
  const originalSrc = await source.getAttribute('src')
  await expect
    .poll(() => source.evaluate(img => img.complete && img.naturalWidth > 0))
    .toBe(true)
  await expect(library.getByText('Research sources', { exact: true })).toHaveCount(0)
  await expect(
    library.getByText('Marker fallback preview', { exact: true }),
  ).toHaveCount(0)
  await expect(library.getByRole('link', { name: 'Source ↗' })).toBeVisible()
  const profile = page.locator('[data-catalogue-logo-picker] img').first()
  await expect(profile).toHaveAttribute('src', originalSrc)
  await page.screenshot({
    // biome-ignore lint/suspicious/noUndeclaredEnvVars: managed runner artifact directory.
    path: join(process.env.DEV_RUNNER_ARTIFACTS, 'catalogue-logo-library.png'),
  })
  await page.getByRole('button', { name: 'Edit', exact: true }).click()
  await expect(library.getByLabel('Variant code')).toBeVisible()
  await expect(
    library.getByRole('button', { name: 'Approve', exact: true }),
  ).toHaveCount(0)
  await expect(
    library.getByRole('button', { name: 'Remove', exact: true }),
  ).toBeVisible()
  await page.reload()
  await expect(library).toBeVisible({ timeout: 60000 })
  await expect(library.locator('[data-artwork-slot="logo"] img')).toHaveAttribute(
    'src',
    originalSrc,
  )
})

test('preserves themed 7-Eleven artwork and displays compact SVG labels', async ({
  page,
}) => {
  test.setTimeout(120000)
  await page.goto('/admin/catalogue?id=bl-brand-7414c730dd836bb4cddefc9b')
  expect((await (await page.request.get('/api/auth/get-session')).json()).user.id).toBe(
    'hype-local-agent-admin',
  )
  await page.evaluate(() => {
    localStorage.setItem('hype-theme', 'breadline-light')
  })
  await page
    .context()
    .addCookies([
      { name: 'hype-theme', value: 'breadline-light', url: new URL(page.url()).origin },
    ])
  await page.reload()
  await expect(page.getByRole('region', { name: 'Logo library' })).toBeVisible({
    timeout: 60000,
  })
  const logo = page.locator('[data-catalogue-logo-picker] img').first()
  await expect(logo).toHaveAttribute(
    'src',
    '/api/identity-catalogue/logos/6f41b0aa-f588-1fd5-1cb6-376537dc962f',
  )
  await expect
    .poll(() => logo.evaluate(img => img.complete && img.naturalWidth > 0))
    .toBe(true)
  await page.screenshot({
    path: join(process.env.DEV_RUNNER_ARTIFACTS, 'restored-7eleven-svg.png'),
  })
  await expect(page.getByRole('region', { name: 'Logo library' })).toContainText('svg')
  await expect(page.locator('[data-artwork-slot="logo-research"]')).toHaveCount(0)
  await expect(page.getByRole('region', { name: 'Logo library' })).toContainText(
    'logo breadline light',
  )
  await page.goto('/admin/catalogue?id=mtr-brand-calzedonia')
  const library = page.getByRole('region', { name: 'Logo library' })
  await expect(library).toContainText('svg', { timeout: 60000 })
  const vector = library.locator('[data-artwork-slot="logo"] img')
  const response = await page.request.get(await vector.getAttribute('src'))
  expect(response.headers()['content-type']).toBe('image/svg+xml')
  await page.getByRole('button', { name: 'Edit', exact: true }).click()
  await expect(
    library.getByRole('button', { name: 'Approve', exact: true }),
  ).toHaveCount(0)
})

test('catalogue logo cards have opaque backgrounds without image blur', async ({
  page,
}) => {
  test.setTimeout(120000)
  await page.setViewportSize({ width: 1440, height: 1000 })
  for (const theme of ['hype-dark', 'breadline-light']) {
    await page.goto('/admin/catalogue')
    expect(
      (await (await page.request.get('/api/auth/get-session')).json()).user.id,
    ).toBe('hype-local-agent-admin')
    await page.evaluate(value => localStorage.setItem('hype-theme', value), theme)
    await page
      .context()
      .addCookies([
        { name: 'hype-theme', value: theme, url: new URL(page.url()).origin },
      ])
    await page.reload()
    const header = page
      .locator('[data-solid-image-background]')
      .filter({ has: page.getByRole('img', { name: '7-Eleven', exact: true }) })
      .first()
    await expect(header).toBeVisible({ timeout: 60000 })
    await expect(
      header.locator('.bits-index-card__header-blur, .bits-index-card__header-overlay'),
    ).toHaveCount(0)
    expect(
      await header.evaluate(node => getComputedStyle(node).backgroundColor),
    ).not.toMatch(/rgba\([^)]*,\s*0\)|transparent/)
    await page.screenshot({
      path: join(process.env.DEV_RUNNER_ARTIFACTS, `catalogue-solid-${theme}.png`),
    })
  }
})
