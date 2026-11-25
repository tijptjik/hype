import { join } from 'node:path'
import { expect, test } from '@playwright/test'

test('zooms and pans each façade independently while keeping floor controls at UI scale', async ({
  page,
}) => {
  test.setTimeout(180_000)
  const admin = await page.goto('/admin', { waitUntil: 'domcontentloaded' })
  expect(admin.ok()).toBeTruthy()
  await expect(page).toHaveURL(/\/admin(?:\/features)?\/?$/)
  const session = await (await page.request.get('/api/auth/get-session')).json()
  expect(session.user.id).toBe('hype-local-agent-admin')
  await page.goto('/admin/locations/0wZvOLTSnVg8?organisation=oDucgyH4H4Bm#exterior', {
    waitUntil: 'domcontentloaded',
  })
  const editor = page.getByRole('region', { name: 'Visual façade floor alignment' })
  const zoomIn = editor.getByRole('button', { name: 'Zoom in' })
  const fit = editor.getByRole('button', { name: 'Fit façade to view' })
  const undo = editor.getByRole('button', { name: 'Undo' })
  const lines = editor.getByRole('button', { name: /^Drag / })
  const guide = lines.nth(4)
  await expect(guide).toBeVisible({ timeout: 100_000 })
  const original = await guide.boundingBox()
  const toolbarButton = await undo.boundingBox()
  await zoomIn.click()
  await expect(fit).toHaveText('125%')
  await expect
    .poll(async () => (await guide.boundingBox()).width / original.width)
    .toBeCloseTo(1.25, 1)
  expect(await undo.boundingBox()).toEqual(toolbarButton)
  expect((await guide.boundingBox()).height).toBe(original.height)

  const viewport = await editor.boundingBox()
  const x = viewport.x + viewport.width / 2
  const y = viewport.y + viewport.height / 2
  await page.mouse.move(x, y)
  await page.mouse.wheel(0, -180)
  await expect
    .poll(async () => (await guide.boundingBox()).width / original.width)
    .toBeGreaterThan(1.6)
  const zoomed = (await fit.textContent()).trim()
  const beforePan = await guide.boundingBox()
  // Drag empty canvas space so the pointer cannot grab a floor boundary.
  await page.mouse.move(viewport.x + 10, y)
  await page.mouse.down()
  await page.mouse.move(viewport.x + 30, y + 55)
  await page.mouse.up()
  await expect
    .poll(async () => (await guide.boundingBox()).y - beforePan.y)
    .toBeCloseTo(55, 0)
  await expect(undo).toBeDisabled()
  await editor.getByRole('button', { name: 'Next façade' }).click()
  await expect(fit).toHaveText('100%')
  await editor.getByRole('button', { name: 'Previous façade' }).click()
  await expect(fit).toHaveText(zoomed)
  await expect
    .poll(async () => (await guide.boundingBox()).y - beforePan.y)
    .toBeCloseTo(55, 0)

  const zoomedGuide = await guide.boundingBox()
  await page.mouse.move(
    zoomedGuide.x + zoomedGuide.width / 2,
    zoomedGuide.y + zoomedGuide.height / 2,
  )
  await page.mouse.down()
  await page.mouse.move(
    zoomedGuide.x + zoomedGuide.width / 2,
    zoomedGuide.y + zoomedGuide.height / 2 - 8,
  )
  await page.mouse.up()
  await expect(undo).toBeEnabled()
  await page.keyboard.press('Control+z')
  await expect
    .poll(async () => (await guide.boundingBox()).y)
    .toBeCloseTo(zoomedGuide.y, 0)
  await page.screenshot({
    path: join(process.env.DEV_RUNNER_ARTIFACTS, 'facade-zoom.png'),
  })
  await page.mouse.move(x, y)
  await page.mouse.wheel(0, -1500)
  await expect(fit).toHaveText('400%')
  await expect(zoomIn).toBeDisabled()
  await editor.getByRole('button', { name: 'Zoom out' }).click()
  await expect(fit).toHaveText('320%')
  await fit.click()
  await expect(fit).toHaveText('100%')
  await expect
    .poll(async () => (await guide.boundingBox()).y)
    .toBeCloseTo(original.y, 0)
  await expect(editor.getByRole('button', { name: 'Zoom out' })).toBeDisabled()
})
