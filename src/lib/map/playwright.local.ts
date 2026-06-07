import { spawn } from 'node:child_process'
import process from 'node:process'

// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
//
// 1. PLAYWRIGHT LOADING
//    - loadChromium
//
// 2. BROWSER INSTALL / LAUNCH
//    - launchChromiumBrowser

const PLAYWRIGHT_MISSING_EXECUTABLE_PATTERN = "Executable doesn't exist at"

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
    launch: (options: { headless: boolean }) => Promise<unknown>
  }
}

export type LocalChromiumBrowser = Awaited<
  ReturnType<Awaited<ReturnType<typeof loadChromium>>['launch']>
>

const isMissingPlaywrightExecutableError = (error: unknown): boolean =>
  error instanceof Error &&
  error.message.includes(PLAYWRIGHT_MISSING_EXECUTABLE_PATTERN)

/**
 * Ensures the Playwright Chromium browser binary exists in the local cache.
 *
 * @returns When the install command completes successfully.
 */
const installPlaywrightChromium = async (): Promise<void> =>
  new Promise((resolve, reject) => {
    // Install only when the cached executable is missing so local render commands self-heal.
    const install = spawn('bunx', ['playwright', 'install', 'chromium'], {
      cwd: process.cwd(),
      stdio: 'inherit',
      env: process.env,
    })

    install.on('error', reject)
    install.on('exit', code => {
      if (code === 0) {
        resolve()
        return
      }

      reject(
        new Error(`Failed to install Playwright Chromium (exit code ${code ?? 1})`),
      )
    })
  })

/**
 * Launches a headless Chromium instance, installing the browser binary once when missing.
 *
 * @returns A launched Playwright Chromium browser.
 */
export const launchChromiumBrowser = async (): Promise<LocalChromiumBrowser> => {
  const chromium = await loadChromium()

  try {
    return (await chromium.launch({
      headless: true,
    })) as LocalChromiumBrowser
  } catch (error) {
    if (!isMissingPlaywrightExecutableError(error)) {
      throw error
    }

    await installPlaywrightChromium()

    return (await chromium.launch({
      headless: true,
    })) as LocalChromiumBrowser
  }
}
