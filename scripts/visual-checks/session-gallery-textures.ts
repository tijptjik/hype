// NODE
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
// PLAYWRIGHT
import { chromium, expect } from '@playwright/test'
// TYPES
import type { ModelViewerElement } from '@google/model-viewer'

const {
  PLAYWRIGHT_BASE_URL: origin,
  DEV_RUNNER_ARTIFACTS: output,
  DEV_RUNNER_CHROME_CLASS: placement,
} = process.env
if (!origin || !output || !placement) throw new Error('Use managed Chrome.')
const records: { key: string; locationId: string; file: string }[] = JSON.parse(
  await readFile(new URL('./session-facade-records.json', import.meta.url), 'utf8'),
)
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
const evidence: unknown[] = []
page.on('console', message =>
  console.log('browser', message.type(), message.text().slice(0, 800)),
)
page.on('pageerror', error => console.log('pageerror', error.message))
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
  if (process.env.GALLERY_MAP_ONLY !== '1') {
    await page.goto(
      `${origin}/admin/field-recorder?session=5e856112-1f64-457a-8c64-3170e874688b&models=exterior#locations`,
      { waitUntil: 'domcontentloaded', timeout: 90000 },
    )
    const cards = page.getByRole('region', {
      name: 'Exterior gallery cards',
      exact: true,
    })
    await expect(cards.getByRole('article')).toHaveCount(11, { timeout: 90000 })
    for (const item of records) {
      const link = page.locator(
        `a[href="/admin/locations/${encodeURIComponent(item.locationId)}?organisation=oDucgyH4H4Bm"]`,
      )
      const card = cards.getByRole('article').filter({ has: link })
      await expect(card).toHaveCount(1)
      await card.evaluate(element => element.scrollIntoView({ block: 'center' }))
      const viewer = card.locator('model-viewer')
      await expect(viewer).toHaveAttribute(
        'src',
        new RegExp(`${item.file.replaceAll('.', '\\.')}?$`),
        { timeout: 90000 },
      )
      await expect
        .poll(
          () =>
            viewer.evaluate(
              (element: ModelViewerElement) =>
                element.loaded && element.variantName === 'AI-generated',
            ),
          { timeout: 90000 },
        )
        .toBe(true)
      await expect(viewer).toHaveAttribute('camera-orbit', /deg 90deg auto$/, {
        timeout: 90000,
      })
      await expect(card.getByRole('status', { name: /^Loading / })).toHaveCount(0, {
        timeout: 90000,
      })
      await card.screenshot({ path: join(output, `${item.key}-gallery.png`) })
      evidence.push({
        key: item.key,
        file: item.file,
        variant: await viewer.evaluate(
          (element: ModelViewerElement) => element.variantName,
        ),
        loaded: true,
      })
      await writeFile(
        join(output, 'gallery-textures.json'),
        JSON.stringify(evidence, null, 2),
      )
      console.log(item.key, 'gallery AI verified')
    }
    const excluded = cards.getByRole('article', { name: 'Kai King Mansion' })
    await excluded.evaluate(element => element.scrollIntoView({ block: 'center' }))
    const government = excluded.locator('model-viewer')
    await expect(government).toHaveAttribute('src', /\/assembly\.gltf$/, {
      timeout: 60000,
    })
    await expect
      .poll(
        () => government.evaluate((element: ModelViewerElement) => element.loaded),
        {
          timeout: 60000,
        },
      )
      .toBe(true)
    assert.notEqual(
      await government.evaluate((element: ModelViewerElement) => element.variantName),
      'AI-generated',
    )
    await page.setViewportSize({ width: 2160, height: 2200 })
    await cards.evaluate(element => element.scrollIntoView({ block: 'start' }))
    await page.screenshot({
      path: join(output, 'session-gallery-corrected.png'),
      fullPage: true,
    })
    console.log('All ten corrected gallery models verified; Kai King unchanged')
  }
  await page.goto(
    `${origin}/admin/field-recorder?session=5e856112-1f64-457a-8c64-3170e874688b&models=map#locations`,
    { waitUntil: 'domcontentloaded', timeout: 90000 },
  )
  const map = page.getByRole('region', { name: 'Session building map' })
  await expect(map).toContainText('11 of 11 exterior models', { timeout: 120000 })
  await page.screenshot({ path: join(output, 'session-map-corrected.png') })
  await writeFile(
    join(output, 'map-check.json'),
    JSON.stringify({ loadedModels: 11, expectedModels: 11, passed: true }),
  )
  console.log('All eleven map models loaded')
} catch (error) {
  await page
    .screenshot({ path: join(output, 'failure.png'), fullPage: true })
    .catch(() => {})
  await page
    .locator('body')
    .ariaSnapshot({ timeout: 5000 })
    .then(snapshot => writeFile(join(output, 'failure-ui.txt'), snapshot))
    .catch(() => {})
  throw error
} finally {
  await browser.close()
}
