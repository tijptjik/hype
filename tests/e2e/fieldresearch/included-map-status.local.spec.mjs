import { join } from 'node:path'
import { createRequire } from 'node:module'
import { expect, test } from '@playwright/test'

const kit = createRequire(import.meta.resolve('@sveltejs/kit'))
const { parse, stringify } = await import(kit.resolve('devalue'))

test('shows map availability and explains the two dots on each included location', async ({
  page,
}) => {
  test.setTimeout(180_000)
  const admin = await page.goto('/admin', { waitUntil: 'domcontentloaded' })
  expect(admin.ok()).toBeTruthy()
  await expect(page).toHaveURL(/\/admin(?:\/features)?\/?$/)
  expect((await (await page.request.get('/api/auth/get-session')).json()).user.id).toBe(
    'hype-local-agent-admin',
  )
  // Exercise both tooltip states even as the session gains new interior and exterior maps.
  await page.route('**/_app/remote/*/getResearchLocations*', async route => {
    const response = await route.fetch()
    const body = await response.json()
    const data = parse(body.data)
    const [missing, mapped] = data._
    Object.assign(missing, { hasInteriorMap: false, hasExteriorMap: false })
    Object.assign(mapped, { hasInteriorMap: false, hasExteriorMap: true })
    await route.fulfill({ response, json: { ...body, data: stringify(data) } })
  })
  await page.goto(
    '/admin/field-recorder?session=5e856112-1f64-457a-8c64-3170e874688b#locations',
    { waitUntil: 'domcontentloaded' },
  )
  const list = page.getByRole('complementary', { name: 'Included Locations' })
  const cards = list.locator('section > ul > li')
  const statuses = list.getByRole('button', { name: /^Interior map / })
  await expect(statuses.first()).toBeVisible({ timeout: 60_000 })
  await expect(statuses).toHaveCount(await cards.count())
  const mapped = statuses
    .and(
      page.getByRole('button', {
        name: 'Interior map unavailable, exterior map available',
      }),
    )
    .first()
  const missing = statuses
    .and(
      page.getByRole('button', {
        name: 'Interior map unavailable, exterior map unavailable',
      }),
    )
    .first()
  const empty = 'rgba(0, 0, 0, 0)'
  await expect(missing.locator('span')).toHaveCount(2)
  await expect(missing.locator('span').first()).toHaveCSS('background-color', empty)
  await expect(mapped.locator('span').first()).toHaveCSS('background-color', empty)
  await expect(mapped.locator('span').last()).not.toHaveCSS('background-color', empty)
  await mapped.hover()
  const tooltip = page.getByRole('tooltip')
  await expect(tooltip.locator('p')).toHaveText([
    'Interior unavailable',
    'Exterior available',
  ])
  await page.screenshot({
    path: join(process.env.DEV_RUNNER_ARTIFACTS, 'included-map-status.png'),
  })
  await page.keyboard.press('Escape')
  await expect(tooltip).toBeHidden()
  await missing.focus()
  await page.keyboard.press('Enter')
  await expect(tooltip.locator('p')).toHaveText([
    'Interior unavailable',
    'Exterior unavailable',
  ])
})
