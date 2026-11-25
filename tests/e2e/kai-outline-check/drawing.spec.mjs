import { expect, test } from '@playwright/test'
import { join } from 'node:path'
import { build } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
test('selects all seven Kai King floors and records a floor-relative XY pin without a unit', async ({
  page,
}) => {
  test.setTimeout(180000)
  await page.goto('/admin', { waitUntil: 'domcontentloaded' })
  await expect(page).toHaveURL(/\/admin(?:\/features)?\/?$/)
  expect((await (await page.request.get('/api/auth/get-session')).json()).user.id).toBe(
    'hype-local-agent-admin',
  )
  await page.goto(
    '/admin/field-recorder?session=5e856112-1f64-457a-8c64-3170e874688b&models=interior#locations',
    { waitUntil: 'domcontentloaded' },
  )
  const card = page.getByRole('article', { name: 'Kai King Mansion' })
  await card.scrollIntoViewIfNeeded({ timeout: 90000 })
  await expect(card.getByLabel('Station plan controls', { exact: true })).toBeVisible({
    timeout: 60000,
  })
  const building =
    'building:cbab3d4d32f73b706b05fb7836f120f3d695277bdd5ecba28894dc7c0aedce26'
  const catalogue = await (await page.request.get('/api/premises-maps')).json()
  const matches = catalogue.filter(map => map.name === 'Kai King Mansion')
  expect(matches).toHaveLength(1)
  const pointer = {
    id: matches[0].id,
    name: matches[0].name,
    hash: matches[0].publishedHash,
    unitId: null,
  }
  // Compile the Recorder component on the test runner, which owns the mobile dependencies.
  const bundle = await build({
    configFile: false,
    plugins: [svelte({ configFile: false })],
    build: {
      write: false,
      lib: {
        entry: 'src/tests/fixtures/kaiKingRecorderDrawing.svelte.ts',
        name: 'kaiKingRecorder',
        formats: ['iife'],
      },
    },
  })
  const script = (Array.isArray(bundle) ? bundle[0] : bundle).output.find(
    chunk => chunk.type === 'chunk' && chunk.isEntry,
  )
  await page.addScriptTag({ content: script.code })
  await page.evaluate(
    ({ pointer, building }) => window.kaiKingRecorder.openDrawing(pointer, building),
    { pointer, building },
  )
  const host = page.locator('#kai-drawing')
  const svg = host.locator('svg[tabindex="0"]')
  await expect(svg).toBeVisible({ timeout: 30000 })
  for (const [i, id] of [
    'ground',
    'mezzanine',
    'floor-1',
    'floor-2',
    'floor-3',
    'floor-4',
    'floor-5',
  ].entries()) {
    const select = host.locator('button[aria-haspopup="dialog"]')
    await select.click()
    await host
      .getByRole('dialog')
      .getByRole('button', {
        name: ['G/F', 'Mezzanine', '1/F', '2/F', '3/F', '4/F', '5/F'][i],
        exact: true,
      })
      .click()
    await expect(svg.locator('g[data-level]')).toHaveAttribute('data-level', id)
    const point = await svg
      .locator('g[data-level] > path')
      .first()
      .evaluate(el => {
        const box = el.getBBox()
        for (const fraction of [0.5, 0.4, 0.6, 0.3]) {
          const p = new DOMPoint(box.x + box.width * fraction, box.y + 0.5 * box.height)
          if (el.isPointInFill(p)) {
            const screen = p.matrixTransform(el.getScreenCTM())
            return { x: screen.x, y: screen.y }
          }
        }
        throw Error('Missing interior hit')
      })
    await page.mouse.click(point.x, point.y)
    await expect
      .poll(async () => JSON.parse(await host.getAttribute('data-placement')).pin.point)
      .toEqual([expect.any(Number), expect.any(Number)])
    const placed = JSON.parse(await host.getAttribute('data-placement'))
    expect(placed.locationId).toBe(building)
    expect(placed.pin).toMatchObject({
      floorId: id,
      hash: pointer.hash,
      mapId: pointer.id,
    })
    expect(placed.pin.unitId).toBeUndefined()
  }
  await host.screenshot({
    path: join(process.env.DEV_RUNNER_ARTIFACTS, 'kai-king-outline-pin.png'),
  })
})
