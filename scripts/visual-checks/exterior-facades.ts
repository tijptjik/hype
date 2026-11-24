// NODE
import assert from 'node:assert/strict'
import { join } from 'node:path'
import { writeFile } from 'node:fs/promises'
// PLAYWRIGHT
import { chromium, expect } from '@playwright/test'
const origin = process.env.PLAYWRIGHT_BASE_URL
const output = process.env.DEV_RUNNER_ARTIFACTS
const placement = process.env.DEV_RUNNER_CHROME_CLASS
if (!origin || !output || !placement) throw new Error('Use the managed Chrome runner')
const browser = await chromium.launch({
  channel: 'chrome',
  headless: false,
  args: ['--ozone-platform=x11', `--class=${placement}`, '--disable-web-security'],
})
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } })
const fixtureLocation = process.env.EXTERIOR_ALIGNMENT_FIXTURE
try {
  // Controlled directional geometry exercises actual model-viewer projection, export and worker analysis.
  const quads = [
    [
      [-4, 0, 3],
      [4, 0, 3],
      [4, 12, 3],
      [-4, 12, 3],
    ],
    [
      [4, 0, -3],
      [-4, 0, -3],
      [-4, 12, -3],
      [4, 12, -3],
    ],
    [
      [4, 0, 3],
      [4, 0, -3],
      [4, 12, -3],
      [4, 12, 3],
    ],
    [
      [-4, 0, -3],
      [-4, 0, 3],
      [-4, 12, 3],
      [-4, 12, -3],
    ],
  ]
  const geometry = new Float32Array(
    quads.flatMap(q => [...q[0], ...q[1], ...q[2], ...q[0], ...q[2], ...q[3]]),
  )
  const fixture = {
    asset: { version: '2.0' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, material: 0 }] }],
    materials: [
      {
        doubleSided: true,
        pbrMetallicRoughness: { baseColorFactor: [0.6, 0.65, 0.7, 1] },
      },
    ],
    buffers: [
      {
        byteLength: geometry.byteLength,
        uri:
          'data:application/octet-stream;base64,' +
          Buffer.from(geometry.buffer).toString('base64'),
      },
    ],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: geometry.byteLength }],
    accessors: [
      {
        bufferView: 0,
        componentType: 5126,
        count: geometry.length / 3,
        type: 'VEC3',
        min: [-4, 0, -3],
        max: [4, 12, 3],
      },
    ],
  }
  // Exercise the source model fallback when this local Location has a comparison installed.
  await page.route('**/api/location-exterior/**/comparison-*.glb', route =>
    route.fulfill({ status: 404 }),
  )
  await page.route('**/api/location-exterior/**/*.gltf', route =>
    route.fulfill({ contentType: 'model/gltf+json', body: JSON.stringify(fixture) }),
  )
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(
    origin + '/admin/locations/' + (fixtureLocation || 'IssVInhZb-Gd') + '#exterior',
    {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    },
  )
  const session = await (
    await page.request.get(origin + '/api/auth/get-session')
  ).json()
  assert.equal(session.user.id, 'hype-local-agent-admin')
  const panel = page.getByRole('region', { name: 'Visual façade floor alignment' })
  const top = panel.getByRole('button', { name: 'Drag Top', exact: true })
  await expect(top).toBeVisible({ timeout: 120000 })
  const alignment = () =>
    page.evaluate(() =>
      JSON.parse(
        Object.entries(localStorage).find(([key]) =>
          key.startsWith('hype-facade-alignment:'),
        )?.[1] ?? 'null',
      ),
    )
  const initial = await alignment()
  assert.equal(initial.lines.length, 5)
  await panel.getByRole('button', { name: 'Lock Floor 2', exact: true }).click()
  const topBox = await top.boundingBox()
  assert.ok(topBox)
  await page.mouse.move(topBox.x + topBox.width / 2, topBox.y + topBox.height / 2)
  await page.mouse.down()
  await page.mouse.move(
    topBox.x + topBox.width / 2,
    topBox.y + topBox.height / 2 + 40,
    { steps: 8 },
  )
  await page.mouse.up()
  const dragged = await alignment()
  await panel.getByRole('button', { name: 'Undo', exact: true }).click()
  assert.deepEqual(
    (await alignment()).lines,
    initial.lines.map((line: any, i: number) =>
      i === 2 ? { ...line, locked: true } : line,
    ),
  )
  await page.mouse.move(topBox.x + topBox.width / 2, topBox.y + topBox.height / 2)
  await page.mouse.down()
  await page.mouse.move(
    topBox.x + topBox.width / 2,
    topBox.y + topBox.height / 2 + 40,
    { steps: 8 },
  )
  await page.mouse.up()
  assert.ok(dragged.lines.at(-1).elevation < 12)
  assert.deepEqual(
    dragged.lines.slice(0, -1).map((line: any) => line.elevation),
    initial.lines.slice(0, -1).map((line: any) => line.elevation),
  )
  await panel.getByRole('button', { name: 'Evenly distribute', exact: true }).click()
  const distributed = await alignment()
  assert.equal(distributed.lines[2].elevation, 6)
  assert.equal(distributed.lines.at(-1).elevation, dragged.lines.at(-1).elevation)
  await panel.getByRole('button', { name: 'Add floor', exact: true }).click()
  const added = await alignment()
  assert.equal(added.lines.length, 6)
  assert.equal(added.lines.find((line: any) => line.id === 'line-2').elevation, 6)
  assert.equal(added.lines.at(-1).elevation, dragged.lines.at(-1).elevation)
  const lockedIndex = added.lines.findIndex((line: any) => line.id === 'line-2')
  await expect(
    panel.getByRole('button', { name: `Remove Floor ${lockedIndex}`, exact: true }),
  ).toBeDisabled()
  await expect(
    panel.getByRole('button', { name: 'Remove Base', exact: true }),
  ).toHaveCount(0)
  await expect(
    panel.getByRole('button', { name: 'Remove Top', exact: true }),
  ).toHaveCount(0)
  await panel.getByRole('button', { name: 'Remove Floor 1', exact: true }).click()
  const removed = await alignment()
  assert.deepEqual(
    removed.lines,
    added.lines.filter((_: unknown, index: number) => index !== 1),
  )
  await panel
    .getByRole('button', { name: 'Edit Base designation', exact: true })
    .click()
  await panel.getByLabel('Floor type', { exact: true }).selectOption('basement')
  await panel.getByLabel('Floor number', { exact: true }).fill('3')
  await panel.getByRole('button', { name: 'Done', exact: true }).click()
  await expect(
    panel.getByRole('button', { name: 'Edit Basement 3 designation', exact: true }),
  ).toBeVisible()
  await panel
    .getByRole('button', { name: 'Edit Floor 1 designation', exact: true })
    .click()
  await panel.getByLabel('Floor type', { exact: true }).selectOption('ground')
  await expect(panel.getByLabel('Floor number', { exact: true })).toHaveCount(0)
  await panel.getByRole('button', { name: 'Done', exact: true }).click()
  await panel
    .getByRole('button', { name: 'Edit Ground floor designation', exact: true })
    .click()
  await panel.getByLabel('Floor name', { exact: true }).fill('Mezzanine / 天台 12A')
  await panel.getByLabel('Floor type', { exact: true }).selectOption('floor')
  await expect(panel.getByLabel('Floor name', { exact: true })).toHaveValue(
    'Mezzanine / 天台 12A',
  )
  await panel.getByRole('button', { name: 'Done', exact: true }).click()
  await expect(
    panel.getByRole('button', {
      name: 'Edit Mezzanine / 天台 12A designation',
      exact: true,
    }),
  ).toBeVisible()
  const named = await alignment()
  assert.deepEqual(
    named.lines.map((line: any) => line.elevation),
    removed.lines.map((line: any) => line.elevation),
  )
  assert.deepEqual(named.lines[0].designation, { type: 'basement', number: 3 })
  await page.screenshot({ path: join(output, 'facade-floor-lines.png') })
  await panel.getByRole('button', { name: 'Next façade', exact: true }).click()
  await expect.poll(async () => (await alignment()).side).toBe(1)
  await panel.getByRole('button', { name: 'Set as front', exact: true }).click()
  await panel.getByLabel('50% transparent').check()
  const alpha = await page
    .locator('model-viewer')
    .evaluate((element: any) =>
      element.model.materials
        .filter((material: any) => material.isLoaded)
        .map((material: any) => material.pbrMetallicRoughness.baseColorFactor[3]),
    )
  assert.ok(alpha.every((value: number) => Math.abs(value - 0.5) < 1e-6))
  await page.screenshot({ path: join(output, 'facade-transparent.png') })
  await panel.getByLabel('50% transparent').uncheck()
  if (fixtureLocation) {
    // Only a dedicated synthetic model is eligible for a database-writing browser check.
    await expect(page.locator('model-viewer')).toHaveAttribute(
      'src',
      /\/alignment-fixture\.gltf$/,
    )
    await panel.getByRole('button', { name: 'Save model', exact: true }).click()
    await expect(panel.getByRole('status')).toHaveText(/Saved · r[0-9]+/)
    await page.evaluate(() => {
      for (const key of Object.keys(localStorage))
        if (key.startsWith('hype-facade-alignment:')) localStorage.removeItem(key)
    })
  }
  await page.reload({ waitUntil: 'domcontentloaded' })
  await expect(
    panel.getByRole('button', { name: 'Drag Top', exact: true }),
  ).toBeVisible({ timeout: 60000 })
  const restored = await alignment()
  assert.deepEqual(restored.lines, named.lines)
  assert.equal(restored.front, 1)
  assert.deepEqual(errors, [])
  await writeFile(
    join(output, 'facade-verification.json'),
    JSON.stringify(
      { syntheticGeometry: true, dragged, distributed, added, restored, alpha, errors },
      null,
      2,
    ),
  )
} catch (error) {
  await page.screenshot({ path: join(output, 'facade-failed.png'), fullPage: true })
  console.log((await page.locator('body').innerText()).slice(-4000))
  throw error
} finally {
  await browser.close()
}
