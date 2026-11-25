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
  await first.locator('..').press('0')
  await expect.poll(async () => (await pose(first)).zoom).toBe(1)
  const cards = page
    .getByRole('region', { name: 'Interior gallery cards', exact: true })
    .getByRole('article')
  const layout = await cards.evaluateAll(elements =>
    elements.slice(0, 3).map(card => {
      const preview = card.firstElementChild as HTMLElement
      const footer = card.lastElementChild as HTMLElement
      const svg = card.querySelector('svg[data-station-scene]') as SVGSVGElement
      const rect = (element: Element) => {
        const { x, y, width, height, bottom } = element.getBoundingClientRect()
        return { x, y, width, height, bottom }
      }
      const scene = card.querySelector(
        '[aria-label="Station plan controls"]',
      ) as HTMLElement
      return {
        name: card.getAttribute('aria-label'),
        card: rect(card),
        preview: rect(preview),
        footer: rect(footer),
        svg: rect(svg),
        scene: rect(scene),
        preserveAspectRatio: svg.getAttribute('preserveAspectRatio'),
        modelBottom: Math.max(
          ...Array.from(svg.querySelectorAll('[data-floor-transition]')).map(
            floor => floor.getBoundingClientRect().bottom,
          ),
        ),
        background: getComputedStyle(scene).backgroundColor,
      }
    }),
  )
  assert.equal(layout.length, 3)
  assert.ok(
    Math.max(...layout.map(item => item.footer.bottom)) -
      Math.min(...layout.map(item => item.footer.bottom)) <
      2,
    'First-row footer bottoms align',
  )
  for (const item of layout) {
    assert.ok(
      Math.abs(item.card.bottom - item.footer.bottom) <= 2,
      `${item.name}: no filler below footer`,
    )
    assert.ok(
      Math.abs(item.preview.bottom - item.footer.y) <= 2,
      `${item.name}: preview meets footer`,
    )
    assert.ok(
      item.svg.height <= item.preview.height + 2,
      `${item.name}: SVG does not overflow preview`,
    )
    assert.ok(
      Math.abs(item.scene.height - item.preview.height) <= 2,
      `${item.name}: scene fills preview`,
    )
    assert.ok(
      item.svg.bottom - item.modelBottom > 0 &&
        item.svg.bottom - item.modelBottom < item.svg.height * 0.2,
      `${item.name}: model sits near preview bottom`,
    )
    assert.ok(
      item.preview.height > 300 && item.preview.height < 900,
      `${item.name}: bounded preview`,
    )
  }
  await writeFile(
    join(output, 'interior-gallery-layout.json'),
    JSON.stringify({ layout, before, dragged, passed: true }, null, 2),
  )
  await page.screenshot({ path: join(output, 'interior-gallery-first-row.png') })
  console.log(
    'First-row aligned footers, filled previews, bounded SVG and synchronized drag verified',
  )
} catch (error) {
  await page.screenshot({ path: join(output, 'failure.png') }).catch(() => {})
  throw error
} finally {
  await browser.close()
}
