// CONTEXT
import { usePanelResources } from '#lib/context/panel-resources.svelte.js'
// SEARCH
import { matchesResourceIndexSearch } from '#lib/resources/indexQuery.js'
// UI
import { toast } from 'svelte-sonner'
// SERVICES
import { initAddNewFeature } from '#lib/client/services/feature.js'
// CONTEXT
import type { AppCtx } from '#lib/context/app.svelte.js'
import { dismissActiveFeatureNavigation, navigate } from '#lib/navigation/index.js'
import type { OmniCtx } from '#lib/context/omni.svelte.js'
import type { ResponsiveCtx } from '#lib/context/responsive.svelte.js'
// ENUMS
import { OmniCollection, OmniMode } from '#lib/enums.js'
// CONTEXT
import { hasElevatedChrome } from '#lib/layout/chrome.js'
// I18N
import { getI18n, m } from '#lib/i18n.js'
// TYPES
import type { Feature } from '#lib/db/zod/schema/feature.types.js'
import type {
  OmnibarProps,
  OmnibarResultSection,
} from '#lib/bits/patterns/bars/omnibar/index.js'
import type { DeepPartial, Locale, LocaleKey, Resource } from '#lib/types.js'
import type { NewFeatureTask } from '#lib/api/services/taskCreation.types.js'
// SEARCH POLICY
import { OMNIBAR_SEARCH_POLICY } from '#lib/bits/patterns/bars/omnibar/searchBudget.js'
// UTILS
import { getOmnibarAvailableViewportHeight } from '#lib/bits/patterns/bars/omnibar/omnibar.utils.js'

const COLLECTION_OPEN_DELAY_MS = 2000

/**
 * Adapter that maps app, omni, and responsive context state into the omnibar pattern API.
 * @param appCtx Shared app context for active resources and i18n labels.
 * @param omniCtx Omni domain context for search/navigation actions.
 * @param responsiveCtx Responsive context for elevated chrome and layout offsets.
 * @param getMapCenter Optional camera capability supplied by the public route.
 * @returns Omnibar model exposing `getOmnibarProps()` for `<Omnibar />`.
 */
