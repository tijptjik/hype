// NODE
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
// PLAYWRIGHT
import { chromium, firefox } from 'playwright'
const origin = process.env.HYPE_CHECK_ORIGIN ?? 'http://127.0.0.1:4173'
const output = 'output/playwright/organisation-settings'
await mkdir(output, { recursive: true })
const accountsApi = `export function getMessagingAccounts(){return Object.assign(Promise.resolve([]),{refresh:async()=>{}})}
export const connectMessagingAccount=async()=>{};export const disconnectMessagingAccount=async()=>{};
export const loginTelegramAccount=async()=>{};export const registerMessagingAccount=async()=>{};
export const unwatchMessagingAccount=async()=>{};export const watchMessagingAccount=async()=>{};`
const appearanceApi = `export function getMessagingAppearance(){return Object.assign(Promise.resolve({image:'',opacity:0.06,size:480}),{refresh:async()=>{}})}
export async function setMessagingAppearance(input){return input.appearance}`
for (const [name, engine] of [
  ['chromium', chromium],
  ['firefox', firefox],
] as const) {
  const browser = await engine.launch({ headless: true })
  try {
    for (const width of [1440, 390, 320]) {
      const page = await browser.newPage({ viewport: { width, height: 1100 } })
      const errors: string[] = []
      page.on('pageerror', error => errors.push(error.message))
      await page.route('**/src/lib/api/messaging.remote.ts*', route =>
        route.fulfill({ contentType: 'text/javascript', body: accountsApi }),
      )
      await page.route('**/src/lib/api/messagingAppearance.remote.ts*', route =>
        route.fulfill({ contentType: 'text/javascript', body: appearanceApi }),
      )
      await page.route('**/__organisation-settings.html', route =>
        route.fulfill({
          contentType: 'text/html',
          body: '<html lang="en" data-theme="breadline-light"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>@layer theme,base,components,utilities;</style><script>globalThis.__sveltekit_dev={env:{}}</script></head><body><div id="app"></div><script type="module" src="/src/tests/fixtures/organisationSettingsCheck.ts"></script></body></html>',
        }),
      )
      await page.goto(`${origin}/__organisation-settings.html`)
      await page.getByRole('button', { name: 'Connect account', exact: true }).waitFor()
      await page.getByRole('slider', { name: 'Background intensity' }).waitFor()
      assert.equal(await page.locator('.bits-form__section-header').count(), 2)
      assert.ok(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        'Messaging overflows',
      )
      await page.screenshot({
        path: `${output}/${name}-${width}-messaging.png`,
        fullPage: true,
      })
      const phone = page.getByPlaceholder('+852…')
      await phone.fill('+85212345678')
      assert.equal(
        await page
          .getByRole('button', { name: 'Send login code', exact: true })
          .isEnabled(),
        true,
      )
      await page.getByRole('slider', { name: 'Background intensity' }).fill('0.1')
      await page.getByRole('button', { name: 'Save background', exact: true }).click()
      await page.getByText('Saved', { exact: true }).waitFor()
      await page.getByRole('button', { name: 'Members fixture' }).click()
      const search = page.getByPlaceholder('Add users')
      const searchBox = await search.boundingBox()
      await page.getByRole('button', { name: 'Toggle editing' }).click()
      await page.waitForTimeout(220)
      assert.equal((await search.boundingBox())!.y, searchBox!.y)
      const durations = await page.evaluate(() => {
        const search = document
          .querySelector('input[placeholder="Add users"]')!
          .closest('[aria-hidden]')!
        const trash = document.querySelector('button[aria-label="Remove Alex Self"]')!
        const arrow = document.querySelector(
          '.bits-form__user-card-actions-select > svg',
        )!
        return [search, trash, arrow].map(element => ({
          duration: getComputedStyle(element).transitionDuration,
          easing: getComputedStyle(element).transitionTimingFunction,
        }))
      })
      assert.deepEqual(durations[0], durations[1])
      assert.deepEqual(durations[0], durations[2])
      await page.getByRole('button', { name: 'Capabilities fixture' }).click()
      const empty = page.locator('.bits-form__capabilities-empty').locator('..')
      assert.equal(
        await empty.evaluate(element => getComputedStyle(element).opacity),
        '0',
      )
      await page.getByRole('button', { name: 'Toggle editing' }).click()
      await page.waitForTimeout(220)
      assert.equal(
        await empty.evaluate(element => getComputedStyle(element).opacity),
        '1',
      )
      assert.equal(
        await empty.evaluate(element => getComputedStyle(element).transitionDuration),
        durations[0].duration,
      )
      assert.deepEqual(errors, [])
      console.log(
        `${name} ${width}px: messaging layout, synthetic save, shared edit timing and capability fade passed`,
      )
      await page.close()
    }
  } finally {
    await browser.close()
  }
}
