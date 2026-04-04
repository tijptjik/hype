// SERVICES
import { initAddNewFeature } from '$lib/client/services/feature'
// CONTEXT
import type { AppCtx } from '$lib/context/app.svelte'
import { dismissActiveFeatureNavigation } from '$lib/navigation'
import type { OmniCtx } from '$lib/context/omni.svelte'
import type { ResponsiveCtx } from '$lib/context/responsive.svelte'
// ENUMS
import { OmniCollection, OmniMode } from '$lib/enums'
// I18N
import { getI18n, getLocaleKey, getLocaleOrder, m, toLocaleCode } from '$lib/i18n'
// TYPES
import type { Feature } from '$lib/db/zod/schema/feature.types'
import type {
  OmnibarProps,
  OmnibarResultSection,
} from '$lib/bits/patterns/bars/omnibar'
import type { Locale, LocaleKey } from '$lib/types'
// UTILS
import { getOmnibarAvailableViewportHeight } from '$lib/bits/patterns/bars/omnibar/omnibar.utils'

const COLLECTION_OPEN_DELAY_MS = 2000

/**
 * Adapter that maps app, omni, and responsive context state into the omnibar pattern API.
 * @param appCtx Shared app context for active resources and i18n labels.
 * @param omniCtx Omni domain context for search/navigation actions.
 * @param responsiveCtx Responsive context for elevated chrome and layout offsets.
 * @returns Omnibar model exposing `getOmnibarProps()` for `<Omnibar />`.
 */
