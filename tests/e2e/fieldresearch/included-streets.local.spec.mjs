import { join } from 'node:path'
import { expect, test } from '@playwright/test'

test('groups the included buildings in the Kowloon City session by street and number', async ({
  page,
}) => {
  test.setTimeout(180_000)
  const admin = await page.goto('/admin', { waitUntil: 'domcontentloaded' })
  expect(admin.ok()).toBeTruthy()
  await expect(page).toHaveURL(/\/admin(?:\/features)?\/?$/)
  expect((await (await page.request.get('/api/auth/get-session')).json()).user.id).toBe(
    'hype-local-agent-admin',
  )
  await page.goto(
    '/admin/field-recorder?session=5e856112-1f64-457a-8c64-3170e874688b#locations',
    { waitUntil: 'domcontentloaded' },
  )
  const list = page.getByRole('complementary', { name: 'Included Locations' })
  const names = list.getByRole('heading', { level: 4 })
  await expect(names.first()).toHaveText('Kai Tak Road', { timeout: 60_000 })
  const labels = (await names.allTextContents()).map(label => label.trim())
  const known = labels.filter(label => label !== 'Street unknown')
  expect(labels).toEqual([
    ...known.toSorted(),
    ...labels.filter(label => label === 'Street unknown'),
  ])
  expect(known).toEqual(
    expect.arrayContaining([
      'Kai Tak Road',
      'Lung Kong Road',
      'Nga Tsin Wai Road',
      'Tak Ku Ling Road',
    ]),
  )
  const street = list.getByRole('region', { name: 'Tak Ku Ling Road' })
  const rows = street.locator(':scope > ul > li')
  const firstNumbers = await rows.evaluateAll(items =>
    items.map(item => Number(item.querySelector('a + p').textContent.match(/\d+/)[0])),
  )
  expect(firstNumbers).toEqual(firstNumbers.toSorted((a, b) => a - b))
  expect(firstNumbers).toEqual(expect.arrayContaining([20, 26, 32, 36]))
  const streetToggle = street.getByRole('button', {
    name: 'Tak Ku Ling Road',
    exact: true,
  })
  const buildingRows = street.locator(':scope > ul')
  await expect(streetToggle).toHaveAttribute('aria-expanded', 'true')
  await streetToggle.click()
  await expect(streetToggle).toHaveAttribute('aria-expanded', 'false')
  await expect(buildingRows).toBeHidden()
  await expect(list.getByRole('link', { name: 'Kai King Mansion' })).toBeVisible()
  await expect(street).toContainText(/36 TAK KU LING ROAD.*38 TAK KU LING ROAD/is)
  await expect(list.getByRole('region', { name: 'Lung Kong Road' })).toContainText(
    'Kai King Mansion',
  )
  const uniqueLocations = await list
    .locator('section > ul > li > div:first-child > div > a')
    .evaluateAll(links => new Set(links.map(link => link.href)).size)
  await expect(list.locator('h3 + span')).toHaveText(String(uniqueLocations))
  const view = page.getByRole('region', { name: 'Vetted Locations' })
  const header = view.locator(':scope > header')
  const controls = header.getByRole('group', { name: 'Location view controls' })
  const groupBy = controls.getByRole('combobox', { name: 'Group by' })
  const sortBy = controls.getByRole('combobox', { name: 'Sort by' })
  await expect(
    controls.getByRole('button', { name: 'Search', exact: true }),
  ).toBeVisible()
  await expect(controls.getByRole('button', { name: 'Map based' })).toBeVisible()
  await expect(list.getByRole('combobox')).toHaveCount(0)
  await expect(groupBy).toHaveValue('street')
  await expect(sortBy).toHaveValue('number-asc')
  await sortBy.selectOption('number-desc')
  await expect(buildingRows).toBeHidden()
  await streetToggle.press('Enter')
  await expect(buildingRows).toBeVisible()
  const descending = await rows.evaluateAll(items =>
    items.map(item => Number(item.querySelector('a + p').textContent.match(/\d+/)[0])),
  )
  expect(descending).toEqual([...firstNumbers].reverse())
  await groupBy.selectOption('none')
  await expect(names).toHaveCount(0)
  const titleLinks = list.locator('section > ul > li > div:first-child > div > a')
  await expect(titleLinks).toHaveCount(uniqueLocations)
  await sortBy.selectOption('name-asc')
  const byName = await titleLinks.allTextContents()
  const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' })
  expect(byName).toEqual(byName.toSorted(collator.compare))
  await sortBy.selectOption('name-desc')
  expect(await titleLinks.allTextContents()).toEqual([...byName].reverse())
  await groupBy.selectOption('district')
  const district = list.getByRole('region', { name: 'Kowloon City District' })
  await expect(district).toContainText('Kai King Mansion', { timeout: 60_000 })
  await expect(district).toContainText('Luen Fat Building')
  await expect(sortBy).toHaveValue('name-desc')
  const districtToggle = district.getByRole('button', {
    name: 'Kowloon City District',
    exact: true,
  })
  await districtToggle.press('Space')
  await expect(districtToggle).toHaveAttribute('aria-expanded', 'false')
  await expect(district.locator(':scope > ul')).toBeHidden()
  await groupBy.selectOption('none')
  await expect(titleLinks.first()).toBeVisible()
  await groupBy.selectOption('district')
  await expect(districtToggle).toHaveAttribute('aria-expanded', 'false')
  await districtToggle.click()
  await expect(district.getByRole('link', { name: 'Kai King Mansion' })).toBeVisible()
  await header.screenshot({
    path: join(process.env.DEV_RUNNER_ARTIFACTS, 'included-location-controls.png'),
  })
  const viewport = page.viewportSize()
  // The admin shell has a desktop minimum. Constrain the view to a narrow pane within it.
  await view.evaluate(section => section.style.setProperty('max-width', '480px'))
  await expect
    .poll(async () => (await header.boundingBox()).width)
    .toBeLessThanOrEqual(480)
  const frame = await header.boundingBox()
  for (const control of [
    groupBy,
    sortBy,
    controls.getByRole('button', { name: 'Map based' }),
  ]) {
    const box = await control.boundingBox()
    expect(box.x).toBeGreaterThanOrEqual(frame.x - 1)
    expect(box.x + box.width).toBeLessThanOrEqual(frame.x + frame.width + 1)
    expect(box.y + box.height).toBeLessThanOrEqual(frame.y + frame.height + 1)
  }
  await header.screenshot({
    path: join(process.env.DEV_RUNNER_ARTIFACTS, 'location-view-header-narrow.png'),
  })
  await view.evaluate(section => section.style.removeProperty('max-width'))
  await groupBy.selectOption('street')
  await sortBy.selectOption('number-asc')
  // The session editor scrolls inside its own panel. Fit the list before capturing it.
  await page.setViewportSize({
    width: 1440,
    height: Math.ceil((await list.boundingBox()).height) + 600,
  })
  await list.screenshot({
    path: join(process.env.DEV_RUNNER_ARTIFACTS, 'included-location-streets.png'),
  })
  await page.setViewportSize(viewport)
  const building = street.getByRole('link', { name: 'Luen Fat Building' })
  const detail = new URL(await building.getAttribute('href'), page.url())
  await building.click()
  await expect(page).toHaveURL(
    url => decodeURIComponent(url.pathname) === decodeURIComponent(detail.pathname),
    { timeout: 60_000 },
  )
})
