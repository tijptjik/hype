// PLAYWRIGHT
import { chromium, expect } from '@playwright/test'
// NODE
import { writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import sharp from 'sharp'
const kitRequire = createRequire(import.meta.resolve('@sveltejs/kit/package.json'))
const { parse, stringify } = await import(kitRequire.resolve('devalue'))
const origin = process.env.PLAYWRIGHT_BASE_URL
const artifacts = process.env.DEV_RUNNER_ARTIFACTS
const placement = process.env.DEV_RUNNER_CHROME_CLASS
if (!origin || !artifacts || !placement)
  throw new Error('Use dev-remote --port 4173 chrome')
const browser = await chromium.launch({
  channel: 'chrome',
  headless: false,
  args: ['--disable-web-security', '--ozone-platform=x11', `--class=${placement}`],
})
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  let preparationRequests = 0
  let searchRequests = 0
  let fixtureCoordinates: number[] = []
  page.on('request', request => {
    if (request.url().includes('/getFeatureLocationSearchDetails?'))
      preparationRequests++
  })
  const fixture = process.env.RECONCILIATION_FIXTURE === '1'
  let fixtureFacts: Record<string, unknown> | undefined
  let unavailableSaved = false
  let unavailableAttempts = 0
  if (fixture) {
    // Queue reads and authentication are real; unavailable writes are simulated so real shops stay untouched.
    await page.route('**/remote/**/getLocationReconciliation?*', async route => {
      const response = await route.fetch()
      const body = await response.json()
      if (body.data) {
        const data = parse(body.data)
        fixtureCoordinates = data._?.item?.geometry?.coordinates ?? fixtureCoordinates
      }
      if (unavailableSaved && body.data) {
        const data = parse(body.data)
        if (data._?.counts) {
          data._.counts.unavailable++
          data._.counts.remaining--
          body.data = stringify(data)
        }
      }
      await route.fulfill({ response, json: body })
    })
    await page.route('**/remote/**/markReconciliationUnavailable', async route => {
      unavailableAttempts++
      if (unavailableAttempts === 1) {
        await route.fulfill({
          status: 409,
          json: { type: 'error', error: { message: 'Controlled stale association' } },
        })
        return
      }
      unavailableSaved = true
      await route.fulfill({
        json: {
          type: 'result',
          data: stringify({
            _: { lastManualMatchAttemptAt: '2026-11-14T00:00:00.000Z' },
          }),
        },
      })
    })
    await page.route('**/remote/**/searchDraftLocations?*', async route => {
      searchRequests++
      const payload = new URL(route.request().url()).searchParams.get('payload')
      if (!payload) throw new Error('Missing remote search payload')
      const input = parse(Buffer.from(payload, 'base64url').toString(), {
        __skrao: (value: unknown) => value,
      })
      expect(input.near).toBeUndefined()
      fixtureFacts = {
        names: { en: 'Arome fixture bakery' },
        phoneNumber: [],
        brands: [],
        location: {
          geometry: { type: 'Point', coordinates: fixtureCoordinates },
          address: {
            status: 'unresolved',
            address2dId: null,
            address3dId: null,
            address3dUnitId: null,
            snapshotId: null,
            rawSource: {},
            fallbackDisplay: { en: 'Controlled browser fixture' },
          },
        },
      }
      const rows = input.q.startsWith('NoSuch')
        ? []
        : [
            {
              id: 'reconciliation-ui-fixture',
              resourceReleaseId: 'fixture-release',
              facts: fixtureFacts,
            },
          ]
      await route.fulfill({
        json: {
          type: 'result',
          data: stringify({
            _: { rows, nextCursor: null, partial: false, total: rows.length },
          }),
        },
      })
    })
    await page.route('**/remote/**/getFeatureLocationSearchDetails?*', route =>
      route.fulfill({
        json: {
          type: 'result',
          data: stringify({ _: { facts: fixtureFacts } }),
        },
      }),
    )
    // Never let a fixture identity reach a database mutation.
    await page.route(
      /\/remote\/[^/]+\/(acceptLocationIdentityReview|importFeatureLocationCandidate|linkFeatureLocation|relinkFeatureLocation|acceptReconciliationMatch)$/,
      route => route.abort(),
    )
  }
  const errors: string[] = []
  page.on('pageerror', e => errors.push(e.message))
  await page.goto(`${origin}/admin`, { waitUntil: 'load', timeout: 120000 })
  expect(
    (await (await page.request.get(`${origin}/api/auth/get-session`)).json())?.user?.id,
  ).toBe('hype-local-agent-admin')
  expect(new URL(page.url()).pathname).toMatch(/^\/admin/)
  await page.goto(`${origin}/admin/projects/breadline`, {
    waitUntil: 'load',
    timeout: 120000,
  })
  await page
    .getByRole('banner')
    .getByRole('button', { name: 'Breadline actions', exact: true })
    .click()
  await page.getByRole('menuitem', { name: 'Match locations', exact: true }).click()
  await expect(page).toHaveURL(/\/match-locations/)
  await page.goto(
    `${origin}/admin/projects/breadline/match-locations?feature=blD9f1f9dce3`,
    { waitUntil: 'load', timeout: 120000 },
  )
  const filters = page.getByRole('group', {
    name: 'Location matching filters',
    exact: true,
  })
  try {
    await expect(filters).toBeVisible({ timeout: 120000 })
    const search = filters.getByRole('searchbox', {
      name: 'Search locations',
      exact: true,
    })
    await expect(search).not.toHaveValue('', { timeout: 120000 })
    await expect(filters.getByRole('slider')).toHaveValue('50')
    await expect(
      page.getByRole('region', { name: 'Reconciliation progress' }),
    ).toContainText(/\d+\s*\/\s*\d+ reviewed/)
    await page.screenshot({ path: `${artifacts}/reconciliation-1440.png` })
    const source = filters.getByRole('combobox', { name: 'Search source' })
    await expect(source).toHaveJSProperty('tagName', 'BUTTON')
    await source.click()
    await page.getByRole('option', { name: 'Feature name', exact: true }).click()
    await expect(search).toHaveValue('Arome - Golden Centre')
    await source.click()
    await page.getByRole('option', { name: 'Brand', exact: true }).click()
    await expect(search).toHaveValue(/Arome|AROME|東海堂/i)
    await filters.getByRole('slider').fill('100')
    await expect(filters.getByRole('slider')).toHaveValue('100')
    await search.fill('NoSuchBakeryReconciliationTest')
    await expect(
      page.getByText('No matches within 100 m. Try another name or a larger radius.'),
    ).toBeVisible({ timeout: 60000 })
    await expect(
      page.getByRole('region', { name: 'Selected upstream Location' }),
    ).toHaveCount(0)
    await expect(
      page.getByRole('button', { name: 'Link Location', exact: true }),
    ).toBeVisible()
    await expect(
      page.getByRole('button', { name: 'Link Location', exact: true }),
    ).toBeDisabled()
    await search.fill('Arome')
    await expect(
      page.getByRole('button', { name: /Arome|東海堂/i }).first(),
    ).toBeVisible({ timeout: 60000 })
    await page
      .getByRole('button', { name: /Arome|東海堂/i })
      .first()
      .click()
    await expect(
      page.getByRole('region', { name: 'Selected upstream Location' }),
    ).toBeVisible({ timeout: 60000 })
    await expect(
      page.getByRole('button', { name: 'Link Location', exact: true }),
    ).toBeEnabled({ timeout: 60000 })
    await expect(
      page.getByRole('region', { name: 'Feature details', exact: true }),
    ).toBeVisible()
    await expect(
      page
        .getByRole('banner')
        .getByRole('button', { name: 'Link Location', exact: true }),
    ).toBeVisible()
    await expect(
      page.getByRole('button', { name: 'Delete feature', exact: true }),
    ).toHaveCount(0)
    await page.screenshot({ path: `${artifacts}/reconciliation-details.png` })
    if (fixture) {
      const beforeRadius = searchRequests
      await filters.getByRole('slider').fill('200')
      await expect(
        page.getByRole('button', { name: /Arome fixture bakery.*m/ }).first(),
      ).toBeVisible()
      await page.waitForTimeout(800)
      expect(searchRequests).toBe(beforeRadius)
      await filters.getByRole('slider').fill('100')
      await page.waitForTimeout(800)
      await expect(
        page.getByRole('button', { name: 'Link Location', exact: true }),
      ).toBeEnabled()
    }

    if (fixture) {
      await page.getByRole('button', { name: 'Expand review', exact: true }).click()
      await page.getByRole('button', { name: 'Show map', exact: true }).click()
      // Coincident Feature/candidate pins must expand and remain selectable on the canvas.
      const map = page.locator('[data-brand-location-map]')
      const box = await map.boundingBox()
      if (!box) throw new Error('Map has no bounds')
      const before = preparationRequests
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
      let marker: { x: number; y: number } | undefined
      await expect
        .poll(
          async () => {
            const { data, info } = await sharp(await map.screenshot())
              .ensureAlpha()
              .raw()
              .toBuffer({ resolveWithObject: true })
            let sumX = 0,
              sumY = 0,
              pixels = 0
            for (
              let y = Math.floor(info.height / 2 - 85);
              y < info.height / 2 + 85;
              y++
            ) {
              for (
                let x = Math.floor(info.width / 2 - 85);
                x < info.width / 2 + 85;
                x++
              ) {
                const pixel = (y * info.width + x) * 4
                if (
                  // Ignore the original coincident marker beneath the expanded pair.
                  Math.abs(x - info.width / 2) > 25 &&
                  data[pixel] < 20 &&
                  data[pixel + 1] > 165 &&
                  data[pixel + 1] < 200 &&
                  data[pixel + 2] > 85 &&
                  data[pixel + 2] < 125
                ) {
                  sumX += x
                  sumY += y
                  pixels++
                }
              }
            }
            if (!pixels) return false
            marker = { x: box.x + sumX / pixels, y: box.y + sumY / pixels }
            return true
          },
          { timeout: 15000 },
        )
        .toBe(true)
      if (!marker) throw new Error('Expanded upstream marker was not found')
      const target = marker
      await expect
        .poll(async () => {
          await page.mouse.move(target.x + 1, target.y)
          await page.mouse.move(target.x, target.y)
          return map.locator('canvas').getAttribute('title')
        })
        .toBe('Arome fixture bakery')
      await page.mouse.click(marker.x, marker.y)
      await expect.poll(() => preparationRequests).toBeGreaterThan(before)
      await expect(
        page.getByRole('button', { name: 'Link Location', exact: true }),
      ).toBeEnabled()
    }
    await page.getByRole('button', { name: 'Skip for now', exact: true }).click()
    await expect(page).not.toHaveURL(/feature=blD9f1f9dce3/)
    await page.getByRole('button', { name: 'Previous', exact: true }).click()
    await expect(page).toHaveURL(/feature=blD9f1f9dce3/)
    await expect(filters.getByRole('slider')).toHaveValue('100')
    await page.reload({ waitUntil: 'load' })
    await expect(page.getByRole('slider')).toHaveValue('100', { timeout: 60000 })
    await page.setViewportSize({ width: 1200, height: 900 })
    await expect(
      page.getByRole('group', { name: 'Location matching filters', exact: true }),
    ).toBeVisible()
    await expect(
      page.getByRole('button', { name: 'Link Location', exact: true }),
    ).toBeEnabled({ timeout: 60000 })
    await page
      .getByRole('button', { name: 'Link Location', exact: true })
      .click({ trial: true })
    await page
      .getByRole('button', { name: 'Reset filters', exact: true })
      .click({ trial: true })
    await source.click()
    await page.getByRole('option', { name: 'Feature name', exact: true }).click()
    await expect(search).toHaveValue('Arome - Golden Centre')
    await expect(
      page.getByRole('button', { name: 'Link Location', exact: true }),
    ).toBeEnabled()
    await page.screenshot({ path: `${artifacts}/reconciliation-1200.png` })
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    ).toBe(true)
    if (fixture) {
      const unavailable = page.getByRole('button', {
        name: 'Location unavailable',
        exact: true,
      })
      const progress = page.getByRole('region', { name: 'Reconciliation progress' })
      const initialUnavailable = Number(
        (await progress.textContent())?.match(/(\d+)\s+unavailable/)?.[1],
      )
      expect(Number.isFinite(initialUnavailable)).toBe(true)
      const currentUrl = page.url()
      await unavailable.click()
      await expect(page.getByRole('alert')).toContainText(
        'Could not mark this Location as unavailable',
      )
      expect(page.url()).toBe(currentUrl)
      await expect(progress).toContainText(`${initialUnavailable} unavailable`)
      await unavailable.click()
      await expect(page).not.toHaveURL(currentUrl)
      await expect(progress).toContainText(`${initialUnavailable + 1} unavailable`)
      await page.reload({ waitUntil: 'load' })
      await expect(progress).toContainText(`${initialUnavailable + 1} unavailable`, {
        timeout: 60000,
      })
      await page.screenshot({ path: `${artifacts}/reconciliation-unavailable.png` })
      expect(unavailableAttempts).toBe(2)
    }
    if (fixture) {
      let resetCalls = 0
      await page.route('**/remote/**/getUnavailableReconciliation?*', route =>
        route.fulfill({
          json: {
            type: 'result',
            data: stringify({
              _: resetCalls
                ? []
                : [
                    {
                      id: 'reset-feature',
                      name: 'Unavailable fixture',
                      address: 'Fixture address',
                      locationId: 'reset-location',
                      lastManualMatchAttemptAt: '2026-11-13T10:00:00.000Z',
                    },
                    {
                      id: 'reset-feature-two',
                      name: 'Another unavailable fixture',
                      address: 'Zoo Road',
                      locationId: 'reset-location-two',
                      lastManualMatchAttemptAt: '2026-11-14T10:00:00.000Z',
                    },
                  ],
            }),
          },
        }),
      )
      await page.route('**/remote/**/resetReconciliationUnavailable', route => {
        resetCalls++
        return route.fulfill({
          json: { type: 'result', data: stringify({ _: { id: 'reset-location' } }) },
        })
      })
      await progress.getByRole('button', { name: /unavailable/ }).click()
      const list = page.getByRole('region', {
        name: 'Accepted as unavailable',
        exact: true,
      })
      await expect(list.getByText('Unavailable fixture', { exact: true })).toBeVisible()
      await expect(filters).toHaveCount(0)
      await expect(list.locator('time').first()).toHaveAttribute(
        'datetime',
        '2026-11-14T10:00:00.000Z',
      )
      await list.getByRole('button', { name: 'Sort', exact: true }).click()
      const sortField = list.getByRole('combobox', { name: 'Field', exact: true })
      await sortField.click()
      await page
        .getByRole('option', { name: 'Date marked unavailable', exact: true })
        .click()
      await expect(list.locator('time').first()).toHaveAttribute(
        'datetime',
        '2026-11-13T10:00:00.000Z',
      )
      await list.getByRole('button', { name: 'asc', exact: true }).click()
      await expect(list.locator('time').first()).toHaveAttribute(
        'datetime',
        '2026-11-14T10:00:00.000Z',
      )
      await list.getByRole('button', { name: 'desc', exact: true }).click()
      await sortField.click()
      await page.getByRole('option', { name: 'Address', exact: true }).click()
      await expect(list.locator('time').first()).toHaveAttribute(
        'datetime',
        '2026-11-13T10:00:00.000Z',
      )
      await list.getByRole('button', { name: 'Reset', exact: true }).first().click()
      await expect(list).toContainText('No locations accepted as unavailable.')
      expect(resetCalls).toBe(1)
      await list.getByRole('button', { name: 'Back to matching' }).click()
      await expect(filters).toBeVisible()
    }
    if (fixture) {
      // Exercise failed and successful deletes without archiving local user data.
      let deleteAttempts = 0
      await page.route('**/remote/**/archiveFeature', async route => {
        deleteAttempts++
        if (deleteAttempts === 1) {
          await route.fulfill({
            status: 409,
            json: { type: 'error', error: { message: 'Controlled delete failure' } },
          })
          return
        }
        await route.fulfill({
          json: {
            type: 'result',
            data: stringify({ _: { data: { isArchived: true } } }),
          },
        })
      })
      const deleteButton = page.getByRole('menuitem', {
        name: 'Delete feature',
        exact: true,
      })
      const beforeDelete = page.url()
      await page
        .getByRole('banner')
        .getByRole('button', { name: / actions$/ })
        .click()
      await deleteButton.click()
      await expect(page.getByRole('alert')).toContainText(
        'Could not delete this Feature',
      )
      expect(page.url()).toBe(beforeDelete)
      await page
        .getByRole('banner')
        .getByRole('button', { name: / actions$/ })
        .click()
      await deleteButton.click()
      await expect(page).not.toHaveURL(beforeDelete)
      expect(deleteAttempts).toBe(2)
    }
    if (fixture) {
      let linkedFeature = false
      await page.route('**/remote/**/importFeatureLocationCandidate', route =>
        route.fulfill({
          json: {
            type: 'result',
            data: stringify({
              _: {
                locationId: 'selected-source-location',
                revisionId: 'source-revision',
              },
            }),
          },
        }),
      )
      await page.route('**/remote/**/acceptReconciliationMatch', async route => {
        const input = parse(route.request().postData() || '', {
          __skrao: (value: unknown) => value,
        })
        expect(input.locationId).toBe('selected-source-location')
        expect(input.expectedRevision).toBeTruthy()
        linkedFeature = true
        await route.fulfill({
          json: {
            type: 'result',
            data: stringify({ _: { status: 'linked', revision: 'new-association' } }),
          },
        })
      })
      await page.goto(
        `${origin}/admin/projects/breadline/match-locations?feature=blD9f1f9dce3`,
        { waitUntil: 'load', timeout: 120000 },
      )
      await filters
        .getByRole('searchbox', { name: 'Search locations', exact: true })
        .fill('Arome')
      const current = page.url()
      await expect(
        page.getByRole('button', { name: 'Link Location', exact: true }),
      ).toBeEnabled()
      await page.getByRole('button', { name: 'Link Location', exact: true }).click()
      await expect(page).not.toHaveURL(current)
      expect(linkedFeature).toBe(true)
      await expect(
        page.getByText('Review source identity', { exact: true }),
      ).toHaveCount(0)
    }
    expect(errors).toEqual([])
  } finally {
    await writeFile(
      `${artifacts}/reconciliation-mode.json`,
      JSON.stringify({
        source: fixture
          ? 'controlled provider fixture; no acceptance writes'
          : 'live upstream',
      }),
    )
    await writeFile(
      `${artifacts}/reconciliation-errors.json`,
      JSON.stringify(errors, null, 2),
    )
    await writeFile(
      `${artifacts}/reconciliation-dom.txt`,
      await page.locator('body').innerText(),
    )
    await page.screenshot({ path: `${artifacts}/reconciliation-final.png` })
  }
} finally {
  await browser.close()
}
