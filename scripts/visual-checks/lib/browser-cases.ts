// NODE
import { mkdir } from 'node:fs/promises'
// PLAYWRIGHT
import { chromium, firefox } from '@playwright/test'
// TYPES
import type { Browser, BrowserType } from '@playwright/test'

type BrowserName = 'chromium' | 'firefox'
type Engines = Readonly<Record<BrowserName, Pick<BrowserType, 'launch'>>>

export interface BrowserCase {
  name: BrowserName
  browser: Browser
}

/**
 * Run manual scenarios sequentially with one isolated browser per engine.
 * @param options Optional engine filter and Chromium-only local map CORS workaround.
 * @param engines Playwright engines; injectable for lifecycle tests without browsers.
 * @returns Chromium then Firefox, each closed before the next engine launches.
 * @remarks Run through dev-check. Breaking or throwing from the consuming loop closes
 * the current browser, including all of its contexts; scenario failures still propagate.
 * Headless execution avoids opening windows outside the managed testing workspace.
 */
export async function* browserCases(
  options: { map?: boolean; only?: string } = {},
  engines: Engines = { chromium, firefox },
): AsyncGenerator<BrowserCase, void, unknown> {
  await mkdir('output/playwright', { recursive: true })
  for (const name of ['chromium', 'firefox'] as const) {
    if (options.only && options.only !== name) continue
    const browser = await engines[name].launch({
      headless: true,
      ...(options.map && name === 'chromium'
        ? { args: ['--disable-web-security'] }
        : {}),
    })
    try {
      yield { name, browser }
    } finally {
      await browser.close()
    }
  }
}
