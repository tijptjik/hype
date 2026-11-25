import { expect, test } from '@playwright/test'

for (const state of ['manual', 'unresolved']) {
  test(`fills the empty ${state} building name from its address and saves it`, async ({
    page,
  }) => {
    test.setTimeout(150_000)
    page.setDefaultTimeout(20_000)
    await page.setViewportSize({ width: 1600, height: 1000 })
    const admin = await page.goto('/admin', { waitUntil: 'domcontentloaded' })
    expect(admin.ok()).toBeTruthy()
    await expect(page).toHaveURL(/\/admin(?:\/features)?\/?$/)
    expect(
      (await (await page.request.get('/api/auth/get-session')).json()).user.id,
    ).toBe('hype-local-agent-admin')

    const { locationId } = await page.evaluate(async state => {
      const { getProjects } = await import('/src/lib/api/project.remote.ts')
      const { createLocalLocation } = await import('/src/lib/api/location.remote.ts')
      const projects = await getProjects({ meta: { isAdminRequest: true } })
      return createLocalLocation({
        projectId: projects.data[0].id,
        state,
        kind: 'building',
        facts: {
          names: {},
          phoneNumber: [],
          brands: [],
          location: {
            geometry: { type: 'Point', coordinates: [114.192, 22.329] },
            address: {
              status: 'unresolved',
              address2dId: null,
              address3dId: null,
              address3dUnitId: null,
              snapshotId: null,
              rawSource: {},
              fallbackDisplay: {},
              authored: {
                scope: 'building',
                i18n: { 'zh-hant': { formattedAddress: '', buildingName: '舊樓名' } },
                unit: null,
                unitI18n: {},
              },
            },
          },
        },
      })
    }, state)
    try {
      await page.goto(`/admin/locations/${locationId}`, {
        waitUntil: 'domcontentloaded',
      })
      const banner = page.getByRole('banner')
      const edit = banner.getByRole('button', { name: 'Edit', exact: true })
      // Older revisions can have an address name in just one language and no profile name.
      await expect(banner).toContainText('舊樓名', { timeout: 60_000 })
      await expect(page.locator('[data-location-record]')).toContainText('舊樓名')
      await edit.click({ timeout: 60_000 })
      const profile = page.locator('[data-draft-location-name]')
      await expect(
        profile.getByRole('button', { name: 'Name', exact: true }),
      ).toBeVisible({
        timeout: 60_000,
      })
      const input = page.getByRole('combobox', { name: 'Building name', exact: true })
      if (!(await input.isVisible())) {
        const showParts = page.getByRole('button', { name: 'Show address parts' })
        if (await showParts.isVisible()) await showParts.click()
        await page.getByRole('button', { name: 'Building name', exact: true }).click()
      }
      await input.fill('Unison Building')
      await page
        .getByRole('button', { name: 'Use “Unison Building” as a custom name' })
        .click()
      await expect(
        profile.getByRole('button', { name: 'Unison Building' }),
      ).toBeVisible()
      await banner.getByRole('button', { name: 'Save', exact: true }).click()
      const continueSave = page.getByRole('button', {
        name: 'Continue without accepting',
      })
      await expect(edit.or(continueSave)).toBeVisible({ timeout: 30_000 })
      if (await continueSave.isVisible()) await continueSave.click()
      await expect(edit).toBeVisible({ timeout: 30_000 })
      await page.reload()
      await expect(banner).toContainText('Unison Building', { timeout: 60_000 })

      // A later address edit must preserve the name already saved on the Location.
      await edit.click()
      await page
        .getByRole('button', { name: 'Replace: Unison Building', exact: true })
        .click()
      await input.fill('Another Building')
      await page
        .getByRole('button', { name: 'Use “Another Building” as a custom name' })
        .click()
      await expect(
        profile.getByRole('button', { name: 'Unison Building' }),
      ).toBeVisible()
    } finally {
      const result = await page.evaluate(async id => {
        const { getLocation, deleteLocation } = await import(
          '/src/lib/api/locationDirectory.remote.ts'
        )
        const query = getLocation({ id })
        await query.refresh()
        const record = await query
        return deleteLocation({
          locationId: id,
          revisionId: record.revisionId,
          draftVersion: record.draftVersion,
        })
      }, locationId)
      expect(result).toBe('deleted')
    }
  })
}
