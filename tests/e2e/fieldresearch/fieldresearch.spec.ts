import { expect, test } from '@playwright/test'
import sharp from 'sharp'
import path from 'node:path'

test.use({
  serviceWorkers: 'block',
  viewport: { width: 1600, height: 1100 },
  launchOptions: {
    args: [
      '--ozone-platform=x11',
      `--class=${process.env.DEV_RUNNER_CHROME_CLASS}`,
      '--disable-web-security',
    ],
  },
})

/** Generate synthetic capture fixtures carrying real EXIF GPS, without user photographs.
 * @param colour Fixture colour. @param gps Whether to include a Hong Kong capture point.
 * @returns JPEG bytes for the real browser file picker and metadata parser.
 */
async function capture(colour: string, gps = true): Promise<Buffer> {
  const jpeg = await sharp({
    create: { width: 320, height: 240, channels: 3, background: colour },
  })
    .jpeg()
    .toBuffer()
  if (!gps) return jpeg
  const tiff = Buffer.alloc(128)
  tiff.write('II')
  tiff.writeUInt16LE(42, 2)
  tiff.writeUInt32LE(8, 4)
  tiff.writeUInt16LE(1, 8)
  tiff.writeUInt16LE(0x8825, 10)
  tiff.writeUInt16LE(4, 12)
  tiff.writeUInt32LE(1, 14)
  tiff.writeUInt32LE(26, 18)
  tiff.writeUInt16LE(4, 26)
  for (const [index, tag, type, count, value] of [
    [0, 1, 2, 2, 78],
    [1, 2, 5, 3, 80],
    [2, 3, 2, 2, 69],
    [3, 4, 5, 3, 104],
  ]) {
    const at = 28 + index * 12
    tiff.writeUInt16LE(tag, at)
    tiff.writeUInt16LE(type, at + 2)
    tiff.writeUInt32LE(count, at + 4)
    tiff.writeUInt32LE(value, at + 8)
  }
  for (const [index, value] of [22, 18, 0, 114, 10, 12].entries()) {
    tiff.writeUInt32LE(value, 80 + index * 8)
    tiff.writeUInt32LE(1, 84 + index * 8)
  }
  const marker = Buffer.alloc(4)
  marker.writeUInt16BE(0xffe1)
  marker.writeUInt16BE(tiff.length + 8, 2)
  return Buffer.concat([
    jpeg.subarray(0, 2),
    marker,
    Buffer.from('Exif\0\0'),
    tiff,
    jpeg.subarray(2),
  ])
}

