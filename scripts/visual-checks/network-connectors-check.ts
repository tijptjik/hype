// NODE
import assert from 'node:assert/strict'
// PLAYWRIGHT
import { chromium, expect } from '@playwright/test'
// DATA
import manifest from '../../src/lib/indoor/network-connectors/manifest.json'
import adm from '../../src/lib/indoor/network-connectors/ADM.json'

const origin = process.env.PLAYWRIGHT_BASE_URL
const artifacts = process.env.DEV_RUNNER_ARTIFACTS
if (!origin || !artifacts) throw new Error('Use dev-remote chrome')
const browser = await chromium.launch({
  channel: 'chrome',
  headless: false,
  args: ['--ozone-platform=x11', `--class=${process.env.DEV_RUNNER_CHROME_CLASS}`],
})
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  const chunks = new Set<string>()
  page.on('request', request => {
    const match = request.url().match(/network-connectors\/([A-Z]+)\.json/)
    if (match) chunks.add(match[1])
  })
  await page.goto(origin)
  assert.equal(
    (await (await page.request.get(`${origin}/api/auth/get-session`)).json()).user.id,
    'hype-local-agent-admin',
  )
  for (const code of ['ADM', 'MEF', 'TWW', 'KOT', 'AIR', 'KET'] as const) {
    const entry = manifest[code]
    await page.goto(`${origin}/premises/${entry.mapId}`)
    const levels = page.getByRole('navigation', { name: 'Indoor levels' })
    await expect(levels).toBeVisible({ timeout: 120000 })
    await levels.getByRole('button', { name: 'All', exact: true }).click()
    await expect(
      page.locator('[data-connector-relief][data-source-network-edge]'),
    ).toHaveCount(entry.annotated)
    await expect(
      page.locator('[data-connector-relief][data-exterior-continuation="true"]'),
    ).toHaveCount(entry.exterior)
    const camera = page.getByRole('application', {
      name: 'Station plan controls',
      exact: true,
    })
    await camera.focus()
    await camera.press('ArrowUp')
    await camera.press('ArrowRight')
    await page.waitForTimeout(800)
    await page.screenshot({ path: `${artifacts}/network-connectors-${code}.png` })
    if (code === 'ADM')
      assert.deepEqual(
        [...chunks],
        ['ADM'],
        'Load only the selected station annotation chunk',
      )
  }
  // The editor must load the same source evidence before selecting a new directed pair.
  await page.goto(`${origin}/admin/premises-maps?map=admiralty-mtr`)
  await expect(page.locator('[data-connection-map="left"]')).toBeVisible({
    timeout: 120000,
  })
  const pointer = await (
    await page.request.get(`${origin}/api/premises-maps/admiralty-mtr`)
  ).json()
  const bundle = await (
    await page.request.get(new URL(pointer.url, origin).href)
  ).json()
  const entries = Object.entries(adm.annotations)
  const pair = entries.find(
    ([, a]) =>
      !a.exterior &&
      a.travel !== 'both' &&
      entries.filter(([, b]) => b.edgeId === a.edgeId).length === 2,
  )
  assert(pair)
  const other = entries.find(([id, a]) => id !== pair[0] && a.edgeId === pair[1].edgeId)
  assert(other)
  for (const [side, target] of [
    ['left', pair],
    ['right', other],
  ] as const) {
    const level = bundle.data.level_polygon.features.find(
      (f: { properties: { level_id: string } }) =>
        f.properties.level_id === target[1].levelId,
    )
    await page
      .getByRole('combobox', { name: side === 'left' ? 'Left floor' : 'Right floor' })
      .click()
    await page
      .getByRole('option', { name: level.properties.level_name_en, exact: true })
      .click()
    const unit = page.locator(
      `[data-connection-map="${side}"] [data-facility="${target[0]}"]`,
    )
    await unit.focus()
    await unit.press('Enter')
  }
  await expect(
    page.getByText(/3D network:.*(left to right|right to left)/),
  ).toBeVisible()
  await expect(page.locator('[data-direction]')).toHaveAttribute(
    'data-direction',
    pair[1].travel === 'outward' ? 'forward' : 'reverse',
  )
  await page.screenshot({ path: `${artifacts}/network-connectors-editor-ADM.png` })
  assert.deepEqual(errors, [])
  console.log(
    'PASS: six station views, lazy station loading, camera interactions and source direction in Admiralty editor',
  )
} finally {
  await browser.close()
}
