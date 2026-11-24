import { join } from 'node:path'
import { expect, test } from '@playwright/test'

test('switches Unison Building between facade editing and an orbiting 3D view', async ({
  page,
}) => {
  test.setTimeout(180_000)
  const admin = await page.goto('/admin', { waitUntil: 'domcontentloaded' })
  expect(admin.ok()).toBeTruthy()
  await expect(page).toHaveURL(/\/admin(?:\/features)?\/?$/)
  const session = await (await page.request.get('/api/auth/get-session')).json()
  expect(session.user.id).toBe('hype-local-agent-admin')

  // Use the installed government model even when this device has optional comparison textures.
  await page.route('**/api/location-exterior/**/comparison-*.glb', route =>
    route.fulfill({ status: 404 }),
  )
  await page.goto('/admin/locations/IssVInhZb-Gd#exterior', {
    waitUntil: 'domcontentloaded',
  })
  const mode = page.getByRole('group', { name: 'Exterior view mode' })
  const facade = mode.getByRole('button', { name: 'Facade', exact: true })
  const orbit = mode.getByRole('button', { name: '3D', exact: true })
  const editor = page.getByRole('region', { name: 'Visual façade floor alignment' })
  const viewer = page.locator('model-viewer')
  const floors = editor.getByRole('button', { name: /^Drag / })
  await expect(editor.getByRole('button', { name: 'Drag Top' })).toBeVisible({
    timeout: 90_000,
  })
  await expect(facade).toHaveAttribute('aria-pressed', 'true')
  const originalCount = await floors.count()
  await editor.getByRole('button', { name: 'Add floor' }).click()
  await expect(floors).toHaveCount(originalCount + 1)
  await editor.getByRole('button', { name: 'Next façade' }).click()
  await editor.getByLabel('50% transparent').check()
  const facadeOrbit = await viewer.evaluate(model => model.cameraOrbit)

  await orbit.click()
  await expect(orbit).toHaveAttribute('aria-pressed', 'true')
  await expect(editor).toBeHidden()
  await expect(viewer).toHaveJSProperty('cameraControls', true)
  const yaw = await viewer.evaluate(model => model.turntableRotation)
  await expect
    .poll(() => viewer.evaluate(model => model.turntableRotation), { timeout: 20_000 })
    .not.toBe(yaw)
  expect(await viewer.evaluate(model => model.cameraOrbit)).not.toBe(facadeOrbit)
  await page.screenshot({
    path: join(process.env.DEV_RUNNER_ARTIFACTS, 'unison-3d.png'),
  })

  await facade.click()
  await expect(viewer).toHaveJSProperty('autoRotate', false)
  await expect(viewer).toHaveJSProperty('turntableRotation', 0)
  await expect(viewer).toHaveJSProperty('cameraOrbit', facadeOrbit)
  await expect(editor.getByLabel('50% transparent')).toBeChecked()
  await expect(floors).toHaveCount(originalCount + 1)
  await editor.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(floors).toHaveCount(originalCount)
  await page.screenshot({
    path: join(process.env.DEV_RUNNER_ARTIFACTS, 'unison-facade.png'),
  })
})
