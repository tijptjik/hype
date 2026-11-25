// NODE
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
// PLAYWRIGHT
import { chromium, expect } from '@playwright/test'
// TYPES
import type { Locator } from '@playwright/test'

const {
  PLAYWRIGHT_BASE_URL: origin,
  DEV_RUNNER_ARTIFACTS: output,
  DEV_RUNNER_CHROME_CLASS: placement,
} = process.env
if (!origin || !output || !placement) throw new Error('Use managed Chrome.')
execFileSync('hyprctl', [
  'eval',
  `hl.window_rule({name="gallery-${placement}",workspace="7 silent",match={class="^${placement}$"}})`,
])
const browser = await chromium.launch({
  channel: 'chrome',
  headless: false,
  args: ['--ozone-platform=x11', `--class=${placement}`, '--disable-web-security'],
})
const page = await browser.newPage({ viewport: { width: 2160, height: 1400 } })
/** Read rendered camera properties without accessing Svelte internals.
 * @param scene Rendered station SVG.
 * @returns Camera bearing, tilt and viewBox width.
 */
async function pose(scene: Locator): Promise<{
  bearing: number
  tilt: number
  zoom: number
  panX: number
  panY: number
  width: number
}> {
  return scene.evaluate(element => ({
    bearing: Number(element.getAttribute('data-camera-bearing')),
    tilt: Number(element.getAttribute('data-camera-tilt')),
    panX: Number(element.getAttribute('data-camera-pan-x')),
    panY: Number(element.getAttribute('data-camera-pan-y')),
    zoom: Number(element.getAttribute('data-camera-zoom')),
    width: Number(element.getAttribute('viewBox')?.split(/\s+/)[2]),
  }))
}
try {
  assert.ok(
    (await page.goto(`${origin}/admin`, { waitUntil: 'domcontentloaded' }))?.ok(),
  )
  await expect(page).toHaveURL(/\/admin(?:\/features)?\/?$/)
  assert.equal(
    (await (await page.request.get(`${origin}/api/auth/get-session`)).json()).user.id,
    'hype-local-agent-admin',
  )
  const windows: { class: string; workspace: { id: number } }[] = JSON.parse(
    execFileSync('hyprctl', ['-j', 'clients'], { encoding: 'utf8' }),
  )
  assert.ok(
    windows.some(window => window.class === placement && window.workspace.id === 7),
  )
  await page.goto(
    `${origin}/admin/field-recorder?session=5e856112-1f64-457a-8c64-3170e874688b&models=interior#locations`,
    { waitUntil: 'domcontentloaded', timeout: 90000 },
  )
  const scenes = page.locator('article svg[data-station-scene="exploded"]')
  await expect.poll(() => scenes.count(), { timeout: 90000 }).toBeGreaterThanOrEqual(2)
  const first = scenes.nth(0)
  const second = scenes.nth(1)
  await expect(first).toBeVisible()
  await expect(second).toBeVisible()
  await expect(first).toHaveAttribute('data-station-transition', 'settled', {
    timeout: 30000,
  })
  await expect(second).toHaveAttribute('data-station-transition', 'settled', {
    timeout: 30000,
  })
  const before = await Promise.all([pose(first), pose(second)])
  const box = await first.boundingBox()
  assert.ok(box)
  await page.mouse.move(
    box.x + box.width * 0.5,
    Math.min(box.y + box.height * 0.5, 600),
  )
  await page.mouse.down()
  await page.mouse.move(
    box.x + box.width * 0.65,
    Math.min(box.y + box.height * 0.5, 600) + 70,
    { steps: 12 },
  )
  await page.mouse.up()
  await expect
    .poll(async () => Math.abs((await pose(first)).bearing - before[0].bearing))
    .toBeGreaterThan(1)
  await expect
    .poll(async () =>
      Math.abs((await pose(first)).bearing - (await pose(second)).bearing),
    )
    .toBeLessThan(0.01)
  await expect
    .poll(async () => Math.abs((await pose(first)).tilt - (await pose(second)).tilt))
    .toBeLessThan(0.01)
  const dragged = await Promise.all([pose(first), pose(second)])
  const secondBox = await second.boundingBox()
  assert.ok(secondBox)
  await page.mouse.move(
    secondBox.x + secondBox.width * 0.5,
    Math.min(secondBox.y + secondBox.height * 0.5, 600),
  )
  await page.mouse.wheel(0, -300)
  await expect
    .poll(async () => (await pose(second)).width / dragged[1].width)
    .toBeLessThan(0.9)
  await expect
    .poll(async () => Math.abs((await pose(first)).zoom - (await pose(second)).zoom))
    .toBeLessThan(0.01)
  assert.ok((await pose(first)).zoom > dragged[0].zoom)
  const zoomed = await Promise.all([pose(first), pose(second)])
  await page.keyboard.down('Shift')
  await page.mouse.down()
  await page.mouse.move(
    secondBox.x + secondBox.width * 0.6,
    Math.min(secondBox.y + secondBox.height * 0.5, 600) + 50,
    { steps: 8 },
  )
  await page.mouse.up()
  await page.keyboard.up('Shift')
  await expect
    .poll(async () => Math.abs((await pose(second)).panX - zoomed[1].panX))
    .toBeGreaterThan(0.01)
  for (const key of ['panX', 'panY'] as const) {
    await expect
      .poll(async () => Math.abs((await pose(first))[key] - (await pose(second))[key]))
      .toBeLessThan(0.01)
  }
  const panned = await Promise.all([pose(first), pose(second)])
  const lazyCard = page
    .getByRole('article')
    .filter({ has: page.getByRole('status', { name: /^Loading / }) })
    .last()
  await expect(lazyCard).toHaveCount(1)
  const lazyName = await lazyCard.getAttribute('aria-label')
  assert.ok(lazyName)
  await lazyCard.scrollIntoViewIfNeeded()
  const loadedCard = page.getByRole('article', { name: lazyName, exact: true }).last()
  const lazyScene = loadedCard.locator('svg[data-station-scene="exploded"]')
  await expect(lazyScene).toBeVisible({ timeout: 90000 })
  for (const key of ['bearing', 'tilt', 'zoom', 'panX', 'panY'] as const) {
    await expect
      .poll(async () => Math.abs((await pose(lazyScene))[key] - panned[0][key]))
      .toBeLessThan(0.01)
  }
  const inherited = await pose(lazyScene)
  await loadedCard.getByLabel('Station plan controls', { exact: true }).press('0')
  for (const target of [first, second, lazyScene]) {
    await expect
      .poll(async () => Math.abs((await pose(target)).zoom - 1))
      .toBeLessThan(0.01)
    await expect
      .poll(
        async () =>
          Math.abs((await pose(target)).panX) + Math.abs((await pose(target)).panY),
      )
      .toBeLessThan(0.01)
  }
  await page.screenshot({ path: join(output, 'interior-gallery-synchronized.png') })
  await writeFile(
    join(output, 'interior-gallery-synchronized.json'),
    JSON.stringify(
      { before, dragged, zoomed, panned, inherited, passed: true },
      null,
      2,
    ),
  )
  console.log(
    'Two interior cards synchronize real drag and wheel gestures in both directions',
  )
} catch (error) {
  await page.screenshot({ path: join(output, 'failure.png') }).catch(() => {})
  throw error
} finally {
  await browser.close()
}
