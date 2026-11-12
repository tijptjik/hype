import { chromium, firefox } from 'playwright'
const origin = process.argv[2] ?? 'http://127.0.0.1:4183'
for (const [name, engine] of [
  ['chromium', chromium],
  ['firefox', firefox],
] as const) {
  const browser = await engine.launch()
  try {
    for (const width of [1280, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } })
      const errors: string[] = []
      page.on('pageerror', error => errors.push(error.message))
      await page.route('**/src/lib/api/location.remote.ts*', route =>
        route.fulfill({
          contentType: 'text/javascript',
          body: `export async function getFeatureLocationSyncPolicy(){return {source:'organisation',sourceId:'o',layerRelocation:'fixed',policy:{version:1,coordinates:{mode:'withinDistance',maxMetres:25},address:'review',unit:'follow',establishment:'review',relocation:'review',community:{coordinates:{mode:'review'},address:'review',unit:'review',establishment:'review',communications:'follow',relocation:'fixed'}}}}`,
        }),
      )
      await page.route('**/__feature-sync-policy.html', route =>
        route.fulfill({
          contentType: 'text/html',
          body: '<html data-theme="breadline-light"><head><meta name="viewport" content="width=device-width,initial-scale=1"><script>globalThis.__sveltekit_dev={env:{}}</script></head><body class="bits-theme"><div id="app"></div><script type="module" src="/src/tests/fixtures/featureSyncPolicyCheck.ts"></script></body></html>',
        }),
      )
      await page.goto(`${origin}/__feature-sync-policy.html`, { timeout: 60000 })
      await page.getByRole('button', { name: 'Sync policy', exact: true }).click()
      const dialog = page.getByRole('dialog')
      await dialog.getByText('Inherited from Organisation', { exact: true }).waitFor()
      await dialog
        .getByText('Accept moves up to 25 m; review larger moves', { exact: true })
        .waitFor()
      await dialog.getByText('Community', { exact: true }).waitFor()
      if (!(await dialog.getByText(/this Layer setting is not applied/).isVisible()))
        throw Error('Layer setting is misleading')
      if (await dialog.evaluate(node => node.scrollWidth > node.clientWidth + 1))
        throw Error('Dialog overflows')
      await page.screenshot({ path: `/tmp/${name}-sync-policy-${width}.png` })
      await page.getByRole('button', { name: 'Close', exact: true }).click()
      await dialog.waitFor({ state: 'hidden' })
      if (errors.length) throw Error(errors.join('\n'))
      console.log(name, width, 'policy inspection passed')
      await page.close()
    }
  } finally {
    await browser.close()
  }
}
