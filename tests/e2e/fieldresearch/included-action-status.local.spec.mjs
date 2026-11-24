import { createRequire } from 'node:module'
import { expect, test } from '@playwright/test'

const kit = createRequire(import.meta.resolve('@sveltejs/kit'))
const { parse, stringify } = await import(kit.resolve('devalue'))

test('shows saved relationships and distinguishes partial and complete session inclusion', async ({
  page,
}) => {
  test.setTimeout(150_000)
  expect((await page.goto('/admin')).ok()).toBeTruthy()
  await expect(page).toHaveURL(/\/admin(?:\/features)?\/?$/)
  expect((await (await page.request.get('/api/auth/get-session')).json()).user.id).toBe(
    'hype-local-agent-admin',
  )
  // Keep the session read-only while rendering each possible inclusion state.
  await page.route('**/_app/remote/*/getResearchLocations*', async route => {
    const response = await route.fetch()
    const body = await response.json()
    const data = parse(body.data)
    const base = data._.find(row => row.kind === 'building' && row.hasRelationships)
    expect(base.inclusion.total).toBeGreaterThanOrEqual(base.inclusion.included)
    const fixtures = [0, 1, 2].map(included => ({
      ...base,
      id: 'fixture-' + included,
      names: { en: 'Fixture ' + included },
      hasRelationships: included !== 0,
      inclusion: { included, total: 2 },
    }))
    // The query result and SvelteKit refresh entry share this array.
    data._.splice(0, data._.length, ...fixtures)
    await route.fulfill({ response, json: { ...body, data: stringify(data) } })
  })
  await page.goto(
    '/admin/field-recorder?session=5e856112-1f64-457a-8c64-3170e874688b#locations',
  )
  const list = page.getByRole('complementary', { name: 'Included Locations' })
  for (const included of [0, 1, 2]) {
    const row = list
      .getByRole('listitem')
      .filter({
        has: page.getByRole('link', { name: 'Fixture ' + included, exact: true }),
      })
      .first()
    const parts = row.getByRole('button', { name: /related building parts/i })
    const link = row.getByRole('link', {
      name: included ? 'Relationships recorded' : 'Relationships',
      exact: true,
    })
    await expect(parts).toBeVisible({ timeout: 60_000 })
    await expect(parts.locator('svg')).toHaveCount(included ? 1 : 2)
    if (included) {
      await expect(parts).toHaveClass(/text-success/)
      await expect(link).toHaveClass(/text-success/)
    } else {
      await expect(parts).not.toHaveClass(/text-success/)
      await expect(link).not.toHaveClass(/text-success/)
    }
    if (included === 2) await expect(parts).toBeDisabled()
    else await expect(parts).toBeEnabled()
  }
})
