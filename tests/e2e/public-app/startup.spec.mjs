import { expect, test } from '@playwright/test'

for (const width of [390, 1440]) {
  test.describe(`public app startup at ${width}px`, () => {
    test.use({ viewport: { width, height: 900 } })

    test('waits for browser measurements before drawing controls', async ({
      browser,
      baseURL,
    }) => {
      const context = await browser.newContext({
        baseURL,
        javaScriptEnabled: false,
        viewport: { width, height: 900 },
      })
      try {
        const page = await context.newPage()
        expect((await page.goto('/')).status()).toBe(200)
        await expect(page.locator('html')).toHaveAttribute('data-entry', 'map')
        await expect(
          page.locator(
            '#omni-search-bar, [data-app-intro-item="nav"], [data-map-shell-skeleton]',
          ),
        ).toHaveCount(0)
      } finally {
        await context.close()
      }
    })

    test('draws the correct first layout and accepts input during guest sign-in', async ({
      page,
    }, testInfo) => {
      const errors = []
      page.on('pageerror', error => errors.push(error.message))
      let release
      const gate = new Promise(resolve => {
        release = resolve
      })
      await page.route('**/api/auth/sign-in/anonymous', async route => {
        await gate
        await route.continue()
      })
      const signingIn = page.waitForRequest('**/api/auth/sign-in/anonymous')
      await page.addInitScript(() => {
        localStorage.setItem('hype-theme', 'hype-light')
        window.canvasFrames = []
        function sample() {
          const root = document.documentElement
          if (root?.dataset.entry === 'map')
            window.canvasFrames.push(getComputedStyle(root).backgroundColor)
          const input = document
            .querySelector('#omni-search-bar')
            ?.getBoundingClientRect()
          const search = document.querySelector('[data-app-intro-item="search"]')
          const nav = document.querySelector('[data-app-intro-item="nav"]')
          if (input?.width && search && nav) {
            // Measure the responsive layout independently of entrance translations.
            window.firstControls ??= {
              width: input.width,
              top: parseFloat(getComputedStyle(search).marginTop),
              bottomGutter: parseFloat(getComputedStyle(nav).bottom),
            }
          }
          if (!window.firstControls || performance.now() < 5000)
            requestAnimationFrame(sample)
        }
        requestAnimationFrame(sample)
      })
      try {
        await page.goto('/', { waitUntil: 'domcontentloaded' })
        await signingIn
        await page.waitForFunction(() => Boolean(window.firstControls))
        const first = await page.evaluate(() => window.firstControls)
        if (width >= 768) {
          expect(first.width).toBeLessThan(width / 2)
        } else {
          expect(first.width).toBeGreaterThan(width * 0.85)
        }
        // Check final placement after the bars finish their vertical entrance.
        await expect(page.locator('[data-app-intro-item="nav"]')).toHaveCSS(
          'translate',
          'none',
        )
        const settled = await page.evaluate(() => ({
          top: document.querySelector('#omni-search-bar').getBoundingClientRect().top,
          bottomGutter:
            innerHeight -
            document
              .querySelector('[data-app-intro-item="nav"]')
              .getBoundingClientRect().bottom,
        }))
        if (width >= 768) {
          expect(settled.top).toBeGreaterThan(10)
          expect(settled.bottomGutter).toBeGreaterThan(10)
        } else {
          expect(settled.top).toBeLessThan(10)
          expect(settled.bottomGutter).toBeLessThan(5)
        }
        await page.screenshot({ path: testInfo.outputPath('first-controls.png') })
        const search = page.locator('#omni-search-bar')
        await search.fill('Kennedy')
        await expect(page.locator('[data-omni-tray]')).toBeVisible()
        const settings = page.getByRole('button', { name: 'Settings', exact: true })
        await settings.click()
        await expect(page).toHaveURL(/[?&]panel=settings/)
        await expect(page.getByRole('heading', { name: 'Settings' })).toHaveCount(0)
        await expect(page.getByRole('status', { name: 'Loading panel' })).toHaveCount(0)
        await expect(page.locator('.maplibregl-canvas')).toHaveCount(0)
        await expect(page.locator('html')).toHaveCSS(
          'background-color',
          'rgb(245, 243, 250)',
        )
        const colors = await page.evaluate(() => [...new Set(window.canvasFrames)])
        expect(colors.length).toBeGreaterThan(2)
        release()
        await expect(page.locator('#right-panel fieldset').first()).toBeAttached({
          timeout: 30000,
        })
        await page.getByRole('button', { name: 'Close panel' }).click()
        await expect(page.locator('[data-map-visual-ready="true"]')).toBeVisible({
          timeout: 60000,
        })
        console.log(JSON.stringify({ width, first, errors }))
        expect(errors).toEqual([])
      } finally {
        release()
      }
    })
  })
}

test('preloads Settings on focus and opens only the real panel', async ({ page }) => {
  let release
  const gate = new Promise(resolve => {
    release = resolve
  })
  await page.goto('/')
  await expect(page.locator('[data-map-visual-ready="true"]')).toBeVisible({
    timeout: 60000,
  })
  const settings = page.getByRole('button', { name: 'Settings', exact: true })
  const close = page.getByRole('button', { name: 'Close panel' })
  let held = 0
  const panelModule = url =>
    url.pathname.endsWith('/SettingsPanel.svelte') ||
    /^\/_app\/immutable\/chunks\/[^/]+\.js$/.test(url.pathname)
  await page.route(
    panelModule,
    async route => {
      held++
      await gate
      await route.continue()
    },
    { times: 1 },
  )
  try {
    await settings.focus()
    await expect.poll(() => held).toBe(1)
    await expect(page).not.toHaveURL(/[?&]panel=settings/)
    await settings.click()
    await expect(page).toHaveURL(/[?&]panel=settings/)
    await expect(close).toHaveCount(0)
    await expect(page.getByRole('status', { name: 'Loading panel' })).toHaveCount(0)
    await settings.click()
    await expect(page).not.toHaveURL(/[?&]panel=settings/)
    release()
    await expect(close).toHaveCount(0)
    await settings.click()
    await expect(page.locator('#right-panel fieldset').first()).toBeAttached({
      timeout: 30000,
    })
    await close.click()
    await expect(close).toHaveCount(0)
  } finally {
    release()
  }
})
