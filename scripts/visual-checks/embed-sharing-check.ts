// NODE
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
// PLAYWRIGHT
import { chromium, firefox } from 'playwright'
const origin = process.env.HYPE_CHECK_ORIGIN ?? 'http://localhost:5175'
const output = '/tmp/hype-embed-check'
await mkdir(output, { recursive: true })
for (const [name, engine] of [
  ['chromium', chromium],
  ['firefox', firefox],
] as const) {
  const browser = await engine.launch({
    headless: true,
    ...(name === 'chromium' ? { args: ['--disable-web-security'] } : {}),
  })
  try {
    const context = await browser.newContext({
      viewport: { width: 1400, height: 1000 },
      reducedMotion: 'reduce',
    })
    const page = await context.newPage()
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    await page.route('**/__embed-share-check.html', route =>
      route.fulfill({
        contentType: 'text/html',
        body: '<html data-theme="hype-light"><head><meta name="viewport" content="width=device-width,initial-scale=1"><script>globalThis.__sveltekit_dev={env:{}}</script></head><body><div id="app"></div><script type="module" src="/src/tests/fixtures/embedShareCheck.ts"></script></body></html>',
      }),
    )
    await page.goto(`${origin}/__embed-share-check.html`)
    await page.getByRole('button', { name: 'Share map', exact: true }).click()
    assert.equal(await page.getByRole('dialog').count(), 0)
    assert.equal(
      await page.getByRole('button', { name: 'Share', exact: true }).count(),
      0,
    )
    assert.equal(
      await page
        .getByRole('button', { name: 'Share map', exact: true })
        .getAttribute('aria-pressed'),
      'true',
    )
    const featureButton = await page
      .getByRole('button', { name: 'Features', exact: true })
      .boundingBox()
    const shareButton = await page
      .getByRole('button', { name: 'Share map', exact: true })
      .boundingBox()
    assert.ok(
      featureButton &&
        shareButton &&
        shareButton.x > featureButton.x &&
        Math.abs(shareButton.y - featureButton.y) < 2,
    )

    const url = page.getByRole('textbox', { name: 'Embed URL', exact: true })
    await page.waitForFunction(() =>
      document
        .querySelector('[aria-label="Embed URL"]')
        ?.textContent?.includes('layers='),
    )
    const initial = new URL((await url.textContent())!.trim())
    assert.equal(initial.searchParams.get('layers'), '-HIXEjblPzoP,RfWMLs_jW6QJ')
    assert.equal(initial.searchParams.get('theme'), 'breadline-light')
    assert.equal(initial.searchParams.get('mapStyle'), 'quercus')
    await page.getByRole('button', { name: 'Replace', exact: true }).click()
    const styleOption = page
      .locator('[data-search-result-variant="visual"]')
      .filter({ hasText: 'hype-dark' })
    await styleOption.waitFor()
    assert.ok(await styleOption.locator('img').count())
    await page.screenshot({ path: `${output}/${name}-style-picker.png` })
    await styleOption.click()
    assert.equal(
      new URL((await url.textContent())!.trim()).searchParams.get('mapStyle'),
      'hype-dark',
    )
    await page.locator('label[data-theme="hype-dark"]').click()
    assert.equal(
      new URL((await url.textContent())!.trim()).searchParams.get('theme'),
      'hype-dark',
    )
    await page
      .getByRole('button', { name: 'Replace', exact: true })
      .scrollIntoViewIfNeeded()
    await page.screenshot({ path: `${output}/${name}-appearance.png` })
    await page
      .getByRole('switch', { name: 'Trees: on by default', exact: true })
      .uncheck()
    assert.equal(
      new URL((await url.textContent())!.trim()).searchParams.get('active'),
      'RfWMLs_jW6QJ',
    )
    assert.equal(await page.getByLabel('Show filters', { exact: true }).count(), 0)
    await page.getByRole('checkbox', { name: 'English', exact: true }).uncheck()
    assert.equal(
      new URL((await url.textContent())!.trim()).searchParams.get('lang'),
      'zh-Hant',
    )
    await page.getByRole('checkbox', { name: '简体中文', exact: true }).uncheck()
    assert.equal(
      await page.getByRole('checkbox', { name: '繁體中文', exact: true }).isDisabled(),
      true,
    )
    await page.getByRole('checkbox', { name: 'English', exact: true }).check()
    await page.getByRole('combobox', { name: 'Primary language', exact: true }).click()
    await page.getByRole('option', { name: 'English', exact: true }).click()
    assert.equal(
      new URL((await url.textContent())!.trim()).searchParams.get('lang'),
      'en',
    )
    await page.frameLocator('iframe').locator('canvas').waitFor()
    assert.equal(
      await page
        .frameLocator('iframe')
        .locator('html')
        .evaluate(() => window.innerWidth),
      1280,
    )
    assert.equal(
      await page
        .frameLocator('iframe')
        .locator('html')
        .evaluate(() => window.innerHeight),
      800,
    )
    await page
      .getByRole('button', { name: 'Desktop', exact: true })
      .scrollIntoViewIfNeeded()
    await page.screenshot({ path: `${output}/${name}-desktop-preview.png` })
    const languageGroup = page.getByRole('group', { name: 'Language', exact: true })
    assert.equal(
      await languageGroup
        .getByRole('group', { name: 'Supported languages', exact: true })
        .count(),
      1,
    )
    assert.equal(
      await languageGroup
        .getByRole('combobox', { name: 'Primary language', exact: true })
        .count(),
      1,
    )
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await page.getByRole('button', { name: 'Mobile', exact: true }).click()
    const previewShell = page.locator('iframe').locator('..')
    assert.equal(
      await previewShell.evaluate(el => getComputedStyle(el).transitionDuration),
      '0.3s',
    )
    await previewShell.evaluate(async el => {
      await Promise.all(el.getAnimations().map(animation => animation.finished))
    })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    assert.equal(
      await previewShell.evaluate(el => getComputedStyle(el).transitionDuration),
      '0s',
    )
    await page.waitForTimeout(1500)
    assert.equal(
      await page
        .frameLocator('iframe')
        .locator('html')
        .evaluate(() => window.innerWidth),
      390,
    )
    assert.equal(
      await page
        .frameLocator('iframe')
        .locator('html')
        .evaluate(() => window.innerHeight),
      844,
    )
    await page.locator('iframe').scrollIntoViewIfNeeded()
    await page.screenshot({ path: `${output}/${name}-builder.png` })
    await page.evaluate(() => {
      ;(window as any).__previewCameras = []
      window.addEventListener('message', event => {
        if (
          event.source === document.querySelector('iframe')?.contentWindow &&
          event.data?.type === 'hype-embed-camera'
        ) {
          ;(window as any).__previewCameras.push(event.data.camera)
        }
      })
    })
    // Capture a deliberate camera change instead of depending on remote tile-load timing.
    const canvas = page.frameLocator('iframe').locator('canvas')
    await canvas.waitFor({ state: 'visible' })
    // Pointer coordinates must use the scaled iframe rectangle in the parent document.
    await page.locator('iframe').scrollIntoViewIfNeeded()
    const bounds = await page.locator('iframe').boundingBox()
    assert.ok(bounds)
    await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2)
    await page.mouse.down()
    await page.mouse.move(
      bounds.x + bounds.width / 2 + 60,
      bounds.y + bounds.height / 2 + 30,
      { steps: 8 },
    )
    await page.mouse.up()
    // Fit must act even while the builder already has automatic fitting selected.
    await page.waitForFunction(() => (window as any).__previewCameras.length > 0)
    const movedCamera = await page.evaluate(() =>
      (window as any).__previewCameras.at(-1),
    )
    await page.evaluate(() => {
      ;(window as any).__previewCameras = []
    })
    await page
      .getByRole('button', { name: 'Fit to active layers', exact: true })
      .click()
    await page.waitForFunction(() => (window as any).__previewCameras.length > 0)
    const fittedCamera = await page.evaluate(() =>
      (window as any).__previewCameras.at(-1),
    )
    assert.notDeepEqual(
      fittedCamera.slice(0, 2),
      movedCamera.slice(0, 2),
      'Fit resets the panned preview without changing the URL',
    )
    assert.equal(fittedCamera[3], 0)
    assert.equal(fittedCamera[4], 0)
    // Right-drag captures a perspective rather than just a flat pan.
    await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2)
    await page.mouse.down({ button: 'right' })
    await page.mouse.move(
      bounds.x + bounds.width / 2 + 45,
      bounds.y + bounds.height / 2 - 65,
      { steps: 10 },
    )
    await page.mouse.up({ button: 'right' })
    const currentView = page.getByRole('button', {
      name: 'Use current view',
      exact: true,
    })
    await page.waitForFunction(() =>
      [...document.querySelectorAll('button')].some(
        button => button.textContent?.trim() === 'Use current view' && !button.disabled,
      ),
    )
    await currentView.click()
    assert.equal(
      new URL((await url.textContent())!.trim()).searchParams.get('view')?.split(',')
        .length,
      5,
    )
    const savedCamera = new URL((await url.textContent())!.trim()).searchParams
      .get('view')!
      .split(',')
      .map(Number)
    assert.ok(savedCamera[3] > 0, 'Tilt was captured')
    assert.ok(Math.abs(savedCamera[4]) > 0, 'Rotation was captured')
    await page
      .getByRole('button', { name: 'Fit to active layers', exact: true })
      .click()
    assert.equal(
      new URL((await url.textContent())!.trim()).searchParams.has('view'),
      false,
    )

    await page
      .getByRole('checkbox', {
        name: 'Independent bookstores with a deliberately long readable label',
        exact: true,
      })
      .uncheck()
    assert.equal(
      new URL((await url.textContent())!.trim()).searchParams.get('active'),
      '-HIXEjblPzoP',
    )
    assert.equal(
      await page
        .getByRole('switch', { name: 'Trees: on by default', exact: true })
        .isDisabled(),
      true,
    )
    assert.equal(
      await page
        .getByRole('switch', { name: 'Trees: on by default', exact: true })
        .isChecked(),
      true,
    )
    const follow = page.getByRole('switch', { name: /Follow this organisation/ })
    const beforeFollow = (await url.textContent())!.trim()
    await follow.check()
    const followingUrl = new URL((await url.textContent())!.trim())
    assert.equal(followingUrl.searchParams.get('organisations'), 'org')
    assert.equal(followingUrl.searchParams.get('exclude'), 'RfWMLs_jW6QJ')
    assert.equal(followingUrl.searchParams.get('active'), '-HIXEjblPzoP')
    assert.equal(
      await page
        .getByRole('checkbox', {
          name: 'Independent bookstores with a deliberately long readable label',
          exact: true,
        })
        .isChecked(),
      false,
    )
    await follow.uncheck()
    assert.equal((await url.textContent())!.trim(), beforeFollow)
    await page.evaluate(() => {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: {
          writeText: async (value: string) => {
            ;(window as unknown as { copiedOutput: string }).copiedOutput = value
          },
        },
      })
    })
    for (const [label, button] of [
      ['Embed URL', 'Copy URL'],
      ['Iframe code', 'Copy iframe code'],
    ]) {
      const output = (await page
        .getByRole('textbox', { name: label, exact: true })
        .textContent())!.trim()
      await page.getByRole('button', { name: button, exact: true }).click()
      assert.equal(
        await page.evaluate(
          () => (window as unknown as { copiedOutput: string }).copiedOutput,
        ),
        output,
      )
    }
    await page.screenshot({ path: `${output}/${name}-code-fields.png` })
    const retainedUrl = (await url.textContent())!.trim()
    await page.getByRole('button', { name: 'Profile', exact: true }).click()
    await page.getByRole('button', { name: 'Share map', exact: true }).click()
    assert.equal((await url.textContent())!.trim(), retainedUrl)
    // Exercise a real cross-origin iframe with storage unavailable and no account cookies.
    const embedded = await context.newPage()
    embedded.on('pageerror', error => errors.push(error.message))
    const auth: string[] = []
    embedded.on('request', request => {
      if (request.url().includes('/api/auth/')) auth.push(request.url())
    })
    await embedded.addInitScript(() => {
      Object.defineProperty(document, 'cookie', { get: () => '', set: () => {} })
      Object.defineProperty(window, 'localStorage', {
        get: () => {
          throw new DOMException('Storage blocked', 'SecurityError')
        },
      })
      Object.defineProperty(window, 'sessionStorage', {
        get: () => {
          throw new DOMException('Storage blocked', 'SecurityError')
        },
      })
    })
    await embedded.route('http://embed-host.test/', route =>
      route.fulfill({
        contentType: 'text/html',
        body: `<iframe title="Test embedded map" src="${origin}/embed?layers=-HIXEjblPzoP,RfWMLs_jW6QJ&active=-HIXEjblPzoP&languages=en,zh-Hant&filters=0" style="width:390px;height:760px"></iframe>`,
      }),
    )
    await embedded.goto('http://embed-host.test/')
    const frame = embedded.frameLocator('iframe')
    // Wait for client hydration before clicking server-rendered navigation.
    await frame.locator('canvas').waitFor({ state: 'visible' })
    const mapBounds = await frame.locator('canvas').boundingBox()
    const iframeBounds = await embedded.locator('iframe').boundingBox()
    assert.ok(mapBounds && iframeBounds)
    assert.ok(
      Math.abs(
        mapBounds.y + mapBounds.height - (iframeBounds.y + iframeBounds.height - 2),
      ) < 4,
    )

    await frame.getByRole('button', { name: 'Maps', exact: true }).click()
    const tree = frame.getByRole('button', { name: 'Trees', exact: true })
    await tree.waitFor().catch(async error => {
      console.error(await frame.locator('body').innerText(), errors)
      await embedded.screenshot({ path: `${output}/${name}-failure.png` })
      throw error
    })
    const mapPanel = frame.locator('#left-panel')
    assert.equal(await mapPanel.getByRole('searchbox').count(), 3)
    // All four section types reuse the regular panel. This scope hides its singleton organisation.
    assert.equal(await mapPanel.locator('[data-resource-section]').count(), 3)
    const placeSearch = mapPanel.getByRole('searchbox', {
      name: 'Search Places',
      exact: true,
    })
    await placeSearch.fill('筲箕灣')
    assert.equal(
      await mapPanel
        .getByRole('button', { name: '深水埗公園細葉榕', exact: true })
        .count(),
      0,
    )
    await placeSearch.fill('')
    await embedded.screenshot({ path: `${output}/${name}-iframe.png` })
    await tree.click()
    await frame.getByText('No places match your selection.', { exact: true }).waitFor()
    assert.equal(await mapPanel.getByRole('searchbox').count(), 3)
    await tree.click()
    await mapPanel
      .getByRole('button', { name: '筲箕灣東大街大葉榕', exact: true })
      .click()
    await frame.getByRole('link', { name: 'Open in Hype', exact: true }).waitFor()
    assert.equal(
      await frame
        .getByRole('button', { name: /sign in|check.in|report|add photo/i })
        .count(),
      0,
    )
    await frame.getByRole('button', { name: 'Close', exact: true }).click()
    await frame.getByRole('button', { name: 'Settings', exact: true }).click()
    const settings = frame.locator('#right-panel')
    assert.equal(await settings.locator('input[type="radio"]').count(), 7)
    await settings.locator('label[data-theme="hype-dark"]').click()
    assert.equal(
      await frame.locator('div[lang][data-theme]').getAttribute('data-theme'),
      'hype-dark',
    )
    assert.equal(await settings.getByText('Map', { exact: true }).count(), 0)
    assert.equal(
      await settings.getByText('Additional languages', { exact: true }).count(),
      0,
    )
    await embedded.screenshot({ path: `${output}/${name}-settings.png` })
    await settings.locator('input[value="zh-hant"]').check()
    await frame.getByRole('button', { name: '設定', exact: true }).waitFor()
    assert.equal(
      await frame.locator('div[lang][data-theme]').getAttribute('lang'),
      'zh-Hant',
    )
    await frame.getByRole('button', { name: '篩選', exact: true }).click()
    assert.ok((await frame.locator('#right-panel input[type="search"]').count()) >= 1)
    await embedded.screenshot({ path: `${output}/${name}-filters.png` })

    assert.equal(auth.length, 0, `Unexpected auth requests: ${auth}`)
    assert.deepEqual(errors, [])
    console.log(
      `${name}: builder, shared searchable panels, theme/language selection and cookie-free cross-origin iframe passed`,
    )
  } finally {
    await browser.close()
  }
}
