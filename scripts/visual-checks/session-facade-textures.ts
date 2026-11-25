// NODE
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
// PLAYWRIGHT
import { chromium, expect } from '@playwright/test'

const {
  PLAYWRIGHT_BASE_URL: origin,
  DEV_RUNNER_ARTIFACTS: output,
  DEV_RUNNER_CHROME_CLASS: placement,
} = process.env
if (!origin || !output || !placement) throw new Error('Use managed Chrome.')
// The installer emits this public-safe list into the tracked check directory before submitting.
const records = JSON.parse(
  await readFile(new URL('./session-facade-records.json', import.meta.url), 'utf8'),
)
// Place this dedicated test window before launch without changing the user's workspace.
const placementRule = `hl.window_rule({name="facade-${placement}",workspace="7 silent",match={class="^${placement}$"}})`
execFileSync('hyprctl', ['eval', placementRule], { stdio: 'pipe' })
const browser = await chromium.launch({
  channel: 'chrome',
  headless: false,
  args: ['--ozone-platform=x11', `--class=${placement}`, '--disable-web-security'],
})
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
const evidence: unknown[] = []
try {
  const admin = await page.goto(origin + '/admin', { waitUntil: 'domcontentloaded' })
  assert.ok(admin?.ok())
  const windows = JSON.parse(
    execFileSync('hyprctl', ['-j', 'clients'], { encoding: 'utf8' }),
  )
  const owned = windows.filter((window: any) => window.class === placement)
  assert.ok(owned.length, 'Dedicated Chrome window is identifiable')
  assert.ok(
    owned.every((window: any) => window.workspace?.id === 7),
    'Chrome stays on workspace 7',
  )
  await expect(page).toHaveURL(/\/admin(?:\/features)?\/?$/)
  const session = await (
    await page.request.get(origin + '/api/auth/get-session')
  ).json()
  assert.equal(session.user.id, 'hype-local-agent-admin')
  for (const item of records.slice(Number(process.env.FACADE_CHECK_START ?? 0))) {
    const response = await page.goto(
      origin +
        '/admin/locations/' +
        encodeURIComponent(item.locationId) +
        '?organisation=oDucgyH4H4Bm#exterior',
      { waitUntil: 'domcontentloaded', timeout: 90000 },
    )
    assert.ok(response?.ok())
    const slider = page.getByRole('slider', { name: 'Facade texture blend' })
    await expect(slider).toBeVisible({ timeout: 110000 })
    const editor = page.getByRole('region', { name: 'Visual façade floor alignment' })
    await expect(editor.getByRole('status')).toHaveText('Saved · r' + item.revision, {
      timeout: 60000,
    })
    const viewer = page.locator('model-viewer')
    await viewer.evaluate(element => element.scrollIntoView({ block: 'center' }))
    await expect(editor.getByRole('button', { name: /^Drag / })).toHaveCount(
      item.floors + 1,
      { timeout: 60000 },
    )
    await expect(viewer).toHaveAttribute(
      'src',
      new RegExp(item.file.replaceAll('.', '\\.')),
    )
    const group = page.getByRole('group', { name: 'Facade textures' })
    const frames: string[] = []
    // Normalize to the base/top handles so focus scrolling cannot masquerade as line movement.
    const heights: number[][] = []
    for (const [index, label] of ['Government', 'Revised', 'AI-generated'].entries()) {
      await group.getByRole('button', { name: label, exact: true }).click()
      await expect(slider).toHaveValue(String(index))
      let previous = ''
      await expect
        .poll(
          async () => {
            const frame = await viewer.evaluate((v: any) => v.toDataURL('image/png'))
            const settled = frame === previous
            previous = frame
            return settled
          },
          { timeout: 15000, intervals: [200, 250, 300] },
        )
        .toBe(true)
      frames.push(previous)
      heights[index] = await editor
        .getByRole('button', { name: /^Drag / })
        .evaluateAll(elements => {
          const ys = elements.map(element => element.getBoundingClientRect().y)
          return ys.map(y => (1000 * (y - ys[0])) / (ys[ys.length - 1] - ys[0]))
        })
      await writeFile(
        join(output, item.key + '-' + index + '.png'),
        Buffer.from(previous.split(',')[1], 'base64'),
      )
    }
    assert.notEqual(frames[0], frames[1], item.key + ': photo differs from government')
    assert.notEqual(frames[1], frames[2], item.key + ': AI differs from photo')
    await page.screenshot({ path: join(output, item.key + '-editor.png') })
    await group.getByRole('button', { name: 'Revised', exact: true }).click()
    await slider.focus()
    for (let step = 0; step < 50; step++) await slider.press('ArrowRight')
    await expect(slider).toHaveValue('1.5')
    const midpoint = await editor
      .getByRole('button', { name: /^Drag / })
      .evaluateAll(elements => {
        const ys = elements.map(element => element.getBoundingClientRect().y)
        return ys.map(y => (1000 * (y - ys[0])) / (ys[ys.length - 1] - ys[0]))
      })
    for (const index of item.movingLines) {
      assert.ok(
        Math.abs(heights[2][index] - heights[1][index]) > 0.1,
        item.key + ': registered line moves',
      )
      assert.ok(
        Math.abs(midpoint[index] - (heights[2][index] + heights[1][index]) / 2) < 0.75,
        item.key + ': midpoint interpolation',
      )
    }
    await page.reload({ waitUntil: 'domcontentloaded' })
    await viewer.evaluate(element => element.scrollIntoView({ block: 'center' }))
    await expect(editor.getByRole('status')).toHaveText('Saved · r' + item.revision, {
      timeout: 110000,
    })
    await expect(editor.getByRole('button', { name: /^Drag / })).toHaveCount(
      item.floors + 1,
      { timeout: 60000 },
    )
    await expect(viewer).toHaveAttribute(
      'src',
      new RegExp(item.file.replaceAll('.', '\\.')),
    )
    evidence.push({
      key: item.key,
      floors: item.floors,
      file: item.file,
      slider: true,
      distinctVariants: true,
      persistedAfterReload: true,
    })
    await writeFile(
      join(output, 'session-facades.json'),
      JSON.stringify(evidence, null, 2),
    )
    console.log(item.key, 'verified')
  }
} catch (error) {
  await page
    .screenshot({ path: join(output, 'failure.png'), fullPage: true })
    .catch(() => {})
  await writeFile(
    join(output, 'failure-ui.txt'),
    await page.locator('body').ariaSnapshot(),
  ).catch(() => {})
  throw error
} finally {
  await browser.close()
}
