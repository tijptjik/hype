// NODE
import assert from 'node:assert/strict'
// PLAYWRIGHT
import { chromium, expect } from '@playwright/test'

const origin = process.env.PLAYWRIGHT_BASE_URL
const artifacts = process.env.DEV_RUNNER_ARTIFACTS
const placement = process.env.DEV_RUNNER_CHROME_CLASS
if (!origin || !artifacts || !placement) throw new Error('Use dev-remote chrome')
const browser = await chromium.launch({
  channel: 'chrome',
  headless: false,
  args: ['--ozone-platform=x11', `--class=${placement}`],
})
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  try {
    page.on('pageerror', error => console.log('PAGE ERROR', error.message))
    page.on('response', async response => {
      if (response.url().includes('/_app/remote/') && response.status() >= 400)
        console.log(
          'REMOTE ERROR',
          response.status(),
          (await response.text()).slice(0, 1000),
        )
    })
    await page.goto(origin)
    const session = await (
      await page.request.get(`${origin}/api/auth/get-session`)
    ).json()
    assert.equal(session?.user?.id, 'hype-local-agent-admin')

    const response = await page.goto(
      `${origin}/admin/premises-maps?map=kennedy-town-mtr`,
    )
    assert(response?.ok())
    assert.equal(new URL(page.url()).pathname, '/admin/premises-maps')
    const left = page.locator('[data-connection-map="left"]')
    const right = page.locator('[data-connection-map="right"]')
    try {
      await expect(left).toBeVisible({ timeout: 60000 })
    } catch (error) {
      await page.screenshot({ path: `${artifacts}/paired-editor-load-failure.png` })
      throw error
    }
    await expect(page.getByRole('button', { name: 'New', exact: true })).toHaveCount(0)
    await expect(page.getByPlaceholder('Filter resources')).toHaveCount(0)
    await expect(
      page
        .getByRole('banner')
        .locator('[data-header-title-text]:visible')
        .filter({ hasText: 'Kennedy Town' })
        .first(),
    ).toBeVisible()
    await expect(page.getByText('Reason for connection changes')).toHaveCount(0)
    await expect(page).toHaveTitle(/^ᴰᴱⱽ Kennedy Town · .+ · HYPE\.HK$/)

    const source = left.locator('[data-facility]').filter({ has: page.locator('svg') })
    assert((await source.count()) > 0)
    // A new pair requires two independent selections and an explicit connect action.
    let found = false
    for (let i = 0; i < (await source.count()); i++) {
      await source.nth(i).focus()
      await page.keyboard.press('Enter')
      if (await right.locator('[data-state="Available"]').count()) {
        found = true
        break
      }
    }
    assert(found, 'Expected compatible candidates on the suggested floor')
    await expect(
      page.getByRole('button', { name: 'Save connections', exact: true }),
    ).toBeDisabled()
    // Direct pointer selection records an entrance without a separate dropdown.
    const selectedLeft = left.locator('[data-state="Selected"]')
    await selectedLeft.locator(':scope > path').hover({ force: true })
    await expect(left.locator('[data-entrance-preview]')).toHaveCount(1)
    await page.mouse.down()
    await page.mouse.up()
    await expect(left.locator('[data-entrance-edge][aria-pressed="true"]')).toHaveCount(
      1,
    )
    const selectedEdge = await left
      .locator('[data-entrance-edge][aria-pressed="true"]')
      .getAttribute('data-entrance-edge')
    assert(selectedEdge)
    await right.locator('[data-state="Available"]').first().focus()
    await page.keyboard.press('Enter')
    await expect(
      page.getByRole('button', { name: 'Connect selected facilities', exact: true }),
    ).toBeVisible()
    await expect(
      page.getByRole('button', { name: 'Save connections', exact: true }),
    ).toBeDisabled()
    const directionButton = page.locator('button[data-direction]')
    await expect(directionButton).toHaveAttribute('data-direction', 'both')
    for (const state of ['forward', 'reverse', 'unknown', 'both']) {
      await directionButton.click()
      await expect(directionButton).toHaveAttribute('data-direction', state)
    }
    await page
      .getByRole('button', { name: 'Connect selected facilities', exact: true })
      .click()
    for (const state of ['forward', 'reverse', 'unknown', 'both']) {
      await directionButton.click()
      await expect(directionButton).toHaveAttribute('data-direction', state)
      await expect(
        left.locator('[data-entrance-edge][aria-pressed="true"]'),
      ).toHaveAttribute('data-entrance-edge', selectedEdge)
    }

    await expect(
      page.getByRole('button', { name: 'Save connections', exact: true }),
    ).toBeEnabled()
    const leftSvg = left.locator(':scope > svg')
    const rightSvg = right.locator(':scope > svg')
    const initial = await leftSvg.getAttribute('viewBox')
    await left.hover()
    await page.mouse.wheel(0, -220)
    await expect(leftSvg).not.toHaveAttribute('viewBox', initial)
    assert.equal(
      await leftSvg.getAttribute('viewBox'),
      await rightSvg.getAttribute('viewBox'),
    )
    const beforePan = await leftSvg.getAttribute('viewBox')
    const box = await left.boundingBox()
    assert(box)
    await page.mouse.move(box.x + 20, box.y + 20)
    await page.mouse.down()
    await page.mouse.move(box.x + 70, box.y + 50, { steps: 5 })
    await page.mouse.up()
    await expect(leftSvg).not.toHaveAttribute('viewBox', beforePan)
    assert.equal(
      await leftSvg.getAttribute('viewBox'),
      await rightSvg.getAttribute('viewBox'),
    )
    await expect(
      left.locator('[data-entrance-edge][aria-pressed="true"]'),
    ).toHaveAttribute('data-entrance-edge', selectedEdge)
    // Tabs retain unsaved connections and both pane cameras.
    await page.getByRole('tab', { name: 'Level labels', exact: true }).click()
    await expect(
      page.getByRole('button', { name: 'Save label correction', exact: true }),
    ).toBeVisible()
    await expect(page).toHaveTitle(/^ᴰᴱⱽ Kennedy Town · Level labels · HYPE\.HK$/)
    await page.getByRole('tab', { name: 'Saved corrections', exact: true }).click()
    await expect(page).toHaveTitle('ᴰᴱⱽ Kennedy Town · Saved corrections · HYPE.HK')
    await expect(
      page.getByText('Overrides applied to the upstream map source.'),
    ).toBeVisible()
    await page.getByRole('tab', { name: 'Published history', exact: true }).click()
    const changes = page.getByRole('button', { name: 'View changes', exact: true })
    if (await changes.count()) {
      await changes.first().click()
      await expect(page.getByText(/Connections and level labels/)).toBeVisible({
        timeout: 60000,
      })
    }
    await page.getByRole('tab', { name: 'Floor connections', exact: true }).click()
    await expect(
      page.getByRole('button', { name: 'Save connections', exact: true }),
    ).toBeEnabled()
    assert.equal(
      await leftSvg.getAttribute('viewBox'),
      await rightSvg.getAttribute('viewBox'),
    )
    const main = page.locator('main[data-responsive-main]')
    for (const width of [1440, 1200]) {
      await page.setViewportSize({ width, height: 800 })
      await page.getByRole('button', { name: 'Fit floors', exact: true }).click()
      assert(
        await main.evaluate(element => element.scrollWidth <= element.clientWidth + 1),
      )
      await page.screenshot({ path: `${artifacts}/paired-editor-${width}.png` })
      await main.evaluate(element => {
        element.scrollTop = 0
      })
      const mainBox = await main.boundingBox()
      assert(mainBox)
      await page.getByRole('heading', { name: 'Map editor', exact: true }).hover()
      console.log(
        'SCROLL METRICS',
        await main.evaluate(element => ({
          height: element.clientHeight,
          content: element.scrollHeight,
          overflow: getComputedStyle(element).overflowY,
        })),
      )
      await page.mouse.wheel(0, 1200)
      await expect
        .poll(() => main.evaluate(element => element.scrollTop))
        .toBeGreaterThan(20)
      await expect(
        page.getByRole('button', { name: 'Discard unsaved edits', exact: true }),
      ).toBeInViewport()
    }
    await page
      .getByRole('button', { name: 'Discard unsaved edits', exact: true })
      .click()
    await expect(
      page.getByRole('button', { name: 'Save connections', exact: true }),
    ).toBeDisabled()
    // A pair sharing a directed 3D source segment exposes the upstream direction.
    await page.getByRole('combobox', { name: 'Left floor' }).click()
    await page.getByRole('option', { name: 'Concourse Level', exact: true }).click()
    await left.locator('[data-facility="5bb51bb9-0b86-40c8-8b8a-f14daa7886c6"]').focus()
    await page.keyboard.press('Enter')
    await page.getByRole('combobox', { name: 'Right floor' }).click()
    await page.getByRole('option', { name: 'Platform Level', exact: true }).click()
    await right
      .locator('[data-facility="5612a492-35a4-46ff-923c-269ed7c206ce"]')
      .focus()
    await page.keyboard.press('Enter')
    await expect(
      page.getByText('3D network: right to left', { exact: true }),
    ).toBeVisible()
    const useSource = page.getByRole('button', {
      name: 'Use source direction',
      exact: true,
    })
    if (await useSource.count()) await useSource.click()
    await expect(page.locator('button[data-direction]')).toHaveAttribute(
      'data-direction',
      'reverse',
    )
    if (
      await page
        .getByRole('button', { name: 'Discard unsaved edits', exact: true })
        .isEnabled()
    )
      await page
        .getByRole('button', { name: 'Discard unsaved edits', exact: true })
        .click()
    await expect(left.locator('[data-facility]').first()).toHaveAttribute(
      'aria-disabled',
      'false',
    )
    await page.getByRole('button', { name: 'Clear selection', exact: true }).click()
    // Exterior portals use the selected indoor edge and a point in the aligned right view.
    await left.locator('[data-facility]').first().focus()
    await page.keyboard.press('Enter')
    await left.locator('[data-entrance-edge]').first().focus()
    await page.keyboard.press('Enter')
    await expect(left.locator('[data-entrance-edge][aria-pressed="true"]')).toHaveCount(
      1,
    )
    await page.getByRole('combobox', { name: 'Right floor' }).click()
    await page.getByRole('option', { name: 'Outside / street', exact: true }).click()
    await expect(left.locator('[data-entrance-edge][aria-pressed="true"]')).toHaveCount(
      1,
    )
    await expect(
      page.getByRole('button', { name: 'Connect selected facilities', exact: true }),
    ).toHaveCount(0)
    const exteriorBox = await right.boundingBox()
    assert(exteriorBox)
    await page.mouse.click(
      exteriorBox.x + exteriorBox.width * 0.8,
      exteriorBox.y + exteriorBox.height * 0.8,
    )
    await expect(right.locator('[data-exterior-point]')).toHaveCount(1)
    await page
      .getByRole('button', { name: 'Connect selected facilities', exact: true })
      .click()
    for (const state of ['forward', 'reverse', 'unknown', 'both']) {
      await page.locator('button[data-direction]').click()
      await expect(page.locator('button[data-direction]')).toHaveAttribute(
        'data-direction',
        state,
      )
      await expect(right.locator('[data-exterior-point]')).toHaveCount(1)
    }
    await page.screenshot({ path: `${artifacts}/exterior-connection-editor.png` })
    await page
      .getByRole('button', { name: 'Discard unsaved edits', exact: true })
      .click()
    console.log(
      'PASS: auth, header, explicit pairing, synchronized wheel zoom/pan, persistent tabs, history comparison, page scrolling and discard',
    )
  } catch (error) {
    await page.screenshot({ path: `${artifacts}/paired-editor-failure.png` })
    throw error
  }
} finally {
  await browser.close()
}
