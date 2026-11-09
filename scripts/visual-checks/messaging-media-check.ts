// NODE
import { readFile, mkdir } from 'node:fs/promises'
// BROWSER CHECKS
import { browserCases } from './lib/browser-cases'

// Synthetic fixtures exercise the real composer/timeline; no provider receives messages.
await mkdir('output/playwright', { recursive: true })
for await (const { name, browser } of browserCases()) {
  for (const width of [1100, 360]) {
    const page = await browser.newPage({ viewport: { width, height: 800 } })
    await page.addInitScript(() => {
      const counts = { started: 0, ready: 0, failed: 0 }
      Object.assign(window, { mediaTransitions: counts })
      if (document.startViewTransition) {
        const start = document.startViewTransition.bind(document)
        document.startViewTransition = ((callback: () => Promise<void>) => {
          counts.started++
          const transition = start(callback)
          void transition.ready.then(
            () => {
              counts.ready++
            },
            () => {
              counts.failed++
            },
          )
          return transition
        }) as typeof document.startViewTransition
      }
    })
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    await page.route('**/__media-fixture.*', async route => {
      const ext = new URL(route.request().url()).pathname.split('.').pop()
      await route.fulfill({
        contentType: ext === 'webp' ? 'image/webp' : `video/${ext}`,
        body: await readFile(`/tmp/hype-media-fixtures/media.${ext}`),
      })
    })
    await page.route('**/__media-picker.html', route =>
      route.fulfill({
        contentType: 'text/html',
        body: '<html data-theme="breadline-light"><head><meta name="viewport" content="width=device-width, initial-scale=1"><script>globalThis.__sveltekit_dev={env:{}}</script></head><body><main style="max-width:48rem;margin:2rem auto"><h1>Telegram media picker</h1><div id="app"></div></main><script type="module" src="/src/tests/fixtures/mediaPickerCheck.ts"></script></body></html>',
      }),
    )
    await page.goto('http://127.0.0.1:4173/__media-picker.html')
    await page.getByText('Connected', { exact: true }).waitFor()
    await page.getByRole('button', { name: 'Attach files', exact: true }).click()
    await page.getByRole('menuitem', { name: 'GIFs', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'GIF and sticker picker' })
    await dialog.getByRole('region', { name: 'Loading results' }).first().waitFor()
    await page.screenshot({
      path: `output/playwright/${name}-media-skeleton-${width}.png`,
    })
    await page.waitForFunction(() => {
      const video = document.querySelector('dialog video')
      return video instanceof HTMLVideoElement && video.currentTime > 0
    })
    await dialog.getByRole('button', { name: 'Close picker' }).click()
    await page.getByRole('button', { name: 'Attach files', exact: true }).click()
    await page.getByRole('menuitem', { name: 'GIFs', exact: true }).click()
    await dialog.getByRole('button', { name: 'Send A colourful celebration' }).waitFor()
    // Holding previews media without triggering the normal instant-send action.
    const previewTile = dialog.getByRole('button', {
      name: 'Send A colourful celebration',
    })
    await previewTile.hover()
    await page.mouse.down()
    await page.waitForTimeout(800)
    await page.mouse.up()
    await dialog.getByRole('region', { name: 'Media preview' }).waitFor()
    await page.screenshot({
      path: `output/playwright/${name}-gif-lightbox-${width}.png`,
    })
    const previewEvents = await page.evaluate(
      () => (window as unknown as { mediaFixtureEvents: string[] }).mediaFixtureEvents,
    )
    if (previewEvents.some(event => event.startsWith('send:')))
      throw new Error('Long press sent media')
    await page.keyboard.press('Escape')
    await dialog
      .getByRole('region', { name: 'Media preview' })
      .waitFor({ state: 'hidden' })
    await page.waitForTimeout(300)

    let events = await page.evaluate(
      () => (window as unknown as { mediaFixtureEvents: string[] }).mediaFixtureEvents,
    )
    if (events.filter(event => event.startsWith('preview:gif')).length !== 1)
      throw new Error('Reopening downloaded a GIF again')
    await dialog.getByRole('button', { name: 'Send A colourful celebration' }).click()
    await dialog.waitFor({ state: 'hidden' })
    await page.getByRole('img', { name: 'Sending', exact: true }).waitFor()
    await page.screenshot({
      path: `output/playwright/${name}-media-sending-${width}.png`,
    })
    await page
      .getByRole('img', { name: 'Sent to Telegram cloud', exact: true })
      .waitFor()
    const transitions = await page.evaluate(
      () =>
        (
          window as unknown as {
            mediaTransitions: { started: number; ready: number; failed: number }
          }
        ).mediaTransitions,
    )
    if (transitions.started && (!transitions.ready || transitions.failed))
      throw new Error('View Transition did not capture the optimistic message')
    if (await page.locator('[data-catalog-send]').count())
      throw new Error('Optimistic message was not reconciled')
    events = await page.evaluate(
      () => (window as unknown as { mediaFixtureEvents: string[] }).mediaFixtureEvents,
    )
    if (events.filter(event => event.startsWith('send:')).length !== 1)
      throw new Error('Selection did not send exactly once')
    await page.getByRole('button', { name: 'Attach files', exact: true }).click()
    await page.getByRole('menuitem', { name: 'Stickers', exact: true }).click()
    await dialog.getByRole('button', { name: 'Celebrations' }).click()
    await dialog
      .getByRole('button', { name: 'Send Animated celebration' })
      .locator('svg')
      .waitFor()
    await page.waitForFunction(() => {
      const image = document.querySelector('dialog img')
      const video = document.querySelector('dialog video')
      return (
        image instanceof HTMLImageElement &&
        image.naturalWidth > 0 &&
        video instanceof HTMLVideoElement &&
        video.currentTime > 0
      )
    })
    await dialog.getByRole('button', { name: 'Save offline' }).click()
    await dialog.getByText('3 stickers saved on this device').waitFor()
    const geometry = await dialog.evaluate(element => ({
      width: element.getBoundingClientRect().width,
      overflow: element.scrollWidth > element.clientWidth,
      height: element.getBoundingClientRect().height,
    }))
    if (geometry.width > width || geometry.height > 800 || geometry.overflow)
      throw new Error(`${name} picker overflows at ${width}px`)
    await page.screenshot({
      path: `output/playwright/${name}-media-picker-${width}.png`,
    })
    await page.reload()
    await page.getByText('Connected', { exact: true }).waitFor()
    console.log(`${name} ${width}px: checking offline pack after reload`)
    await page.context().setOffline(true)
    await page.getByRole('button', { name: 'Attach files', exact: true }).click()
    await page.getByRole('menuitem', { name: 'Stickers', exact: true }).click()
    await dialog.getByRole('button', { name: 'Celebrations' }).click()
    await dialog
      .getByRole('button', { name: 'Send Animated celebration' })
      .locator('svg')
      .waitFor()
    await page.waitForFunction(() => {
      const image = document.querySelector('dialog img')
      return image instanceof HTMLImageElement && image.naturalWidth > 0
    })
    events = await page.evaluate(
      () => (window as unknown as { mediaFixtureEvents: string[] }).mediaFixtureEvents,
    )
    if (
      events.some(event => event.startsWith('preview:') || event.startsWith('search:'))
    )
      throw new Error('Offline pack attempted another provider download')
    await page.context().setOffline(false)
    await dialog.getByRole('button', { name: 'Send Animated celebration' }).click()
    await dialog.waitFor({ state: 'hidden' })
    await page
      .getByRole('img', { name: 'Sent to Telegram cloud', exact: true })
      .waitFor()
    if (errors.length) throw new Error(errors.join('\n'))
    console.log(
      `${name} ${width}px: skeleton, cached reopen, optimistic instant send, receipt reconciliation, pack download and offline reload passed`,
    )
    await page.close()
  }
}