test('retains uploads, suggests and edits stacks, places missing GPS and creates an unpublished gallery', async ({
  page,
}) => {
  test.setTimeout(180000)
  page.setDefaultTimeout(30000)
  const artifacts = process.env.DEV_RUNNER_ARTIFACTS!
  const name = `[Test] Field research ${Date.now()}`
  await page.goto('/admin/fieldresearch')
  await page.getByRole('button', { name: 'New', exact: true }).click({ timeout: 60000 })
  // The required map-testing flag suppresses Chrome's automatic Origin header.
  // Restore the real page origin in the harness; production CSRF checks stay strict.
  await page.route('**/api/fieldresearch/**', async route => {
    const response = await route.fetch({
      headers: { ...route.request().headers(), origin: new URL(page.url()).origin },
    })
    await route.fulfill({ response })
  })
  const session = await (
    await page.context().request.get('/api/auth/get-session')
  ).json()
  expect(session.user.id).toBe('hype-local-agent-admin')
  await expect(page.getByRole('heading', { name: 'Batch Image Upload' })).toBeVisible({
    timeout: 60000,
  })
  await expect(page).toHaveTitle(/ - Field research$/)
  await page.screenshot({ path: path.join(artifacts, 'fieldresearch-setup.png') })
  const projectSearch = page.getByPlaceholder('Search layers or projects', {
    exact: true,
  })
  await expect(async () => {
    await projectSearch.fill('Breadline')
    await expect(projectSearch).toHaveValue('Breadline', { timeout: 500 })
  }).toPass({ timeout: 15000 })
  await page
    .locator('main[data-responsive-main]')
    .getByRole('button', { name: /Breadline/ })
    .first()
    .click()
  await expect(async () => {
    await page.getByLabel('Session', { exact: true }).fill(name)
    await expect(page.getByLabel('Session', { exact: true })).toHaveValue(name, {
      timeout: 500,
    })
  }).toPass({ timeout: 15000 })
  await page.getByRole('button', { name: 'Start session', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Save name' })).toBeEnabled({
    timeout: 60000,
  })
  await expect(page.getByLabel('Session', { exact: true })).toHaveValue(name)
  await page.screenshot({ path: path.join(artifacts, 'fieldresearch-upload.png') })
  await page.locator('input[type=file]').setInputFiles([
    {
      name: 'capture-red.jpg',
      mimeType: 'image/jpeg',
      buffer: await capture('#ce6859'),
    },
    {
      name: 'capture-blue.jpg',
      mimeType: 'image/jpeg',
      buffer: await capture('#3d7184'),
    },
    {
      name: 'capture-no-gps.jpg',
      mimeType: 'image/jpeg',
      buffer: await capture('#d5ac55', false),
    },
  ])
  const map = page.getByRole('region', { name: 'Research map', exact: true })
  await expect(map).toBeVisible({ timeout: 90000 })
  const track = page.getByRole('region', { name: 'Research photo track' })
  await expect(track.getByRole('button')).toHaveCount(1)
  await expect(track).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
  await expect(page.getByRole('button', { name: 'Place marker on map' })).toHaveCount(0)
  await expect(page.getByLabel('Destination layer')).toHaveCount(0)
  const canvas = page.locator('canvas.maplibregl-canvas')
  const unplacedPhoto = track.getByRole('button', {
    name: 'Drag capture-no-gps.jpg onto map',
  })
  const unplacedBounds = await unplacedPhoto.boundingBox()
  if (!unplacedBounds) throw new Error('Missing unplaced thumbnail')
  await page.mouse.move(unplacedBounds.x + 40, unplacedBounds.y + 40)
  await page.mouse.down()
  await page.mouse.move(unplacedBounds.x + 60, unplacedBounds.y - 60, { steps: 8 })
  await expect(unplacedPhoto).toHaveCSS('opacity', '0')
  await page.keyboard.press('Escape')
  await page.mouse.up()
  await expect(unplacedPhoto).toHaveCSS('opacity', '1')
  await track
    .getByRole('button', { name: 'Drag capture-no-gps.jpg onto map' })
    .dragTo(canvas, { targetPosition: { x: 260, y: 320 } })
  await expect(track.getByRole('button')).toHaveCount(0)
  const singleton = page.getByRole('button', {
    name: 'Move stack with 1 images',
    exact: true,
  })
  await expect(singleton).toBeEnabled()
  const beforeHover = await singleton.boundingBox()
  await singleton.hover()
  const afterHover = await singleton.boundingBox()
  expect(afterHover?.x).toBeCloseTo(beforeHover!.x, 0)
  expect(afterHover?.y).toBeCloseTo(beforeHover!.y, 0)
  const first = page.getByRole('button', {
    name: 'Move stack with 2 images',
    exact: true,
  })
  await first.hover()
  const source = page.getByRole('button', { name: 'Drag capture-red.jpg from stack' })
  await expect(source).toBeEnabled()
  const merge = page.waitForResponse(
    response =>
      response.url().includes('/moveResearchCapture') &&
      response.request().method() === 'POST',
  )
  await source.dragTo(
    page.getByRole('button', { name: 'Move stack with 1 images', exact: true }),
  )
  await expect(
    page.getByRole('button', { name: 'Move stack with 2 images', exact: true }),
  ).toBeVisible()
  await merge
  // Move a whole marker using its numbered handle and inspect its placement feedback.
  const handle = page.getByRole('button', {
    name: 'Move stack with 2 images',
    exact: true,
  })
  await expect(handle).toBeEnabled()
  await page.route('**/_app/remote/**/placeResearchCapture', async route => {
    const response = await route.fetch()
    await new Promise(resolve => setTimeout(resolve, 400))
    await route.fulfill({ response })
  })
  const box = await handle.boundingBox()
  if (!box) throw new Error('Missing stack anchor')
  await page.mouse.move(box.x + 16, box.y + 16)
  await page.mouse.down()
  await page.mouse.move(box.x + 75, box.y + 45, { steps: 6 })
  await expect(handle).toHaveText('')
  await expect(handle.locator('..').locator('[style]').first()).toHaveCSS(
    'opacity',
    '0.5',
  )
  await page.screenshot({ path: path.join(artifacts, 'research-marker-drag.png') })
  const placed = page.waitForResponse(
    response =>
      response.url().includes('/placeResearchCapture') &&
      response.request().method() === 'POST',
  )
  await page.mouse.up()
  const pendingBounds = await handle.boundingBox()
  expect(Math.abs((pendingBounds?.x ?? 0) - (box.x + 59))).toBeLessThan(1)
  expect(Math.abs((pendingBounds?.y ?? 0) - (box.y + 29))).toBeLessThan(1)
  await placed
  await expect(handle).toBeEnabled()
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(
    page.getByText('Choose a Feature type for every stack before saving.', {
      exact: true,
    }),
  ).toBeVisible()
  await expect(page.getByText(/\{"status":400/)).toHaveCount(0)
  for (const count of [2, 1]) {
    await page
      .getByRole('button', { name: `Move stack with ${count} images`, exact: true })
      .click()
    const typeField = page.getByLabel('Feature type', { exact: true })
    await typeField.click()
    await typeField.press('ArrowDown')
    await typeField.press('Enter')
    await expect(page.getByLabel('Stack name')).toBeEnabled()
    await page.getByLabel('Stack name').click()
    await expect(page.getByLabel('Stack name')).toBeFocused()
    await page.getByLabel('Stack name').pressSequentially(`Research ${count} ${name}`)
    await page.getByLabel('Stack name').press('Tab')
    await expect(page.getByLabel('Stack name')).toBeEnabled()
    await page
      .getByRole('button', { name: `Move stack with ${count} images`, exact: true })
      .click()
  }
  const sourceHandle = page.getByRole('button', {
    name: 'Move stack with 2 images',
    exact: true,
  })
  const targetHandle = page.getByRole('button', {
    name: 'Move stack with 1 images',
    exact: true,
  })
  await expect(sourceHandle).toBeEnabled()
  const sourceBounds = await sourceHandle.boundingBox(),
    targetBounds = await targetHandle.boundingBox()
  if (!sourceBounds || !targetBounds) throw new Error('Missing merge handles')
  await page.mouse.move(sourceBounds.x + 16, sourceBounds.y + 16)
  await page.mouse.down()
  await page.mouse.move(targetBounds.x + 16, targetBounds.y + 16, { steps: 8 })
  await expect(targetHandle).toHaveClass(/ring-4/)
  await expect(sourceHandle).toHaveClass(/ring-4/)
  await page.screenshot({
    path: path.join(artifacts, 'research-stack-merge-target.png'),
  })
  const merged = page.waitForResponse(
    response =>
      response.url().includes('/mergeResearchCaptures') &&
      response.request().method() === 'POST',
  )
  await page.mouse.up()
  await merged
  await expect(
    page.getByRole('button', { name: 'Move stack with 3 images', exact: true }),
  ).toBeVisible()
  await page.screenshot({ path: path.join(artifacts, 'research-map-workspace.png') })
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(
    page.getByText('1 unpublished Features created.', { exact: true }),
  ).toBeVisible({ timeout: 60000 })
  await expect(page).toHaveURL(/\/admin\/features\?origin=field_research&originId=/)
  const destination = page.url()
  const sessionId = new URL(destination).searchParams.get('originId')
  expect(sessionId).toBeTruthy()
  await expect(page.getByRole('main')).toContainText(`Research 1 ${name}`)
  const createdVia = page.getByRole('button', { name: 'Created via', exact: true })
  if (!(await createdVia.isVisible()))
    await page.getByRole('button', { name: 'Filter By', exact: true }).click()
  await createdVia.click()
  await expect(page.getByRole('combobox', { name: 'Any origin' })).toHaveText(
    'Field research',
  )
  await expect(page.getByRole('combobox', { name: 'Any session' })).toHaveText(name)
  await page.screenshot({
    path: path.join(artifacts, 'research-saved-feature-index.png'),
  })
  await page.reload()
  await expect(page.getByRole('main')).toContainText(`Research 1 ${name}`, {
    timeout: 60000,
  })
  await expect(
    page.getByRole('status', { name: 'Results: 1', exact: true }),
  ).toBeVisible()
  await page.goto('/admin/fieldresearch')
  await page
    .locator('input[placeholder="Search field research"]:visible')
    .first()
    .fill(name)
  const results = page.getByRole('region', { name: 'Research sessions' })
  await expect(results.getByRole('button')).toHaveCount(1)
  await expect(results).toContainText(name)
  await page.screenshot({ path: path.join(artifacts, 'research-index-search.png') })
})

test('uses Feature setup project suggestions', async ({ page }) => {
  test.setTimeout(120000)
  const artifacts = process.env.DEV_RUNNER_ARTIFACTS
  if (!artifacts) throw new Error('Missing browser artifacts directory')
  await page.goto('/admin/fieldresearch')
  await page.getByRole('button', { name: 'New', exact: true }).click({ timeout: 60000 })
  const session = await (await page.request.get('/api/auth/get-session')).json()
  expect(session.user.id).toBe('hype-local-agent-admin')
  const search = page.getByPlaceholder('Search layers or projects')
  await expect(search).toBeVisible({ timeout: 60000 })
  await expect(async () => {
    await search.fill('Breadline')
    await expect(search).toHaveValue('Breadline')
  }).toPass()
  const suggestions = page.getByRole('region', {
    name: 'Suggested layers',
    exact: true,
  })
  const project = suggestions.getByRole('button', { name: /Breadline/ }).first()
  await project.click()
  await expect(project).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByLabel('Session', { exact: true })).toHaveValue('')
  await page.getByLabel('Session', { exact: true }).fill('Research test')
  await expect(
    page.getByRole('button', { name: 'Start session', exact: true }),
  ).toBeEnabled()
  await page.screenshot({ path: path.join(artifacts, 'research-project-desktop.png') })
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(search).toBeVisible({ timeout: 60000 })
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  ).toBe(true)
  await page.screenshot({ path: path.join(artifacts, 'research-project-mobile.png') })
})

test('opens the research file picker before session creation', async ({ page }) => {
  test.setTimeout(120000)
  await page.goto('/admin/fieldresearch')
  await page.getByRole('button', { name: 'New', exact: true }).click({ timeout: 60000 })
  const session = await (await page.request.get('/api/auth/get-session')).json()
  expect(session.user.id).toBe('hype-local-agent-admin')
  const zone = page.getByRole('button', { name: /Drop your research photos here/ })
  await expect(zone).toBeVisible({ timeout: 60000 })
  await expect(page.getByPlaceholder('Search layers or projects')).toBeEnabled()
  for (const activation of ['click', 'Enter', 'Space']) {
    const chooserPromise = page.waitForEvent('filechooser')
    if (activation === 'click') await zone.click()
    else {
      await zone.focus()
      await zone.press(activation)
    }
    const chooser = await chooserPromise
    expect(chooser.isMultiple()).toBe(true)
    await chooser.setFiles({
      name: `${activation}.jpg`,
      mimeType: 'image/jpeg',
      buffer: await capture('#3d7184'),
    })
  }
  await expect(zone).toContainText('3 images queued')
  await expect(
    page.getByRole('button', { name: 'Start session', exact: true }),
  ).toBeVisible()
})
