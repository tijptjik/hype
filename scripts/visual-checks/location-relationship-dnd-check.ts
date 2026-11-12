// NODE
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
// PLAYWRIGHT
import { chromium, firefox } from 'playwright'

const origin = process.argv[2] ?? 'http://127.0.0.1:4176'
const width = Number(process.argv[3] ?? 1440)
const output = 'output/playwright/location-relationship-dnd'
await mkdir(output, { recursive: true })
for (const [name, engine] of [
  ['chromium', chromium],
  ['firefox', firefox],
] as const) {
  const browser = await engine.launch({ headless: true })
  try {
    const page = await browser.newPage({ viewport: { width, height: 1000 } })
    await page.goto(`${origin}/admin/locations/relationship-demo-shop#relationships`)
    await page
      .getByRole('heading', { name: 'Location relationships', exact: true })
      .waitFor()
    const scroll = page.locator('[data-address-scroll]')
    const dimensions = await scroll.evaluate(node => ({
      height: node.clientHeight,
      total: node.scrollHeight,
    }))
    assert(
      dimensions.total > dimensions.height && dimensions.height > 100,
      'Main content must have a bounded scroll surface',
    )
    await scroll.hover()
    await page.mouse.wheel(0, 500)
    await page.waitForTimeout(300)
    assert(
      await scroll.evaluate(node => node.scrollTop > 0),
      'Wheel scrolls the main pane',
    )
    await page
      .getByRole('link', { name: 'View physical membership · TEST · Harbour House' })
      .scrollIntoViewIfNeeded()
    await page.getByRole('button', { name: 'Edit', exact: true }).click()
    const list = page.locator('[data-address-order]')
    await list.scrollIntoViewIfNeeded()
    const rows = list.locator('[data-address-id]')
    assert.equal(await rows.count(), 2)
    const firstLabel = await rows.first().innerText()
    const secondLabel = await rows.last().innerText()
    const target = await rows.last().boundingBox()
    assert(target)
    await rows
      .first()
      .locator('.bits-card__drag-handle')
      .dragTo(rows.last(), {
        targetPosition: { x: target.width / 2, y: target.height - 3 },
      })
    await page.waitForTimeout(200)
    assert(
      (await rows.first().innerText()).includes(
        secondLabel.replace(/^1\s*|^2\s*/, '').trim(),
      ),
      'Drop changes address order',
    )
    assert.notEqual(await rows.first().innerText(), firstLabel)
    assert.equal(
      await page.getByRole('button', { name: 'Move up', exact: true }).count(),
      0,
    )
    await page.getByRole('button', { name: 'Save address order', exact: true }).click()
    await page.waitForTimeout(500)
    await page.reload()
    await page.getByRole('button', { name: 'Edit', exact: true }).click()
    await list.scrollIntoViewIfNeeded()
    assert(
      (await rows.first().innerText()).includes(
        secondLabel.replace(/^1\s*|^2\s*/, '').trim(),
      ),
      'Saved address order survives reload',
    )
    await list.screenshot({ path: `${output}/${name}-${width}-address-order.png` })
    const lineage = page
      .locator('section')
      .filter({
        has: page.getByRole('heading', {
          name: 'Replacements, merges and splits',
          exact: true,
        }),
      })
      .last()
    await lineage.scrollIntoViewIfNeeded()
    const diagrams = page.getByRole('group', {
      name: 'Locations before and after the change',
    })
    assert((await diagrams.count()) >= 2)
    assert.equal(
      await page.locator('[data-lineage-before="2"][data-lineage-after="1"]').count(),
      1,
    )
    assert.equal(
      await page.locator('[data-lineage-before="1"][data-lineage-after="2"]').count(),
      1,
    )
    await lineage.screenshot({ path: `${output}/${name}-${width}-lineage.png` })
    await page.goto(
      `${origin}/admin/locations/relationship-demo-building#relationships`,
    )
    await page
      .getByRole('link', { name: 'TEST · Harbour Mezzanine', exact: true })
      .waitFor()
    await page
      .getByRole('link', { name: 'TEST · Harbour Courtyard', exact: true })
      .waitFor()
    console.log(
      `${name}: main-pane wheel scroll, Svelte DND, persistence, host links and physical demos passed`,
    )
    await page.close()
  } finally {
    await browser.close()
  }
}
