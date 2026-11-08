// NODE
import assert from 'node:assert/strict'
import { mkdir, readFile } from 'node:fs/promises'
// PLAYWRIGHT
import { chromium, firefox } from 'playwright'
const origin = process.argv[2] ?? 'http://127.0.0.1:4173'
const directory = 'output/playwright/user-avatar-upload'
await mkdir(directory, { recursive: true })
const serviceSource = await readFile('src/lib/client/services/image.ts', 'utf8')
const serviceStubs = [
  ...serviceSource.matchAll(/^export (?:async )?(?:function|const) (\w+)/gm),
]
  .map(match => match[1])
  .filter(name => !['getImageSrc', 'uploadAndProcessImage'].includes(name))
  .map(name => `export const ${name} = () => null;`)
  .join('\n')
const remoteSource = await readFile('src/lib/api/image.remote.ts', 'utf8')
const remoteStubs = [...remoteSource.matchAll(/^export const (\w+)/gm)]
  .map(match => match[1])
  .filter(name => name !== 'discardImageUpload')
  .map(name => `export const ${name} = async () => null;`)
  .join('\n')

for (const [name, engine] of [
  ['chromium', chromium],
  ['firefox', firefox],
] as const) {
  const browser = await engine.launch({ headless: true })
  try {
    for (const width of [1280, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 640 } })
      const errors: string[] = []
      page.on('pageerror', error => {
        errors.push(error.message)
        console.error(error.message)
      })
      // Render the real control while isolating transfer and attachment from user accounts and storage.
      await page.route('**/src/lib/client/services/image.ts*', route =>
        route.fulfill({
          contentType: 'text/javascript',
          body:
            serviceStubs +
            `
        export const getImageSrc = () => 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="teal"/></svg>';
        export const uploadAndProcessImage = (_file, context) => {
          if (context.attachment !== 'deferred') throw new Error('Expected deferred upload');
          return new Promise(resolve => { globalThis.finishAvatarUpload = () => resolve({image:{id:'verified-image'}}); });
        };`,
        }),
      )
      await page.route('**/src/lib/api/image.remote.ts*', route =>
        route.fulfill({
          contentType: 'text/javascript',
          body:
            remoteStubs +
            `export const discardImageUpload = async ({imageId}) => { globalThis.discardedAvatar = imageId; return {discarded:true}; };`,
        }),
      )
      await page.route('**/__avatar-upload.html', route =>
        route.fulfill({
          contentType: 'text/html',
          body: '<html lang="en" data-theme="breadline-light"><head><meta name="viewport" content="width=device-width,initial-scale=1"><script>globalThis.__sveltekit_dev={env:{}}</script></head><body><div id="app"></div><script type="module" src="/src/tests/fixtures/userAvatarUploadCheck.ts"></script></body></html>',
        }),
      )
      await page.goto(`${origin}/__avatar-upload.html`)
      const input = page.getByLabel('Upload user avatar')
      await input.setInputFiles({
        name: 'avatar.png',
        mimeType: 'image/png',
        buffer: Buffer.from('fixture'),
      })
      await page.waitForFunction(() => (globalThis as any).finishAvatarUpload)
      assert.equal(
        await page.getByRole('button', { name: 'Uploading…' }).isDisabled(),
        true,
      )
      await page.evaluate(() => (globalThis as any).finishAvatarUpload())
      await page.waitForFunction(
        () =>
          document.querySelector('[aria-label="Selection"]')?.textContent ===
          'verified-image',
      )
      await page.screenshot({ path: `${directory}/${name}-${width}.png` })
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
        false,
      )
      await input.setInputFiles({
        name: 'another.png',
        mimeType: 'image/png',
        buffer: Buffer.from('fixture'),
      })
      await page.getByRole('button', { name: 'Reset fixture' }).click()
      await page.evaluate(() => (globalThis as any).finishAvatarUpload())
      await page.waitForFunction(
        () => (globalThis as any).discardedAvatar === 'verified-image',
      )
      assert.equal(
        await page.getByLabel('Selection', { exact: true }).textContent(),
        'none',
      )
      assert.deepEqual(errors, [])
      console.log(
        `${name} ${width}px: deferred selection, busy state, reset race and overflow passed`,
      )
      await page.close()
    }
  } finally {
    await browser.close()
  }
}
