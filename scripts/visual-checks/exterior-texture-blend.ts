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
  const admin = await page.goto(origin + '/admin', { waitUntil: 'domcontentloaded' })
  assert.ok(admin?.ok())
  await expect(page).toHaveURL(/\/admin(?:\/features)?\/?$/)
  const session = await (
    await page.request.get(origin + '/api/auth/get-session')
  ).json()
  assert.equal(session.user.id, 'hype-local-agent-admin')
  await page.goto(
    origin + '/admin/locations/0wZvOLTSnVg8?organisation=oDucgyH4H4Bm#exterior',
    { waitUntil: 'domcontentloaded', timeout: 90000 },
  )
  const slider = page.getByRole('slider', { name: 'Facade texture blend' })
  await expect(slider).toBeVisible({ timeout: 110000 })
  const viewer = page.locator('model-viewer')
  await expect(page.getByRole('button', { name: 'Next façade' })).toBeVisible({
    timeout: 45000,
  })
  await expect(slider).toHaveValue('1')
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
  const editor = page.getByRole('region', { name: 'Visual façade floor alignment' })
  const line = editor.getByRole('button', { name: 'Drag Floor 6', exact: true })
  await expect(line).toHaveAttribute('title', 'Height reference · Government model')
  const height = async () => (await line.boundingBox())!.y
  const positions: string[] = []
  let photoY = 0
  let halfwayY = 0
  for (const [idx, label] of ['Government', 'Revised', 'AI-generated'].entries()) {
    await group.getByRole('button', { name: label, exact: true }).click()
    await expect(slider).toHaveValue(String(idx))
    positions[idx * 2] = await imageAt(label)
    if (idx === 1) photoY = await height()
    if (idx === 2) {
      const generatedY = await height()
      assert.ok(
        Math.abs(generatedY - photoY) > 1,
        'The front line should follow the registered image',
      )
      assert.ok(Math.abs(halfwayY - (photoY + generatedY) / 2) < 0.5)
      await page.screenshot({ path: join(output, 'registered-residential-lines.png') })
      await line.press('ArrowDown')
      await expect(line).toHaveAttribute('title', /AI-generated · façade/)
      await editor.getByRole('button', { name: 'Undo', exact: true }).click()
      await expect(line).toHaveAttribute('title', 'Height reference · Government model')
    }
    if (idx < 2) {
      await slider.focus()
      for (let step = 0; step < 50; step++) await slider.press('ArrowRight')
      await expect(slider).toHaveValue(String(idx + 0.5))
      await expect(slider).toHaveAttribute('aria-valuetext', /50%/)
      positions[idx * 2 + 1] = await imageAt('blend-' + idx)
      if (idx === 1) halfwayY = await height()
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
  await page.getByRole('button', { name: '3D', exact: true }).click()
  await expect(slider).toBeVisible()
  await group.getByRole('button', { name: 'AI-generated', exact: true }).click()
  await expect(slider).toHaveValue('2')
  await page.screenshot({ path: join(output, 'texture-slider-3d.png') })
  assert.deepEqual(errors, [])
} catch (error) {
  console.log((await page.locator('body').innerText()).slice(-3200))
  console.log(errors)
  await page.screenshot({ path: join(output, 'texture-failed.png') })
  throw error
} finally {
  await browser.close()
}
