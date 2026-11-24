// NODE
import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
// PLAYWRIGHT
import { chromium, expect } from '@playwright/test'

const {
  PLAYWRIGHT_BASE_URL: origin,
  DEV_RUNNER_ARTIFACTS: output,
  DEV_RUNNER_CHROME_CLASS: placement,
} = process.env
if (!origin || !output || !placement) throw new Error('Use managed Chrome.')
const browser = await chromium.launch({
  channel: 'chrome',
  headless: false,
  args: ['--ozone-platform=x11', `--class=${placement}`, '--disable-web-security'],
})
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
const errors: string[] = []
page.on('pageerror', e => errors.push(e.message))
page.on('console', m => {
  if (m.type() === 'error') console.error(m.text().slice(0, 2500))
})
try {
  await page.goto(origin + '/admin/locations/IssVInhZb-Gd#exterior', {
    waitUntil: 'domcontentloaded',
    timeout: 90000,
  })
  const session = await (
    await page.request.get(origin + '/api/auth/get-session')
  ).json()
  assert.equal(session.user.id, 'hype-local-agent-admin')
  const slider = page.getByRole('slider', { name: 'Facade texture blend' })
  await expect(slider).toBeVisible({ timeout: 110000 })
  const viewer = page.locator('model-viewer')
  await expect(page.getByRole('button', { name: 'Next façade' })).toBeVisible({
    timeout: 45000,
  })
  await expect(slider).toHaveValue('1')
  await viewer.evaluate(async (v: any) => {
    v.autoRotate = false
    v.cameraTarget = 'auto auto auto'
    v.cameraOrbit = `90deg 90deg ${v.getCameraOrbit().radius}m`
    await v.updateComplete
    v.jumpCameraToGoal()
  })
  const imageAt = async (name: string) => {
    // Wait for multiple identical frames to exclude camera motion from the blend evidence.
    let last = ''
    await expect
      .poll(
        async () => {
          const current = await viewer.evaluate((v: any) => v.toDataURL('image/png'))
          const settled = current === last
          last = current
          return settled
        },
        { timeout: 12000, intervals: [180, 220, 300] },
      )
      .toBe(true)
    await writeFile(
      join(output, name + '.png'),
      Buffer.from(last.split(',')[1], 'base64'),
    )
    return last
  }
  const group = page.getByRole('group', { name: 'Facade textures' })
  const positions: string[] = []
  for (const [idx, label] of ['Government', 'Revised', 'AI-generated'].entries()) {
    await group.getByRole('button', { name: label, exact: true }).click()
    await expect(slider).toHaveValue(String(idx))
    positions[idx * 2] = await imageAt(label)
    if (idx < 2) {
      await slider.focus()
      for (let step = 0; step < 50; step++) await slider.press('ArrowRight')
      await expect(slider).toHaveValue(String(idx + 0.5))
      await expect(slider).toHaveAttribute('aria-valuetext', /50%/)
      positions[idx * 2 + 1] = await imageAt('blend-' + idx)
    }
  }
  assert.equal(
    new Set(positions).size,
    5,
    'Each endpoint and intermediate blend must render differently',
  )
  await slider.focus()
  await slider.press('Home')
  await expect(slider).toHaveValue('0')
  assert.ok(
    (await imageAt('restored-government')) === positions[0],
    'Government pixels should be restored',
  )
  await group.getByRole('button', { name: 'Revised', exact: true }).click()
  await page.screenshot({ path: join(output, 'texture-slider.png') })
  assert.deepEqual(errors, [])
} catch (error) {
  console.log((await page.locator('body').innerText()).slice(-3200))
  console.log(errors)
  await page.screenshot({ path: join(output, 'texture-failed.png') })
  throw error
} finally {
  await browser.close()
}
