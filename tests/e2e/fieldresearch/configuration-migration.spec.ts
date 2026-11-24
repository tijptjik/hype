// NODE
import { join } from 'node:path'
// PLAYWRIGHT
import { expect, test } from '@playwright/test'

test('reviews an older session before migrating and creates a Feature from its defaults', async ({
  page,
}) => {
  test.skip(
    !process.env.RESEARCH_MIGRATION_SESSION,
    'Requires the isolated field-session fixture.',
  )
  test.setTimeout(240_000)
  const sessionId = process.env.RESEARCH_MIGRATION_SESSION!
  await page.goto('/admin/field-recorder?session=' + encodeURIComponent(sessionId), {
    waitUntil: 'domcontentloaded',
  })
  expect(new URL(page.url()).pathname).toMatch(/^\/admin(?:\/|$)/)
  const auth = await (await page.request.get('/api/auth/get-session')).json()
  expect(auth.user.id).toBe('hype-local-agent-admin')
  const gate = page.getByRole('region', { name: 'Session configuration migration' })
  await expect(gate).toBeVisible({ timeout: 60_000 })
  await expect(page.getByLabel('Session code', { exact: true })).toHaveCount(0)
  await gate.getByRole('button', { name: 'Review migration', exact: true }).click()
  await expect(gate.getByText('session.obsolete', { exact: true })).toBeVisible()
  await expect(
    gate.getByText('session.defaults.isPendingReview', { exact: true }),
  ).toBeVisible()
  const artifacts = process.env.DEV_RUNNER_ARTIFACTS
  if (artifacts)
    await page.screenshot({
      path: join(artifacts, 'session-migration-preview.png'),
      fullPage: true,
    })
  await gate.getByRole('button', { name: 'Apply migration', exact: true }).click()
  await expect(page.getByLabel('Session code', { exact: true })).toHaveValue('SURVEY', {
    timeout: 60_000,
  })
  await page.reload()
  await expect(page.getByLabel('Session code', { exact: true })).toHaveValue('SURVEY', {
    timeout: 60_000,
  })
  await expect(gate).toHaveCount(0)

  // The static Android bundle uses the same authenticated backend with native HTTP replaced by browser fetch.
  await page.addInitScript(() => {
    Object.defineProperty(window, 'isTauri', { value: true })
    const fetch = window.fetch.bind(window)
    Object.defineProperty(window, 'fetch', { get: () => fetch, set: () => {} })
  })
  const build = join(process.cwd(), 'apps/recorder/build')
  await page.route('**/_app/immutable/**', route =>
    route.fulfill({ path: join(build, new URL(route.request().url()).pathname) }),
  )
  await page.route(
    url => url.pathname === '/',
    route =>
      route.fulfill({ path: join(build, 'index.html'), contentType: 'text/html' }),
  )
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await page
    .getByRole('button', { name: '[Test] Schema migration', exact: false })
    .click()
  await expect(page.getByRole('button', { name: 'Record', exact: true })).toBeEnabled({
    timeout: 30_000,
  })
  await page.getByRole('button', { name: 'Record', exact: true }).click()
  await expect(page.getByText('SURVEY-001', { exact: true })).toBeVisible({
    timeout: 30_000,
  })
  if (artifacts)
    await page.screenshot({
      path: join(artifacts, 'session-feature-created.png'),
      fullPage: true,
    })
})
