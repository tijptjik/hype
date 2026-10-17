// SVELTE
import { fromStore } from 'svelte/store'
import { useLanguageSettingsModel } from './useLanguageSettingsModel.svelte'
import { useExperimentalSettingsModel } from './useExperimentalSettingsModel.svelte'
import { useDefaultMapSettingsModel } from './useDefaultMapSettingsModel.svelte'
// AUTH
import { useSession } from '#lib/auth/client.js'
// ADAPTERS
import { useProfileSectionModel } from './useProfileSectionModel.svelte'
// ENUMS
import { Panel, PanelSide } from '#lib/enums.js'
// TYPES
import type { AdminCtx } from '#lib/context/admin.svelte.js'
import type { AdminPreferenceCode } from '#lib/db/zod/schema/user.types.js'
import type { ResourceViewCtx } from '#lib/context/resourceView.svelte.js'
import type { ThemeModel } from '#lib/themes/theme.svelte.js'
import type { PanelProps } from '#lib/bits/patterns/panels/panel.types.js'

/**
 * Owns settings application/session wiring outside the rendering pattern.
 * @param app - Route-owned application context.
 * @param theme - Root theme controller.
 * @returns Controlled settings state and callbacks.
 */
export function useSettingsPanelModel(
  app: ResourceViewCtx,
  theme: ThemeModel,
  admin?: AdminCtx,
) {
  const session = fromStore(useSession())
  const guest = $derived(session.current.data?.user?.isAnonymous === true)
  const profile = useProfileSectionModel(app, () => ({
    hideActions: guest,
    hideEditableFields: guest,
  }))
  const defaultMap = useDefaultMapSettingsModel(app)
  const language = useLanguageSettingsModel(app)
  const experimental = useExperimentalSettingsModel(app)
  return {
    language,
    experimental,
    defaultMap,
    get attribution() {
      return app.getUser()?.attribution
    },
    onAttribution: (...args: Parameters<ResourceViewCtx['setUserAttribution']>) =>
      app.setUserAttribution(...args),
    get adminPreferences() {
      return app.getUserPreferences().admin ?? {}
    },
    onAdminPreference: (code: AdminPreferenceCode, checked: boolean) =>
      admin?.setAdminPreference(code, checked),
    get panel(): PanelProps {
      return {
        panelType: Panel.settings,
        position: PanelSide.right,
        scrollable: true,
        inline: app.isAdmin(),
        isNarrow: false,
        isAdmin: app.isAdmin(),
      }
    },
    get open() {
      return (
        app.panels.isPanelOpen(Panel.settings) ||
        app.panels.isPanelOpenVisually(Panel.settings)
      )
    },
    get isGuestAccount() {
      return guest
    },
    get profileProps() {
      return profile.getProfileProps()
    },
    get theme() {
      return theme.selected
    },
    onTheme: theme.select,
    get mapTheme() {
      return theme.mapSelected
    },
    onMapTheme: theme.selectMap,
    onClose: () => app.panels.closePanel(Panel.settings),
  }
}