export function useOmnibarModel(
  appCtx: AppCtx,
  omniCtx: OmniCtx,
  responsiveCtx: ResponsiveCtx,
  getMapCenter?: () => [number, number] | null,
): {
  getOmnibarProps: () => OmnibarProps
} {
  const resourceTypes = ['layer', 'project', 'organisation'] as const
  const resourceLists = resourceTypes.map(type =>
    usePanelResources(
      appCtx.view,
      type,
      () => omniCtx.searchQueryTerm,
      'panel',
      () => omniCtx.state.isTrayOpen && Boolean(omniCtx.searchQueryTerm.trim()),
      0,
    ),
  )

  /**
   * Applies the resource panel's activation or filter action from a search row.
   * @param type Resource hierarchy level.
   * @param id Selected resource identity.
   * @param control Whether the separate filter/target control was pressed.
   * @returns Completion after the scope and its dependent queries update.
   */
  async function selectResource(
    type: (typeof resourceTypes)[number],
    id: string,
    control = false,
  ): Promise<void> {
    const scope = appCtx.view.scope
    try {
      if (type === 'layer') {
        if (control) await scope.isolateLayer(id)
        else await scope.toggleLayer(id)
      } else if (type === 'project') {
        if (control) await scope.toggleProject(id)
        else if (scope.isProjectDefaultLayersActive(id))
          await scope.deactivateProjectLayers(id)
        else await scope.addProjectDefaultLayers(id)
      } else {
        if (control) await scope.toggleOrganisation(id)
        else if (scope.isOrganisationDefaultLayersActive(id))
          await scope.deactivateOrganisationLayers(id)
        else await scope.addOrganisationDefaultLayers(id)
      }
      const feature = appCtx.getActiveFeature()
      if (feature && !scope.prisms.layer.includes(feature.layerId)) {
        navigate('/')
        omniCtx.setMode(OmniMode.search)
      }
    } catch (error) {
      console.error('[Omni search] Resource action failed:', error)
      toast.error(m.resource_action_failed())
    }
  }

  /**
   * Projects matching authorized resource rows in specific-to-broad order.
   * @returns Matching resource rows with independent controls; the shared policy allocates previews.
   */
  function getResourceSections(): Omit<OmnibarResultSection, 'limit'>[] {
    if (!omniCtx.searchQueryTerm.trim()) return []
    const scope = appCtx.view.scope
    return resourceTypes.map((type, index) => ({
      collectionType: type,
      loading: resourceLists[index].searchPending,
      onSelection: (id: string) => void selectResource(type, id),
      results: resourceLists[index].rows
        .filter(
          row =>
            !row.isArchived && matchesResourceIndexSearch(row, omniCtx.searchQueryTerm),
        )
        .map(row => {
          const name = getI18n(
            row as Resource,
            'name',
            appCtx.view.getUserPreferences(),
          )
          const selected = scope.prisms[type].includes(row.id)
          return {
            ref: row.id,
            name,
            count: 0,
            collectionType: type,
            enabled:
              type === 'layer'
                ? selected
                : type === 'project'
                  ? scope.isProjectDefaultLayersActive(row.id)
                  : scope.isOrganisationDefaultLayersActive(row.id),
            control: {
              kind: type === 'layer' ? ('target' as const) : ('filter' as const),
              label:
                type === 'layer'
                  ? m.panel__isolate_layer({ name })
                  : selected
                    ? m.panel__unpin({ name })
                    : m.panel__pin({ name }),
              pressed: type === 'layer' ? undefined : selected,
              onClick: () => void selectResource(type, row.id, true),
            },
          }
        }),
    }))
  }

  type FeatureNavigationSource =
    | Feature
    | import('#lib/db/zod/schema/feature.types.js').FeatureFromCollection
    | DeepPartial<NewFeatureTask>['feature']
    | null
    | undefined

  /**
   * Normalizes feature-like navigation sources so the omnibar can read both
   * persisted features and in-progress new-feature drafts through one path.
   * @param source Active feature or draft feature payload.
   * @returns The localized i18n container used by navigation title helpers.
   */
  function getFeatureNavigationI18n(
    source: FeatureNavigationSource,
  ): Feature['i18n'] | null | undefined {
    return source?.i18n as Feature['i18n'] | null | undefined
  }

  /**
   * Resolve feature text for navigation chrome across locale fallbacks.
   * Titles follow the same translation preferences as feature cards; address
   * labels may explicitly allow generated geocoding results.
   * @param source Feature-like payload to read translated fields from.
   * @param field I18n field name to resolve.
   * @param fallback Fallback text if no value exists.
   * @param allowGenerated Whether generated translations are acceptable.
   * @returns The best available field value for the current locale order.
   */
  function getFeatureNavigationText(
    source: FeatureNavigationSource,
    field: 'displayAddress' | 'title',
    fallback: string,
    allowGenerated: boolean,
  ): string {
    const i18n = getFeatureNavigationI18n(source)

    if (!i18n) {
      return fallback
    }

    return getI18n(
      { i18n },
      field,
      appCtx.view.getUserPreferences(),
      fallback,
      allowGenerated,
    )
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
    if (omniCtx.isNewFeatureMode) {
      omniCtx.cancelNewFeature()
      return
    }

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
      appCtx.view.getUserPreferences(),
      m.location(),
    )

    if (!activeFeature) {
      return collectionTitle
    }

    const collectionIndex = omniCtx.navIndex + 1
    const collectionSize =
      collection.totalCount === undefined
        ? collection.items.length
        : (collection.totalCount ?? '…')

    return `${collectionTitle} (${collectionIndex} of ${collectionSize})`
  }

  function getFeatureTitle(): string {
    if (omniCtx.isNewFeatureMode) {
      return getFeatureNavigationText(
        appCtx.view.draft.current?.feature,
        'title',
        m.red_arable_herring_trust(),
        false,
      )
    }

    return getFeatureNavigationText(
      appCtx.getActiveFeature() ?? undefined,
      'title',
      '',
      false,
    )
  }

  function getCollectionItems(): Array<{ id: string; label: string }> {
    return (appCtx.getActiveCollection()?.items ?? []).map(item => ({
      id: item.id,
      label: getI18n(item, 'title', appCtx.view.getUserPreferences()),
    }))
  }

  function getSearchSections(): OmnibarResultSection[] {
    const sections: Omit<OmnibarResultSection, 'limit'>[] = [
      {
        collectionType: OmniCollection.feature,
        results: omniCtx.searchResults.feature ?? [],
        totalCount: appCtx.view.resources.featureQueries.search.totalCount,
        hasMore: appCtx.view.resources.featureQueries.search.hasMore,
        loading: omniCtx.searchPending,
        onLoadMore: () => void omniCtx.expandSearchSection(OmniCollection.feature),
        onSelection: omniCtx.searchHandlers.feature,
      },
      ...getResourceSections(),
      {
        collectionType: OmniCollection.neighbourhood,
        results: omniCtx.searchResults.neighbourhood ?? [],
        onLoadMore: () =>
          void omniCtx.expandSearchSection(OmniCollection.neighbourhood),
        onSelection: omniCtx.searchHandlers.neighbourhood,
        onPreview: (id, active) => appCtx.view.divisionCtx.previewDivision(id, active),
      },
      {
        collectionType: OmniCollection.walk,
        loading: omniCtx.searchPending,
        results: omniCtx.searchResults.walk ?? [],
        onLoadMore: () => void omniCtx.expandSearchSection(OmniCollection.walk),
        onSelection: omniCtx.searchHandlers.walk,
      },
    ]
    return OMNIBAR_SEARCH_POLICY.filter(policy =>
      sections.some(section => section.collectionType === policy.type),
    )
      .map(policy => ({
        ...sections.find(section => section.collectionType === policy.type)!,
        limit: policy.limit as number,
      }))
      .filter(
        section =>
          !omniCtx.searchSection || section.collectionType === omniCtx.searchSection,
      )
      .map(section => ({
        ...section,
        limit: omniCtx.searchSection
          ? Math.max(section.limit, omniCtx.searchSectionLimit)
          : section.limit,
      }))
  }

  return {
    getOmnibarProps: () => {
      const collectionItems = getCollectionItems()
      const currentIndex = omniCtx.navIndex
      const collectionLength = collectionItems.length

      return {
        mode: omniCtx.state.mode,
        hasElevatedChrome: hasElevatedChrome(
          appCtx.view.layout.getEffectiveAppMainWidth(),
          responsiveCtx.visibleWindowHeight,
        ),
        horizontalOffset: appCtx.view.layout.getAppMainOffsetX(),
        effectiveAppMainWidth: appCtx.view.layout.getEffectiveAppMainWidth(),
        availableViewportHeight: getOmnibarAvailableViewportHeight(
          responsiveCtx.visibleWindowHeight,
          appCtx.view.layout.menuClearanceHeight,
        ),
        search: {
          viewport: {
            height: responsiveCtx.visibleWindowHeight,
            offsetTop: responsiveCtx.viewport?.offsetTop ?? 0,
          },
          expanded: Boolean(omniCtx.searchSection),
          term: omniCtx.state.searchTerm,
          updating:
            omniCtx.state.searchTerm !== omniCtx.searchQueryTerm ||
            getSearchSections().some(section => section.loading),
          isTrayOpen: omniCtx.state.isTrayOpen,
          sections: getSearchSections(),
          onSearchTermChange: handleSearchTermChange,
          onOpenTray: () => omniCtx.openTray(),
          onCloseTray: () => omniCtx.closeTray(),
          onSelectFirstResult: () => {
            const sections = getSearchSections()
            // Pending rows still display the previous search, not these incoming matches.
            if (sections.some(section => section.loading)) return
            const section = sections.find(section => section.results.length > 0)
            if (section) section.onSelection(section.results[0].ref)
          },
          onClearSearchOrCloseTray: () => omniCtx.clearSearchOrCloseTray(),
          onCreateFeature: event =>
            void initAddNewFeature(appCtx.view, omniCtx, event, { getMapCenter }),
        },
        navigation: {
          isTrayOpen: omniCtx.state.isTrayOpen,
          isCardOpen: omniCtx.state.isCardOpen,
          isCardOpeningPending: omniCtx.isCardOpeningPending,
          showArrows:
            omniCtx.state.mode !== OmniMode.feature &&
            !omniCtx.isNewFeatureMode &&
            collectionLength > 0,
          showCollectionSwitcher:
            omniCtx.state.mode !== OmniMode.feature && !omniCtx.isNewFeatureMode,
          leftDisabled: currentIndex <= 0,
          rightDisabled:
            collectionLength === 0 ||
            (currentIndex >= collectionLength - 1 && !omniCtx.collectionHasMore),
          hasMore: omniCtx.collectionHasMore,
          loading: appCtx.view.resources.featureQueries.collection.loading,
          onLoadMore: () => void omniCtx.loadMoreCollection(),
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