export function useOmnibarModel(
  appCtx: AppCtx,
  omniCtx: OmniCtx,
  responsiveCtx: ResponsiveCtx,
): { getOmnibarProps: () => OmnibarProps } {
  /**
   * Resolve feature text for navigation chrome across locale fallbacks.
   * The header should still identify the current feature even when only generated
   * translations exist in the preferred or fallback locales.
   * @param feature Feature to read translated fields from.
   * @param field I18n field name to resolve.
   * @param fallback Fallback text if no value exists.
   * @param allowGenerated Whether generated translations are acceptable.
   * @returns The best available field value for the current locale order.
   */
  function getFeatureNavigationText(
    feature: Feature | null | undefined,
    field: 'displayAddress' | 'title',
    fallback: string,
    allowGenerated: boolean,
  ): string {
    if (!feature?.i18n) {
      return fallback
    }

    const locales = getLocaleOrder(getLocaleKey())

    for (const localeKey of locales) {
      const localeCode = toLocaleCode(localeKey)
      const entry = feature.i18n[localeCode] ?? feature.i18n[localeKey]
      const value = entry?.[field]
      const isGenerated = Boolean(entry?.[`${field}Gen`])

      if (typeof value === 'string' && value.length > 0) {
        if (!isGenerated || allowGenerated) {
          return value
        }
      }
    }

    return fallback
  }

  function handleSearchTermChange(value: string): void {
    omniCtx.setSearchTerm(value)

    if (value !== '' && !omniCtx.state.isTrayOpen) {
      omniCtx.openTray()
    }
  }

  function handleToggleTray(): void {
    if (omniCtx.state.isTrayOpen) {
      omniCtx.closeTray()
      return
    }

    omniCtx.openTray()
  }

  function handleToggleCard(): void {
    omniCtx.closeTray()
    omniCtx.toggleCard()
  }

  function handleNavigationClose(): void {
    const didDismiss = dismissActiveFeatureNavigation({
      hasActiveFeature: Boolean(appCtx.getActiveFeature()),
      isCardOpen: omniCtx.state.isCardOpen,
      closeCard: () => {
        omniCtx.closeCard()
      },
      resetActiveFeature: () => appCtx.resetActiveFeature(),
      resetToSearch: () => omniCtx.resetToSearch(),
      setIntentionallyClosing: value => {
        omniCtx.isIntentionallyClosing = value
      },
    })

    if (didDismiss) {
      return
    }
  }

  function handleDismiss(): void {
    if (omniCtx.state.mode === OmniMode.search) {
      omniCtx.clearSearchOrCloseTray()
      return
    }

    omniCtx.close()
  }

  function handleSelectCollectionIndex(index: number): void {
    omniCtx.setMode(OmniMode.navigation, { openCard: false })
    omniCtx.navToIndex(index)

    setTimeout(() => {
      omniCtx.openCard()
    }, COLLECTION_OPEN_DELAY_MS)
  }

  function getCollectionMetaText(): string {
    const activeFeature = appCtx.getActiveFeature()
    const collection = appCtx.getActiveCollection()

    if (omniCtx.isNewFeatureMode) {
      return m.smart_crazy_cuckoo_play()
    }

    if (omniCtx.isFeatureMode) {
      return getFeatureNavigationText(activeFeature, 'displayAddress', '', true)
    }

    if (!collection) return ''

    const collectionTitle = getI18n(
      collection.i18n as Record<Locale | LocaleKey, { name: string }>,
      'name',
      appCtx.getUserPreferences(),
      m.place(),
    )

    if (!activeFeature) {
      return collectionTitle
    }

    const collectionIndex = omniCtx.navIndex + 1
    const collectionSize = collection.items.length

    return `${collectionTitle} (${collectionIndex} of ${collectionSize})`
  }

  function getFeatureTitle(): string {
    if (omniCtx.isNewFeatureMode) {
      return getFeatureNavigationText(
        appCtx.getNewFeature() as Feature,
        'title',
        m.red_arable_herring_trust(),
        true,
      )
    }

    return getFeatureNavigationText(
      appCtx.getActiveFeature() ?? undefined,
      'title',
      '',
      true,
    )
  }

  function getCollectionItems(): Array<{ id: string; label: string }> {
    return (appCtx.getActiveCollection()?.items ?? []).map(item => ({
      id: item.id,
      label: getI18n(item, 'title', appCtx.getUserPreferences()),
    }))
  }

  function getSearchSections(): OmnibarResultSection[] {
    return [
      {
        collectionType: OmniCollection.feature,
        results: omniCtx.searchResults.feature ?? [],
        limit: omniCtx.limits.feature ?? 0,
        onSelection: omniCtx.searchHandlers.feature,
      },
      {
        collectionType: OmniCollection.neighbourhood,
        results: omniCtx.searchResults.neighbourhood ?? [],
        limit: omniCtx.limits.neighbourhood ?? 0,
        onSelection: omniCtx.searchHandlers.neighbourhood,
      },
      {
        collectionType: OmniCollection.walk,
        results: omniCtx.searchResults.walk ?? [],
        limit: omniCtx.limits.walk ?? 0,
        onSelection: omniCtx.searchHandlers.walk,
      },
    ]
  }

  return {
    getOmnibarProps: () => {
      const collectionItems = getCollectionItems()
      const currentIndex = omniCtx.navIndex
      const collectionLength = collectionItems.length

      return {
        mode: omniCtx.state.mode,
        hasElevatedChrome: responsiveCtx.hasElevatedChrome,
        horizontalOffset: responsiveCtx.getAppMainOffsetX(),
        effectiveAppMainWidth: responsiveCtx.getEffectiveAppMainWidth(),
        availableViewportHeight: getOmnibarAvailableViewportHeight(
          responsiveCtx.visibleWindowHeight,
          responsiveCtx.menuClearanceHeight,
        ),
        search: {
          term: omniCtx.state.searchTerm,
          isTrayOpen: omniCtx.state.isTrayOpen,
          sections: getSearchSections(),
          onSearchTermChange: handleSearchTermChange,
          onOpenTray: () => omniCtx.openTray(),
          onCloseTray: () => omniCtx.closeTray(),
          onSelectFirstResult: () => omniCtx.selectFirstResult(),
          onClearSearchOrCloseTray: () => omniCtx.clearSearchOrCloseTray(),
          onCreateFeature: event => void initAddNewFeature(appCtx, omniCtx, event),
        },
        navigation: {
          isTrayOpen: omniCtx.state.isTrayOpen,
          isCardOpen: omniCtx.state.isCardOpen,
          showArrows:
            omniCtx.state.mode !== OmniMode.feature &&
            !omniCtx.isNewFeatureMode &&
            collectionLength > 0,
          showCollectionSwitcher:
            omniCtx.state.mode !== OmniMode.feature && !omniCtx.isNewFeatureMode,
          leftDisabled: currentIndex <= 0,
          rightDisabled: collectionLength === 0 || currentIndex >= collectionLength - 1,
          collectionMetaText: getCollectionMetaText(),
          featureTitle: getFeatureTitle(),
          navTitle: omniCtx.navTitle,
          items: collectionItems,
          currentIndex,
          onPrevious: () => omniCtx.navPrevious(),
          onNext: () => omniCtx.navNext(),
          onToggleTray: handleToggleTray,
          onToggleCard: handleToggleCard,
          onClose: handleNavigationClose,
          onSelectIndex: handleSelectCollectionIndex,
          onCloseTray: () => omniCtx.closeTray(),
        },
        onDismiss: handleDismiss,
      }
    },
  }
}
