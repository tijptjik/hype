// Run with dev-check bun scripts/visual-checks/messaging-settings-layout-check.ts against a local app on port 4173.
// NODE
import { readFile, mkdir } from 'node:fs/promises'
import { createMessagingMediaFixtures } from './messaging-media-fixtures'
// BROWSER CHECKS
import { browserCases } from './lib/browser-cases'

const mediaDirectory = await createMessagingMediaFixtures()
await mkdir('output/playwright', { recursive: true })
for await (const { name, browser } of browserCases()) {
  for (const width of [1100, 360]) {
    const page = await browser.newPage({ viewport: { width, height: 650 } })
    // Enable only this synthetic page's providers; preview's real integrations stay suspended.
    await page.route('**/src/lib/messaging/integrations.ts*', route =>
      route.fulfill({
        contentType: 'text/javascript',
        body: 'export const messagingIntegrations = { telegram: true, whatsapp: true };',
      }),
    )
    page.setDefaultTimeout(15_000)
    const errors: string[] = []
    page.on('pageerror', error => {
      errors.push(error.message)
      console.error(error.message)
    })
    await page.route('**/__appearance.html', route =>
      route.fulfill({
        contentType: 'text/html',
        body: '<!doctype html><html data-theme="breadline-light"><head><meta name="viewport" content="width=device-width,initial-scale=1"><script>globalThis.__sveltekit_dev={env:{}}</script></head><body><main style="max-width:48rem;margin:1rem auto"><div id="app"></div></main><script type="module" src="/src/tests/fixtures/messagingAppearanceCheck.ts"></script></body></html>',
      }),
    )
    await page.goto('http://127.0.0.1:4173/__appearance.html')
    const background = page.getByRole('combobox', {
      name: 'Background image',
      exact: true,
    })
    await background.click()
    await page.getByRole('option', { name: 'Toastie & friends', exact: true }).click()
    const preview = page.getByLabel('Chat background preview')
    if (
      !(await preview.evaluate(element =>
        getComputedStyle(element)
          .getPropertyValue('--chat-background-image')
          .includes('toastie-and-friends-staggered.svg'),
      ))
    )
      throw new Error('Preset did not preview')
    await page.getByLabel('Choose chat background').setInputFiles({
      name: 'tile.webp',
      mimeType: 'image/webp',
      buffer: await readFile(`${mediaDirectory}/media.webp`),
    })
    await page.waitForFunction(() =>
      getComputedStyle(
        document.querySelector('[aria-label="Chat background preview"]')!,
      )
        .getPropertyValue('--chat-background-image')
        .includes('data:image/webp'),
    )
    await background.click()
    await page.getByRole('option', { name: 'No background', exact: true }).click()
    if (
      await preview.evaluate(
        element =>
          getComputedStyle(element)
            .getPropertyValue('--chat-background-image')
            .trim() !== 'none',
      )
    )
      throw new Error('Background reset failed')
    // The organisation form owns persistence; this fixture verifies local draft changes only.
    await page.screenshot({
      path: `output/playwright/${name}-chat-background-${width}.png`,
    })
    await page.route('**/__media-fixture.*', async route => {
      const ext = new URL(route.request().url()).pathname.split('.').pop()
      await route.fulfill({
        contentType: ext === 'webp' ? 'image/webp' : `video/${ext}`,
        body: await readFile(`${mediaDirectory}/media.${ext}`),
      })
    })
    await page.route('**/__crowded-picker.html*', route =>
      route.fulfill({
        contentType: 'text/html',
        body: '<!doctype html><html data-theme="breadline-light"><head><meta name="viewport" content="width=device-width,initial-scale=1"><script>globalThis.__sveltekit_dev={env:{}}</script></head><body><main><div id="app"></div></main><script type="module" src="/src/tests/fixtures/mediaPickerCheck.ts"></script></body></html>',
      }),
    )
    await page.goto('http://127.0.0.1:4173/__crowded-picker.html?crowded')
    await page.getByText('Connected', { exact: true }).waitFor()
    await page.getByRole('button', { name: 'Attach files', exact: true }).click()
    await page.getByRole('menuitem', { name: 'Stickers', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'GIF and sticker picker' })
    await dialog
      .getByRole('button', {
        name: 'Toastie and friends · Collection 1',
        exact: true,
      })
      .waitFor()
    await page.waitForFunction(
      () =>
        document.querySelectorAll('dialog [data-media-results] button').length >= 36,
    )
    const geometry = await dialog.evaluate(element => {
      const results = element.querySelector('[data-media-results]')!,
        grid = results.querySelector('.grid')!,
        packs = element.querySelector('[aria-label="Sticker packs"]')!
      const upload = [...element.querySelectorAll('button')].find(
        button => button.getAttribute('aria-label') === 'Upload sticker',
      )!
      const cache = element.querySelector('[aria-label="Cache used"]')!
      const rect = element.getBoundingClientRect(),
        u = upload.getBoundingClientRect(),
        c = cache.getBoundingClientRect()
      return {
        columns: getComputedStyle(grid).gridTemplateColumns.split(' ').length,
        scrolls: results.scrollHeight > results.clientHeight,
        footerAligned: Math.abs(u.y + u.height / 2 - c.y - c.height / 2) < 1,
        footerVisible: u.bottom <= rect.bottom && c.bottom <= rect.bottom,
        uploadAtLeft: u.left < rect.left + 24,
        packClipped: [...packs.children].some(
          child =>
            child.getBoundingClientRect().bottom > packs.getBoundingClientRect().bottom,
        ),
        viewportFit: rect.height <= innerHeight && rect.width <= innerWidth,
      }
    })
    if (
      geometry.columns !== (width >= 720 ? 6 : 3) ||
      !geometry.scrolls ||
      !geometry.footerAligned ||
      !geometry.footerVisible ||
      !geometry.uploadAtLeft ||
      geometry.packClipped ||
      !geometry.viewportFit
    )
      throw new Error(`Picker geometry: ${JSON.stringify(geometry)}`)
    await page.screenshot({
      path: `output/playwright/${name}-crowded-sticker-picker-${width}.png`,
    })
    const chooser = page.waitForEvent('filechooser')
    await dialog.getByRole('button', { name: 'Upload sticker', exact: true }).click()
    await chooser
    await dialog.waitFor({ state: 'hidden' })
    if (errors.length) throw new Error(errors.join('\n'))
    console.log(
      `${name} ${width}px: background draft preview/upload/reset and crowded picker ${JSON.stringify(geometry)}`,
    )
    await page.close()
  }
}
