import { createRequire } from 'node:module'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import sharp from 'sharp'

const kit = createRequire(import.meta.resolve('@sveltejs/kit'))
const { stringify } = await import(kit.resolve('devalue'))

// Find the interior of the outlined slice from the actual rendered map, in CSS pixels.
async function highlightedPoint(canvas) {
  const { data, info } = await sharp(await canvas.screenshot({ scale: 'css' }))
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  const midpoints = []
  for (let y = 0; y < info.height; y++) {
    let left = -1
    let right = -1
    for (let x = 0; x < info.width; x++) {
      const i = (y * info.width + x) * info.channels
      if (data[i] !== 251 || data[i + 1] !== 191 || data[i + 2] !== 36) continue
      if (left < 0) left = x
      right = x
    }
    if (right - left > 5) midpoints.push({ x: (left + right) / 2, y })
  }
  return midpoints[Math.floor(midpoints.length / 2)] ?? null
}

test('previews the same building slice from its Remove button and from its footprint', async ({
  page,
}) => {
  test.setTimeout(180_000)
  const admin = await page.goto('/admin', { waitUntil: 'domcontentloaded' })
  expect(admin.ok()).toBeTruthy()
  await expect(page).toHaveURL(/\/admin(?:\/features)?\/?$/)
  const session = await (await page.request.get('/api/auth/get-session')).json()
  expect(session.user.id).toBe('hype-local-agent-admin')

  // The admin persona has its own asset store. Supply two reviewed links while
  // keeping the requested Location, footprint search, geometry and renderer live.
  await page.route('**/_app/remote/*/getLocationExterior*', route =>
    route.fulfill({
      json: {
        type: 'result',
        data: stringify({
          _: {
            canImport: true,
            evidence: [],
            model: { assetId: 'fixture', url: '/hover-fixture.gltf' },
            slices: ['3773621152', '3773721158'].map(ref => ({
              modelId: `B${ref}01063A0`,
              footprintId: `${ref}T20050430`,
              sheet: 'fixture',
              evidenceKeys: [],
            })),
          },
        }),
      },
    }),
  )
  await page.route('**/hover-fixture.gltf', route =>
    route.fulfill({
      json: {
        asset: { version: '2.0' },
        scene: 0,
        scenes: [{ nodes: [0] }],
        nodes: [{}],
      },
    }),
  )
  await page.goto('/admin/locations/T6QiBRPPuk0w?organisation=oDucgyH4H4Bm#exterior', {
    waitUntil: 'domcontentloaded',
  })
  await page.getByRole('button', { name: 'Manage model associations' }).click({
    timeout: 60_000,
  })
  const list = page.getByRole('region', { name: 'Building model slices' })
  const row = list.getByRole('listitem').filter({ hasText: 'B377362115201063A0' })
  const heading = list.getByRole('heading', { name: /Building slices/ })
  const canvas = page
    .getByRole('region', { name: 'Building footprint map' })
    .locator('canvas')
  const choice = page.getByRole('combobox', { name: 'Building model ID' })
  await expect(choice).toBeEnabled({ timeout: 60_000 })
  await list.getByRole('button', { name: 'Slice deletion mode' }).click()
  await row.getByRole('button', { name: /^Remove / }).hover()
  await expect(row).toHaveAttribute('data-highlighted')
  const rendered = expect.configure({ timeout: 30_000 })
  let point
  await rendered
    .poll(async () => (point = await highlightedPoint(canvas)))
    .not.toBeNull()
  await heading.hover()
  await expect(row).not.toHaveAttribute('data-highlighted')
  await rendered.poll(() => highlightedPoint(canvas)).toBeNull()
  await canvas.hover({ position: point })
  await expect(row).toHaveAttribute('data-highlighted')
  await expect(list.locator('[data-highlighted]')).toHaveCount(1)
  await expect(row).not.toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
  await expect(choice).toHaveValue('')
  await page.screenshot({
    path: join(process.env.DEV_RUNNER_ARTIFACTS, 'slice-hover.png'),
  })
  await heading.hover()
  await expect(row).not.toHaveAttribute('data-highlighted')
})
