import process from 'node:process'

// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
//
// 1. PLAYWRIGHT LOADING
//    - loadChromium
//
// 2. BROWSER LAUNCH
//    - launchChromiumBrowser

/**
 * Lazily loads the Playwright Chromium browser type without breaking server builds.
 *
 * @returns Playwright Chromium browser type.
 */
export const loadChromium = async () => {
  const loadModule = new Function('moduleId', 'return import(moduleId)') as (
    moduleId: string,
  ) => Promise<{ chromium: unknown }>
  const playwright = await loadModule(['@play', 'wright/test'].join(''))

  return playwright.chromium as {
    launch: (options: { headless: boolean; channel?: string }) => Promise<unknown>
  }
}

export type LocalChromiumBrowser = Awaited<
  ReturnType<Awaited<ReturnType<typeof loadChromium>>['launch']>
>

/**
 * Launches installed Chrome headlessly for local renders without downloading browsers.
 *
 * @returns A launched Playwright Chromium browser.
 * @remarks PLAYWRIGHT_CHROMIUM_CHANNEL overrides Chrome; CI uses its provisioned browser.
 */
export const launchChromiumBrowser = async (): Promise<LocalChromiumBrowser> => {
  const chromium = await loadChromium()

  return (await chromium.launch({
    headless: true,
    channel:
      process.env.PLAYWRIGHT_CHROMIUM_CHANNEL ||
      (process.env.CI ? undefined : 'chrome'),
  })) as LocalChromiumBrowser
}
