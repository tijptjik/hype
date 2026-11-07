// Run with dev-check bun scripts/visual-checks/messaging-experience-check.ts against a local app on port 4173.
// NODE
import { readFile, mkdir } from 'node:fs/promises'
import { createMessagingMediaFixtures } from './messaging-media-fixtures'
// BROWSER
import { chromium, firefox } from 'playwright'

const mediaDirectory = await createMessagingMediaFixtures()
await mkdir('output/playwright', { recursive: true })
for (const [browserName, engine] of [
  ['chromium', chromium],
  ['firefox', firefox],
] as const) {
  const browser = await engine.launch()
  try {
    for (const platform of ['telegram', 'whatsapp']) {
      const page = await browser.newPage({ viewport: { width: 1200, height: 850 } })
      // Enable only this synthetic page's providers; preview's real integrations stay suspended.
      await page.route('**/src/lib/messaging/integrations.ts*', route =>
        route.fulfill({
          contentType: 'text/javascript',
          body: 'export const messagingIntegrations = { telegram: true, whatsapp: true };',
        }),
      )
      page.setDefaultTimeout(15_000)
      const errors: string[] = []
      page.on('pageerror', error => errors.push(error.message))
      await page.route('**/__media-fixture.webp', async route =>
        route.fulfill({
          contentType: 'image/webp',
          body: await readFile(`${mediaDirectory}/media.webp`),
        }),
      )
      await page.route('**/__messaging-experience.html*', route =>
        route.fulfill({
          contentType: 'text/html',
          body: '<!doctype html><html data-theme="breadline-light"><head><meta name="viewport" content="width=device-width,initial-scale=1"><script>globalThis.__sveltekit_dev={env:{}}</script></head><body><main style="max-width:72rem;margin:1rem auto"><div id="app"></div></main><script type="module" src="/src/tests/fixtures/messagingExperienceCheck.ts"></script></body></html>',
        }),
      )
      const url = `http://127.0.0.1:4173/__messaging-experience.html?platform=${platform}`
      await page.goto(url)
      console.log(`${browserName} ${platform}: initial load`)
      await page
        .waitForFunction(() => {
          const state = (window as any).experienceFixture
          return (
            state?.model &&
            Object.keys(state.model.mediaUrls).length === 1 &&
            Object.values(state.model.profiles).filter((profile: any) => profile.photo)
              .length >= 2
          )
        })
        .catch(async cause => {
          console.log(
            await page.evaluate(() => {
              const state = (window as any).experienceFixture
              const log = document.querySelector('[role="log"]')
              return {
                events: state?.events,
                profiles: Object.keys(state?.model?.profiles ?? {}),
                media: state?.model?.mediaUrls,
                errors: state?.model?.mediaErrors,
                text: document.body.innerText,
                scroll: log && [log.scrollTop, log.scrollHeight, log.clientHeight],
              }
            }),
          )
          await page.screenshot({
            path: `output/playwright/${browserName}-${platform}-cache-diagnostic.png`,
          })
          throw cause
        })
      console.log(`${browserName} ${platform}: model ready`)
      await page.waitForFunction(() =>
        [...document.querySelectorAll('[role="log"] img')].some(
          image =>
            image instanceof HTMLImageElement &&
            image.src.startsWith('blob:') &&
            image.naturalWidth > 0,
        ),
      )
      for (const width of [1200, 360]) {
        await page.setViewportSize({ width, height: 850 })
        for (const theme of ['breadline-light', 'hype-dark']) {
          await page.evaluate(theme => {
            document.documentElement.dataset.theme = theme
          }, theme)
          const geometry = await page.getByRole('log').evaluate(log => ({
            background: getComputedStyle(log).backgroundImage,
            bubbles: [...log.querySelectorAll('article')].map(element => ({
              width: element.getBoundingClientRect().width,
              overflow: [
                ...element.querySelectorAll('header,[data-selectable-message]'),
              ].some(content => content.scrollWidth > content.clientWidth),
            })),
            overflow:
              log.scrollWidth > log.clientWidth ||
              document.documentElement.scrollWidth > innerWidth,
          }))
          if (
            !geometry.background.includes('toastie-and-friends-staggered.svg') ||
            !geometry.background.includes('gradient')
          )
            throw new Error('Quiet background was not applied')
          if (
            geometry.overflow ||
            geometry.bubbles.some(bubble => bubble.width > 576.1 || bubble.overflow)
          )
            throw new Error(`Message overflow: ${JSON.stringify(geometry)}`)
          await page.screenshot({
            path: `output/playwright/${browserName}-${platform}-background-${theme}-${width}.png`,
          })
        }
      }
      await page.setViewportSize({ width: 1200, height: 850 })
      await page.evaluate(() => localStorage.setItem('fixture-network', 'off'))
      await page.reload()
      console.log(`${browserName} ${platform}: cached reload`)
      await page.waitForFunction(() => {
        const state = (window as any).experienceFixture
        return (
          state?.model &&
          Object.keys(state.model.mediaUrls).length === 1 &&
          Object.keys(state.model.profiles).length >= 2
        )
      })
      if ((await page.evaluate(() => (window as any).experienceFixture.events)).length)
        throw new Error('Reload downloaded cached media or fresh profiles again')
      // Expire profile freshness without expiring its offline data, then fail the refresh.
      await page.evaluate(async () => {
        await new Promise<void>((resolve, reject) => {
          const request = indexedDB.open('hype-media-catalog-v1')
          request.onsuccess = () => {
            const db = request.result,
              transaction = db.transaction('entries', 'readwrite'),
              store = transaction.objectStore('entries')
            const cursor = store.openCursor()
            cursor.onsuccess = () => {
              const row = cursor.result
              if (row) {
                if (row.value.id.includes(':profile:'))
                  row.update({
                    ...row.value,
                    value: { ...row.value.value, at: Date.now() - 2 * 60 * 60_000 },
                  })
                row.continue()
              }
            }
            transaction.oncomplete = () => {
              db.close()
              resolve()
            }
            transaction.onerror = () => reject(transaction.error)
          }
        })
      })
      await page.reload()
      console.log(`${browserName} ${platform}: stale profile reload`)
      await page.waitForFunction(
        () =>
          (window as any).experienceFixture?.events.filter((event: string) =>
            event.startsWith('profile:'),
          ).length >= 2,
      )
      if (
        !(await page.evaluate(() =>
          Object.values((window as any).experienceFixture.model.profiles).every(
            (profile: any) => profile.photo,
          ),
        ))
      )
        throw new Error('A failed profile refresh erased cached avatars')
      if (
        (await page.evaluate(() => (window as any).experienceFixture.events)).some(
          (event: string) => event.startsWith('media:'),
        )
      )
        throw new Error('Failed profile refresh discarded the media cache')
      // An edit invalidates only its attachment; a following deletion removes private bytes.
      await page.evaluate(async () => {
        localStorage.removeItem('fixture-network')
        const state = (window as any).experienceFixture
        state.messages[2].editedAt = Date.now()
        state.messages[2].sequence = 4
        await state.model.refresh()
      })
      console.log(`${browserName} ${platform}: edited media`)
      await page.waitForFunction(
        () =>
          (window as any).experienceFixture.events.filter((event: string) =>
            event.startsWith('media:'),
          ).length === 1,
      )
      await page.evaluate(async () => {
        const state = (window as any).experienceFixture
        state.messages[2].deleted = true
        state.messages[2].sequence = 5
        await state.model.refresh()
      })
      await page.getByText('Message deleted', { exact: true }).waitFor()
      if (
        await page.evaluate(
          () => Object.keys((window as any).experienceFixture.model.mediaUrls).length,
        )
      )
        throw new Error('Deleted media retained a live URL')
      // Another operator must fetch independently, even in the same browser storage partition.
      await page.evaluate(() => localStorage.setItem('fixture-network', 'off'))
      await page.goto(`${url}&operator=other-operator`)
      console.log(`${browserName} ${platform}: other operator`)
      await page.waitForFunction(() =>
        (window as any).experienceFixture?.events.includes('media:3'),
      )
      if (
        await page.evaluate(
          () =>
            Object.keys((window as any).experienceFixture.model.profiles).length ||
            Object.keys((window as any).experienceFixture.model.mediaUrls).length,
        )
      )
        throw new Error('Cached private content crossed operator scopes')
      if (errors.length) throw new Error(errors.join('\n'))
      console.log(
        `${browserName} ${platform}: wrapping, quiet light/dark background, persistent images/avatars, refresh failure, edit/delete and operator isolation passed`,
      )
      await page.close()
    }
  } finally {
    await browser.close()
  }
}
