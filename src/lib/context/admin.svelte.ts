// I18N
import { getLocale } from '$lib/i18n';
// LIB
import { fetchOrThrow } from '$lib/index';
// SERVICES
import { debouncedUpdateUserPreferences } from '$lib/client/services/user';
// CONTEXT
import { getContext, setContext } from 'svelte';
import { QueryClient } from '@tanstack/svelte-query';
import { AppCtx } from '$lib/context/app.svelte';
// ENUMS
import { ResourcePath, FirstClassResource, HierarchicalResource } from '$lib/enums';
// GUARDS
import { isTask } from '$lib/types';
// CLIENT SERVICES
import {
  getCachedFeatureSpecifierTranslation,
  calculateSpecifierTranslation
} from '$lib/client/services/stats';
// TYPES
import type {
  Organisation,
  Project,
  Layer,
  Feature,
  Id,
  FacetType,
  Task,
  Code,
  Resource,
  Hub,
  FilteredResources,
  Property,
  ViewFilters,
  Locale,
  FilterTriState,
  CurrentUser,
  UserPreferences,
  AdminPreferences,
  FeatureFromCollection,
  NavigableResource,
  FilterState
} from '../types';
import type { IconSource } from '@steeze-ui/svelte-icon';

// ═══════════════════════
// 3-TIER FILTER SYSTEM
// ═══════════════════════

// TIER 1: PRISMS -- Which organisations, projects, and layers are pre-filtered when fetching features from the database
// Applied at the server level to constrain the result set of first-class resources available

// See AppCtx.state.prisms

// TIER 2: APP FILTERS -- Which neighbourhoods and properties being filtered for when showing features on the map
// Applied in the app regardless of view - affects all features displayed on the map and in collections

// TIER 3: VIEW FILTERS -- Handled by individual admin views (e.g., /admin/features/)
// Only affect the current route/view they are applied on, not the underlying data or map view

const viewFilters: ViewFilters = {
  organisation: {
    // Status related
    isPublished: null,
    isArchived: false,

    // Image related
    hasImage: null,

    // Authorship related
    hasName: null,
    hasContextualName: null,
    hasDescription: null,

    // Translation related
    translationLocales: {
      en: false, // Default: English not selected
      'zh-hant': true,
      'zh-hans': true
    },
    isNameTranslated: {
      en: null,
      'zh-hant': null,
      'zh-hans': null
    },
    isContextualNameTranslated: {
      en: null,
      'zh-hant': null,
      'zh-hans': null
    },
    isDescriptionTranslated: {
      en: null,
      'zh-hant': null,
      'zh-hans': null
    }
  },
  project: {
    // Status related
    isPublished: null,
    isArchived: false,

    // Image related
    hasImage: null,

    // Authorship related
    hasName: null,
    hasContextualName: null,
    hasDescription: null,
    hasAttribution: null,
    hasLicense: null,

    // Translation related
    translationLocales: {
      en: false,
      'zh-hant': true,
      'zh-hans': true
    },
    isNameTranslated: {
      en: null,
      'zh-hant': null,
      'zh-hans': null
    },
    isContextualNameTranslated: {
      en: null,
      'zh-hant': null,
      'zh-hans': null
    },
    isDescriptionTranslated: {
      en: null,
      'zh-hant': null,
      'zh-hans': null
    },
    isAttributionTranslated: {
      en: null,
      'zh-hant': null,
      'zh-hans': null
    },
    isLicenseTranslated: {
      en: null,
      'zh-hant': null,
      'zh-hans': null
    }
  },
  layer: {
    // Status related
    isPublished: null,
    isArchived: false,

    // Authorship related
    hasName: null,
    hasContextualName: null,
    hasDescription: null,

    // Translation related
    translationLocales: {
      en: false,
      'zh-hant': true,
      'zh-hans': true
    },
    isNameTranslated: {
      en: null,
      'zh-hant': null,
      'zh-hans': null
    },
    isContextualNameTranslated: {
      en: null,
      'zh-hant': null,
      'zh-hans': null
    },
    isDescriptionTranslated: {
      en: null,
      'zh-hant': null,
      'zh-hans': null
    }
  },
  feature: {
    // Status related
    isPublished: null,
    isPendingReview: null,
    isArchived: false,
    isIntangible: null,
    isVisitable: null,

    // Image related
    hasImage: null,
    isOneImagePublished: null,
    isAllImagePublished: null,

    // Authorship related
    hasTitle: null,
    hasDescription: null,
    hasDisplayAddress: null,

    // Translation related
    translationLocales: {
      en: false, // Default: English not selected
      'zh-hant': true,
      'zh-hans': true
    },
    isTitleTranslated: {
      en: null,
      'zh-hant': null,
      'zh-hans': null
    },
    isDescriptionTranslated: {
      en: null,
      'zh-hant': null,
      'zh-hans': null
    },
    isSpecifierTranslated: {
      en: null,
      'zh-hant': null,
      'zh-hans': null
    },
    isAddressTranslated: {
      en: null,
      'zh-hant': null,
      'zh-hans': null
    },
    // Property related
    properties: {} as Record<Id, FilterTriState>
  },
  task: {
    // Status related
    isReviewed: null
  },
  hub: {
    // Status related
    isArchived: false,

    // Image related
    hasImage: null,

    // Authorship related
    hasName: null,
    hasContextualName: null,
    hasDescription: null,

    // Translation related
    translationLocales: {
      en: false,
      'zh-hant': false,
      'zh-hans': false
    },
    isNameTranslated: {
      en: null,
      'zh-hant': null,
      'zh-hans': null
    },
    isContextualNameTranslated: {
      en: null,
      'zh-hant': null,
      'zh-hans': null
    },
    isDescriptionTranslated: {
      en: null,
      'zh-hant': null,
      'zh-hans': null
    }
  }
};

export class AdminCtx {
  // ═══════════════════════
  // TABLE OF CONTENTS
  // ═══════════════════════
  // 1. CONSTRUCTOR
  // 2. STATE
  //
  // 3.1 ACTIVE RESOURCES
  // 3.2 ACTIVE RESOURCE :: GETTERS
  // 3.3 ACTIVE RESOURCE :: SETTERS
  //
  // 4.1 ADMIN QUERY :: KEYS
  // 4.2 ADMIN QUERY :: URLS
  // 4.3 ADMIN QUERY :: FUNCTIONS
  // 4.4 ADMIN QUERY :: INIT
  // 4.5 ADMIN QUERY :: INVALIDATION
  //
  // 5.1 ADMIN FILTERS
  // 5.2 ADMIN FILTERS :: DERIVED
  // 5.3 ADMIN FILTERS :: MUTATION
  //
  // 6 ADMIN LOOKUPS
  // 7. NAVIGATION
  // 8. UTILS :: LAYOUT
  // 9. STATS

  // Tanstack Query Client instance
  queryClient!: QueryClient;
  // App Context
  appCtx!: AppCtx;
  // Load State
  isInitialised: boolean = $state(false);

  // ═══════════════════════
  // CONSTRUCTOR
  // ═══════════════════════

  constructor(queryClient: QueryClient, appCtx: AppCtx) {
    this.queryClient = queryClient;
    this.appCtx = appCtx;

    // Only initialize if appCtx is defined and has the required properties
    if (this.appCtx && this.appCtx.queryMap) {
      this.initializeAdminQueryMap();
    }
  }

  // Initialize admin-specific query map on appCtx
  private initializeAdminQueryMap = (): void => {
    // Guard against undefined appCtx
    if (!this.appCtx || !this.appCtx.queryMap) {
      console.warn('AdminCtx: Cannot initialize query map - appCtx not ready');
      return;
    }

    // Override the default query functions with admin-specific ones
    // but reuse AppCtx query keys for common resources
    this.appCtx.queryMap.set(FirstClassResource.organisation, {
      queryKey: () => this.appCtx.organisationsQueryKey,
      queryFn: () => this.organisationsQueryFn()
    });

    this.appCtx.queryMap.set(FirstClassResource.project, {
      queryKey: () => this.appCtx.projectsQueryKey,
      queryFn: () => this.projectsQueryFn()
    });

    this.appCtx.queryMap.set(FirstClassResource.layer, {
      queryKey: () => this.appCtx.layersQueryKey,
      queryFn: () => this.layersQueryFn()
    });

    this.appCtx.queryMap.set(FirstClassResource.feature, {
      queryKey: () => this.appCtx.featuresQueryKey,
      queryFn: () => this.featuresQueryFn()
    });

    // PROPERTIES - reuse AppCtx query key and function
    this.appCtx.queryMap.set(FirstClassResource.property, {
      queryKey: () => this.appCtx.propertiesQueryKey,
      queryFn: () => this.propertiesQueryFn()
    });

    // Admin-specific resources with their own query keys
    this.appCtx.queryMap.set(FirstClassResource.task, {
      queryKey: () => this.tasksQueryKey,
      queryFn: () => this.tasksQueryFn()
    });

    this.appCtx.queryMap.set(FirstClassResource.hub, {
      queryKey: () => this.hubsQueryKey,
      queryFn: () => this.hubsQueryFn()
    });
  };

  // ═══════════════════════
  // ACTIVE RESOURCES
  // ═══════════════════════

  activeResourceType: NavigableResource | false = $derived(
    this.appCtx.state.nav.resourceType
  );
  activeResourceRef: Id | Code | false = $derived(this.appCtx.state.nav.resourceRef);
  activeFacet: FacetType | false = $derived(this.appCtx.state.nav.facet);

  // ═══════════════════════
  // ACTIVE RESOURCE :: SETTERS
  // ═══════════════════════

  setResourceType(resource: NavigableResource | false): void {
    // TODO Remove from AdminCtx
    this.appCtx.state.nav.resourceType = resource;
    this.appCtx.setActiveResourceType(resource);
  }

  setResourceRef(ref: Id | Code | false, resource?: NavigableResource): void {
    // TODO Remove from AdminCtx
    // If the new entity is a different resource type to the current entity, update the state
    if (resource) {
      this.setResourceType(resource);
    }
    this.appCtx.state.nav.resourceRef = ref;
    this.appCtx.setActiveResourceRef(ref);
  }

  setFacet(
    facet: FacetType | false,
    ref?: Id | Code | false,
    resource?: NavigableResource
  ): void {
    // TODO Remove from AdminCtx
    if (ref !== undefined) this.setResourceRef(ref);
    if (resource) this.setResourceType(resource);
    this.appCtx.state.nav.facet = facet;
    this.appCtx.setActiveFacet(facet);
  }

  // ═══════════════════════
  // HEADER MANAGEMENT
  // ═══════════════════════

  setHeaderForIndex(title: string, icon: IconSource): void {
    this.appCtx.setHeaderState({
      icon,
      title,
      facetTabs: new Map(),
      actions: {
        showAddButton: true,
        showSearch: true,
        showLayoutModes: true,
        showControlModes: true,
        showFormActions: false
      }
    });
  }

  setHeaderForEntity(
    title: string,
    icon: IconSource,
    facetTabs: Map<FacetType, string>
  ): void {
    this.appCtx.setHeaderState({
      icon,
      title,
      facetTabs,
      actions: {
        showAddButton: false,
        showSearch: false,
        showLayoutModes: false,
        showControlModes: false,
        showFormActions: true
      }
    });
  }

  // ═══════════════════════
  // ADMIN QUERY KEYS
  // ═══════════════════════

  get tasksQueryKey() {
    return [
      FirstClassResource.task,
      this.appCtx.state.prisms.organisation,
      this.appCtx.state.prisms.project,
      this.appCtx.state.viewFilters[FirstClassResource.task].isReviewed
    ];
  }

  get hubsQueryKey() {
    return ['hub'];
  }

  // ═══════════════════════
  // ADMIN QUERY URLS
  // ═══════════════════════

  // Helper method to build API URLs with filters
  private buildApiUrl(resource: FirstClassResource, includeFilters = true): string {
    const path = ResourcePath[resource];
    const params = new URLSearchParams();

    // Add isArchived / isReviewed filter by default
    if (
      resource !== FirstClassResource.task &&
      resource !== FirstClassResource.property
    ) {
      // SuperAdmin users should see all archived resources, so don't force isArchived=false
      if (!this.appCtx.isSuperAdmin()) {
        params.append('isArchived', 'false');
      }
    } else if (resource === FirstClassResource.task) {
      const isReviewed =
        this.appCtx.state.viewFilters[FirstClassResource.task].isReviewed;
      if (isReviewed !== null) {
        params.append('isReviewed', isReviewed!.toString());
      }
    }
    // Properties have no filters

    if (includeFilters) {
      // Add prism filters based on resource hierarchy
      if (resource !== FirstClassResource.organisation) {
        this.appCtx.state.prisms.organisation.forEach((org) =>
          params.append(FirstClassResource.organisation, org)
        );
      }

      if (
        resource !== FirstClassResource.organisation &&
        resource !== FirstClassResource.project
      ) {
        this.appCtx.state.prisms.project.forEach((proj) =>
          params.append(FirstClassResource.project, proj)
        );
      }

      if (resource === FirstClassResource.feature) {
        this.appCtx.state.prisms.layer.forEach((layer) =>
          params.append(FirstClassResource.layer, layer)
        );
      }
    }

    return `/api/${path}?${params.toString()}`;
  }

  // ═══════════════════════
  // ADMIN QUERY :: FUNCTIONS
  // ═══════════════════════

  organisationsQueryFn = async () => {
    const url = this.buildApiUrl(FirstClassResource.organisation);
    return fetchOrThrow<Organisation[]>(url);
  };

  projectsQueryFn = async () => {
    const url = this.buildApiUrl(FirstClassResource.project);
    return fetchOrThrow<Project[]>(url);
  };

  layersQueryFn = async () => {
    const url = this.buildApiUrl(FirstClassResource.layer);
    return fetchOrThrow<Layer[]>(url);
  };

  featuresQueryFn = async () => {
    const url = this.buildApiUrl(FirstClassResource.feature);
    return fetchOrThrow<Feature[]>(url);
  };

  tasksQueryFn = async () => {
    const url = this.buildApiUrl(FirstClassResource.task);
    return fetchOrThrow<Task[]>(url);
  };

  propertiesQueryFn = async () => {
    const url = this.buildApiUrl(FirstClassResource.property);
    return fetchOrThrow<Property[]>(url);
  };

  hubsQueryFn = async () => {
    if (!this.appCtx.isSuperAdmin()) return [];
    const url = this.buildApiUrl(FirstClassResource.hub);
    return fetchOrThrow<Hub[]>(url);
  };

  // Initialize data using appCtx's refresh methods
  init = async (): Promise<void> => {
    // Ensure query map is initialized if it wasn't done in constructor
    if (this.appCtx && this.appCtx.queryMap && !this.isInitialised) {
      this.initializeAdminQueryMap();
    }

    // Use AppCtx's cascading refresh logic but with admin query functions
    await this.appCtx.refreshOrganisations();

    // Always refresh tasks when admin initializes to ensure fresh task data
    // This is especially important when navigating from app to admin
    await this.invalidateAndRefresh(FirstClassResource.task);

    this.isInitialised = true;
  };

  // ═══════════════════════
  // ADMIN QUERY :: INVALIDATION
  // ═══════════════════════

  async invalidateAndRefresh(resource: FirstClassResource) {
    await this.appCtx.invalidate(resource);
    await this.appCtx.refresh(resource);
  }

  // ═══════════════════════
  // ADMIN FILTERS
  // ═══════════════════════

  getFilteredResource = <
    T extends Organisation | Project | Layer | Feature | Hub | Task
  >(
    resource: FirstClassResource | HierarchicalResource,
    filters = { text: true, state: true }
  ): T[] => {
    let query = this.appCtx.state.filters[resource as keyof FilterState].text || '';
    // FULL SET
    let result = this.appCtx.state.resources[
      resource as keyof FilteredResources
    ] as T[];
    // TIER 2 FILTERS :: Boolean State :: (App Wide)
    // TODO Implement these filters if the data responses get too large.
    // TIER 2 FILTERS :: Text :: (App Wide)
    if (filters.text && resource !== FirstClassResource.hub) {
      result = result.filter((entity: T) => {
        if (!isTask(entity)) {
          return this.appCtx.textFilter(resource as FirstClassResource, entity, query);
        }
        return true;
      });
    }

    return result;
  };

  getViewFilteredResource = <T extends Resource>(resource: FirstClassResource): T[] => {
    // HUB
    if (resource === FirstClassResource.hub) {
      const entities = this.getFilteredHub();
      return this.applyHubViewFilters(entities) as T[];
    }
    // TASKS
    if (resource === FirstClassResource.task) {
      const entities = this.getFilteredTask();
      return this.applyTaskViewFilters(entities) as T[];
    }
    // HIERARCHICAL RESOURCES
    const entities = this.appCtx.getFilteredResource(resource);

    if (resource === FirstClassResource.feature) {
      return this.applyFeatureViewFilters(entities) as T[];
    } else if (resource === FirstClassResource.organisation) {
      return this.applyOrganisationViewFilters(entities) as T[];
    } else if (resource === FirstClassResource.project) {
      return this.applyProjectViewFilters(entities) as T[];
    } else if (resource === FirstClassResource.layer) {
      return this.applyLayerViewFilters(entities) as T[];
    }
    return entities as T[];
  };

  applyFeatureViewFilters = (entities: Resource[]): Resource[] => {
    const features = entities as Feature[];
    const filters = this.appCtx.state.viewFilters.feature;
    if (!filters) return features;

    // Determine active locales from filter state
    const activeLocales = new Set<Locale>();
    for (const [locale, isActive] of Object.entries(filters.translationLocales)) {
      if (isActive) {
        activeLocales.add(locale as Locale);
      }
    }

    return features.filter((feature) => {
      if (!this.filterByStatus(feature, filters)) return false;
      if (!this.filterByAuthorship(feature, filters)) return false;
      if (!this.filterByTranslation(feature, filters, activeLocales)) return false;
      if (!this.filterByImages(feature, filters)) return false;
      if (!this.filterByProperties(feature, filters)) return false;
      return true;
    });
  };

  // ═══════════════════════
  // ADMIN FILTERS :: HELPERS
  // ═══════════════════════

  /**
   * Filters features by their publication and review status flags.
   *
   * Note: isPendingReview has inverted logic - a filter value of `true`
   * means "show features NOT pending review" (where feature.isPendingReview is false).
   *
   * @param feature - The feature to evaluate
   * @param filters - Status filter settings
   * @returns true if feature passes all status filters
   */
  private filterByStatus = (
    feature: Feature,
    filters: ViewFilters['feature']
  ): boolean => {
    if (filters.isPublished !== null && feature.isPublished !== filters.isPublished)
      return false;
    if (filters.isArchived !== null && feature.isArchived !== filters.isArchived)
      return false;
    if (filters.isIntangible !== null && feature.isIntangible !== filters.isIntangible)
      return false;
    if (filters.isVisitable !== null && feature.isVisitable !== filters.isVisitable)
      return false;

    // isPendingReview has inverted logic, so the check is flipped.
    // A filter value of `true` means "show features NOT pending review" (where feature.isPendingReview is false)
    if (
      filters.isPendingReview !== null &&
      feature.isPendingReview === filters.isPendingReview
    ) {
      return false;
    }

    return true;
  };

  /**
   * Filters features by whether they have user-authored content.
   *
   * Checks if features have non-generated titles and descriptions across
   * any locale. Features without i18n data are considered to have no content.
   *
   * @param feature - The feature to evaluate
   * @param filters - Authorship filter settings
   * @returns true if feature passes authorship filters
   */
  private filterByAuthorship = (
    feature: Feature,
    filters: ViewFilters['feature']
  ): boolean => {
    if (!feature.i18n) {
      if (filters.hasTitle === true || filters.hasDescription === true) return false;
      return true;
    }

    const allLocales = Object.keys(feature.i18n) as Locale[];

    if (filters.hasTitle !== null) {
      const hasTitle = allLocales.some(
        (locale) =>
          feature.i18n?.[locale]?.title &&
          feature.i18n[locale]!.title!.length > 1 &&
          !feature.i18n[locale]!.titleGen
      );
      if (hasTitle !== filters.hasTitle) return false;
    }

    if (filters.hasDescription !== null) {
      const hasDescription = allLocales.some(
        (locale) =>
          feature.i18n?.[locale]?.description &&
          feature.i18n[locale]!.description!.length > 1 &&
          !feature.i18n[locale]!.descriptionGen
      );
      if (hasDescription !== filters.hasDescription) return false;
    }

    if (filters.hasDisplayAddress !== null) {
      const hasDisplayAddress = allLocales.some(
        (locale) =>
          feature.i18n?.[locale]?.displayAddress &&
          feature.i18n[locale]!.displayAddress!.length > 1 &&
          !feature.i18n[locale]!.displayAddressGen
      );
      if (hasDisplayAddress !== filters.hasDisplayAddress) return false;
    }

    return true;
  };

  /**
   * Filters features by translation status across multiple locales and fields.
   *
   * For each translation field (title, description, address), checks if the feature
   * meets the translation requirements across all active locales. If ALL values
   * for a field are null/empty across all locales, the field is considered as
   * "no content to translate" and passes the filter.
   *
   * @param feature - The feature to evaluate
   * @param filters - Translation filter settings per locale
   * @param activeLocales - Set of locales to check
   * @returns true if feature passes all translation filters
   */
  private filterByTranslation = (
    feature: Feature,
    filters: ViewFilters['feature'],
    activeLocales: Set<Locale>
  ): boolean => {
    const translationChecks: {
      filterKey:
        | 'isTitleTranslated'
        | 'isDescriptionTranslated'
        | 'isAddressTranslated';
      textField: 'title' | 'description' | 'displayAddress';
      genField: 'titleGen' | 'descriptionGen' | 'displayAddressGen';
    }[] = [
      { filterKey: 'isTitleTranslated', textField: 'title', genField: 'titleGen' },
      {
        filterKey: 'isDescriptionTranslated',
        textField: 'description',
        genField: 'descriptionGen'
      },
      {
        filterKey: 'isAddressTranslated',
        textField: 'displayAddress',
        genField: 'displayAddressGen'
      }
    ];

    for (const { filterKey, textField, genField } of translationChecks) {
      const isAnyLocaleFiltered = [...activeLocales].some(
        (locale) => filters[filterKey]?.[locale] !== null
      );
      if (!isAnyLocaleFiltered) continue;

      // First, check if ANY locale has manual (non-generated) content for this field
      const hasAnyManualContent = Object.values(feature.i18n ?? {}).some(
        (i18n: any) => {
          const text = i18n?.[textField];
          const isGenerated = i18n?.[genField] ?? false;
          return text && typeof text === 'string' && text.length > 0 && !isGenerated;
        }
      );

      // Calculate multi-locale translation status - ALL active locales must be translated for TRUE
      const calculateMultiLocaleTranslationStatus = (): boolean | null => {
        if (!hasAnyManualContent) {
          return null; // No manual content anywhere
        }

        // Check if ALL active locales have manual translation
        const allActiveLocalesTranslated = [...activeLocales].every((locale) => {
          const i18n = feature.i18n?.[locale];
          if (!i18n) return false; // No entry for this locale

          const text = i18n[textField as keyof typeof i18n];
          const isGenerated = i18n[genField as keyof typeof i18n] ?? false;

          return text && typeof text === 'string' && text.length > 0 && !isGenerated;
        });

        return allActiveLocalesTranslated;
      };

      const multiLocaleStatus = calculateMultiLocaleTranslationStatus();

      const allLocalesMatch = [...activeLocales].every((locale) => {
        const filterValue = filters[filterKey]?.[locale];
        if (filterValue === null) return true;
        // Use multi-locale status for filtering
        if (filterValue === true) {
          return multiLocaleStatus === true; // ALL locales must be translated
        } else {
          return multiLocaleStatus === false; // Some locales are not translated (but manual content exists)
        }
      });

      if (!allLocalesMatch) return false;
    }

    // Handle specifier translation filter separately (global, not per-locale)
    const isSpecifierFiltered = [...activeLocales].some(
      (locale) => filters.isSpecifierTranslated?.[locale] !== null
    );

    if (isSpecifierFiltered) {
      // Get the specifier translation status (tri-state: true, false, or null)
      const specifierStatus = getCachedFeatureSpecifierTranslation(
        this.appCtx,
        feature,
        (f) => calculateSpecifierTranslation(f)
      );

      // Check if any active locale has a filter set
      const specifierMatches = [...activeLocales].every((locale) => {
        const filterValue = filters.isSpecifierTranslated?.[locale];
        if (filterValue === null) return true;

        // If filtering for TRUE: Include features where specifiers are translated OR no source content exists (NULL case)
        // If filtering for FALSE: Include only features where specifiers exist AND are NOT translated (exclude NULL case)
        if (filterValue === true) {
          return specifierStatus === true || specifierStatus === null; // TRUE includes NULL (no source content)
        } else {
          return specifierStatus === false; // FALSE excludes NULL (requires source content to be false)
        }
      });

      if (!specifierMatches) return false;
    }

    return true;
  };

  /**
   * Filters features by image presence and publication status
   *
   * Supported filters
   * - hasImage - has at least one image
   * - isOneImagePublished - has at least one published image
   * - isAllImagePublished - ALL images must be published
   *
   * @param feature - The feature to filter
   * @param filters - The filters to apply
   * @returns True if the feature matches the filters, false otherwise
   */
  private filterByImages = (
    feature: Feature,
    filters: ViewFilters['feature']
  ): boolean => {
    // Check if feature has the new count fields (from collection API)
    if ('imageCount' in feature && 'imagePublishedCount' in feature) {
      const imageCount = (feature as any).imageCount as number;
      const imagePublishedCount = (feature as any).imagePublishedCount as number;
      const hasImages = imageCount > 0;

      if (filters.hasImage !== null) {
        if (filters.hasImage !== hasImages) return false;
      }

      if (hasImages) {
        if (filters.isOneImagePublished !== null) {
          const hasAtLeastOnePublished = imagePublishedCount > 0;
          if (filters.isOneImagePublished === true) {
            // TRUE: Show features with at least one published image
            if (!hasAtLeastOnePublished) return false;
          } else {
            // FALSE: Show features where ALL images are unpublished
            if (hasAtLeastOnePublished) return false;
          }
        }

        if (filters.isAllImagePublished !== null) {
          const allImagesPublished =
            imageCount > 0 && imagePublishedCount === imageCount;
          if (filters.isAllImagePublished === true) {
            // TRUE: Show features where ALL images are published
            if (!allImagesPublished) return false;
          } else {
            // FALSE: Show features that have NOT published ALL their images (at least one unpublished)
            if (allImagesPublished) return false;
          }
        }
      } else {
        // No images case - in tri-state logic, features with no images should be excluded from BOTH true and false filters
        if (filters.isOneImagePublished !== null) {
          // Features with no images don't pass either TRUE or FALSE filters (tri-state: null case)
          return false;
        }

        if (filters.isAllImagePublished !== null) {
          // Features with no images don't pass either TRUE or FALSE filters (tri-state: null case)
          return false;
        }
      }
      return true;
    }

    // Fallback to images array for individual feature API or compatibility
    const images = feature.images ?? [];
    const hasImages = images.length > 0;

    if (filters.hasImage !== null) {
      if (filters.hasImage !== hasImages) return false;
    }

    if (hasImages) {
      if (filters.isOneImagePublished !== null) {
        // Note: isPublished is on the feature-image relationship, not the image itself
        const hasAtLeastOnePublished = images.some(
          (featureImage) => featureImage.isPublished
        );
        if (filters.isOneImagePublished === true) {
          // TRUE: Show features with at least one published image
          if (!hasAtLeastOnePublished) return false;
        } else {
          // FALSE: Show features where ALL images are unpublished
          if (hasAtLeastOnePublished) return false;
        }
      }

      if (filters.isAllImagePublished !== null) {
        // Note: isPublished is on the feature-image relationship, not the image itself
        const allImagesPublished = images.every(
          (featureImage) => featureImage.isPublished
        );
        if (filters.isAllImagePublished === true) {
          // TRUE: Show features where ALL images are published
          if (!allImagesPublished) return false;
        } else {
          // FALSE: Show features that have NOT published ALL their images (at least one unpublished)
          if (allImagesPublished) return false;
        }
      }
    } else {
      // No images case - in tri-state logic, features with no images should be excluded from BOTH true and false filters
      if (filters.isOneImagePublished !== null) {
        // Features with no images don't pass either TRUE or FALSE filters (tri-state: null case)
        return false;
      }

      if (filters.isAllImagePublished !== null) {
        // Features with no images don't pass either TRUE or FALSE filters (tri-state: null case)
        return false;
      }
    }
    return true;
  };

  // ═══════════════════════
  // ORGANISATION VIEW FILTERS
  // ═══════════════════════

  applyOrganisationViewFilters = (entities: Resource[]): Resource[] => {
    const organisations = entities as Organisation[];
    const filters = this.appCtx.state.viewFilters.organisation;
    if (!filters) return organisations;

    // Determine active locales from filter state
    const activeLocales = new Set<Locale>();
    for (const [locale, isActive] of Object.entries(filters.translationLocales)) {
      if (isActive) {
        activeLocales.add(locale as Locale);
      }
    }

    return organisations.filter((organisation) => {
      if (!this.filterOrganisationByStatus(organisation, filters)) return false;
      if (!this.filterOrganisationByAuthorship(organisation, filters)) return false;
      if (!this.filterOrganisationByTranslation(organisation, filters, activeLocales))
        return false;
      if (!this.filterOrganisationByImages(organisation, filters)) return false;
      return true;
    });
  };

  private filterOrganisationByStatus = (
    organisation: Organisation,
    filters: ViewFilters['organisation']
  ): boolean => {
    if (
      filters.isPublished !== null &&
      organisation.isPublished !== filters.isPublished
    )
      return false;
    if (filters.isArchived !== null && organisation.isArchived !== filters.isArchived)
      return false;
    return true;
  };

  private filterOrganisationByAuthorship = (
    organisation: Organisation,
    filters: ViewFilters['organisation']
  ): boolean => {
    if (!organisation.i18n) {
      if (
        filters.hasName === true ||
        filters.hasContextualName === true ||
        filters.hasDescription === true
      )
        return false;
      return true;
    }

    const allLocales = Object.keys(organisation.i18n) as Locale[];

    if (filters.hasName !== null) {
      const hasName = allLocales.some(
        (locale) =>
          organisation.i18n?.[locale]?.name &&
          organisation.i18n[locale]!.name!.length > 1 &&
          !organisation.i18n[locale]!.nameGen
      );
      if (hasName !== filters.hasName) return false;
    }

    if (filters.hasContextualName !== null) {
      const hasContextualName = allLocales.some(
        (locale) =>
          organisation.i18n?.[locale]?.nameShort &&
          organisation.i18n[locale]!.nameShort!.length > 1 &&
          !organisation.i18n[locale]!.nameShortGen
      );
      if (hasContextualName !== filters.hasContextualName) return false;
    }

    if (filters.hasDescription !== null) {
      const hasDescription = allLocales.some(
        (locale) =>
          organisation.i18n?.[locale]?.description &&
          organisation.i18n[locale]!.description!.length > 1 &&
          !organisation.i18n[locale]!.descriptionGen
      );
      if (hasDescription !== filters.hasDescription) return false;
    }

    return true;
  };

  private filterOrganisationByTranslation = (
    organisation: Organisation,
    filters: ViewFilters['organisation'],
    activeLocales: Set<Locale>
  ): boolean => {
    const translationChecks: {
      filterKey:
        | 'isNameTranslated'
        | 'isContextualNameTranslated'
        | 'isDescriptionTranslated';
      textField: 'name' | 'nameShort' | 'description';
      genField: 'nameGen' | 'nameShortGen' | 'descriptionGen';
    }[] = [
      { filterKey: 'isNameTranslated', textField: 'name', genField: 'nameGen' },
      {
        filterKey: 'isContextualNameTranslated',
        textField: 'nameShort',
        genField: 'nameShortGen'
      },
      {
        filterKey: 'isDescriptionTranslated',
        textField: 'description',
        genField: 'descriptionGen'
      }
    ];

    for (const { filterKey, textField, genField } of translationChecks) {
      const isAnyLocaleFiltered = [...activeLocales].some(
        (locale) => filters[filterKey]?.[locale] !== null
      );
      if (!isAnyLocaleFiltered) continue;

      // First, check if ANY locale has manual (non-generated) content for this field
      const hasAnyManualContent = Object.values(organisation.i18n ?? {}).some(
        (i18n: any) => {
          const text = i18n?.[textField];
          const isGenerated = i18n?.[genField] ?? false;
          return text && typeof text === 'string' && text.length > 0 && !isGenerated;
        }
      );

      // Calculate multi-locale translation status - ALL active locales must be translated for TRUE
      const calculateMultiLocaleTranslationStatus = (): boolean | null => {
        if (!hasAnyManualContent) {
          return null; // No manual content anywhere
        }

        // Check if ALL active locales have manual translation
        const allActiveLocalesTranslated = [...activeLocales].every((locale) => {
          const i18n = organisation.i18n?.[locale];
          if (!i18n) return false; // No entry for this locale

          const text = i18n[textField as keyof typeof i18n];
          const isGenerated = i18n[genField as keyof typeof i18n] ?? false;

          return text && typeof text === 'string' && text.length > 0 && !isGenerated;
        });

        return allActiveLocalesTranslated;
      };

      const multiLocaleStatus = calculateMultiLocaleTranslationStatus();

      const allLocalesMatch = [...activeLocales].every((locale) => {
        const filterValue = filters[filterKey]?.[locale];
        if (filterValue === null) return true;
        // Use multi-locale status for filtering
        if (filterValue === true) {
          return multiLocaleStatus === true; // ALL locales must be translated
        } else {
          return multiLocaleStatus === false; // Some locales are not translated (but manual content exists)
        }
      });

      if (!allLocalesMatch) return false;
    }

    return true;
  };

  private filterOrganisationByImages = (
    organisation: Organisation,
    filters: ViewFilters['organisation']
  ): boolean => {
    if (filters.hasImage !== null) {
      const hasImages = organisation.image ? true : false;
      if (filters.hasImage !== hasImages) return false;
    }
    return true;
  };

  // ═══════════════════════
  // PROJECT VIEW FILTERS
  // ═══════════════════════

  applyProjectViewFilters = (entities: Resource[]): Resource[] => {
    const projects = entities as Project[];
    const filters = this.appCtx.state.viewFilters.project;
    if (!filters) return projects;

    // Determine active locales from filter state
    const activeLocales = new Set<Locale>();
    for (const [locale, isActive] of Object.entries(filters.translationLocales)) {
      if (isActive) {
        activeLocales.add(locale as Locale);
      }
    }

    return projects.filter((project) => {
      if (!this.filterProjectByStatus(project, filters)) return false;
      if (!this.filterProjectByAuthorship(project, filters)) return false;
      if (!this.filterProjectByTranslation(project, filters, activeLocales))
        return false;
      if (!this.filterProjectByImages(project, filters)) return false;
      return true;
    });
  };

  private filterProjectByStatus = (
    project: Project,
    filters: ViewFilters['project']
  ): boolean => {
    if (filters.isPublished !== null && project.isPublished !== filters.isPublished)
      return false;
    if (filters.isArchived !== null && project.isArchived !== filters.isArchived)
      return false;
    return true;
  };

  private filterProjectByAuthorship = (
    project: Project,
    filters: ViewFilters['project']
  ): boolean => {
    if (!project.i18n) {
      if (
        filters.hasName === true ||
        filters.hasContextualName === true ||
        filters.hasDescription === true ||
        filters.hasAttribution === true ||
        filters.hasLicense === true
      )
        return false;
      return true;
    }

    const allLocales = Object.keys(project.i18n) as Locale[];

    if (filters.hasName !== null) {
      const hasName = allLocales.some(
        (locale) =>
          project.i18n?.[locale]?.name &&
          project.i18n[locale]!.name!.length > 1 &&
          !project.i18n[locale]!.nameGen
      );
      if (hasName !== filters.hasName) return false;
    }

    if (filters.hasContextualName !== null) {
      const hasContextualName = allLocales.some(
        (locale) =>
          project.i18n?.[locale]?.nameShort &&
          project.i18n[locale]!.nameShort!.length > 1 &&
          !project.i18n[locale]!.nameShortGen
      );
      if (hasContextualName !== filters.hasContextualName) return false;
    }

    if (filters.hasDescription !== null) {
      const hasDescription = allLocales.some(
        (locale) =>
          project.i18n?.[locale]?.description &&
          project.i18n[locale]!.description!.length > 1 &&
          !project.i18n[locale]!.descriptionGen
      );
      if (hasDescription !== filters.hasDescription) return false;
    }

    if (filters.hasAttribution !== null) {
      const hasAttribution = allLocales.some(
        (locale) =>
          project.i18n?.[locale]?.attribution &&
          project.i18n[locale]!.attribution!.length > 1 &&
          !project.i18n[locale]!.attributionGen
      );
      if (hasAttribution !== filters.hasAttribution) return false;
    }

    if (filters.hasLicense !== null) {
      const hasLicense = allLocales.some(
        (locale) =>
          project.i18n?.[locale]?.license &&
          project.i18n[locale]!.license!.length > 1 &&
          !project.i18n[locale]!.licenseGen
      );
      if (hasLicense !== filters.hasLicense) return false;
    }

    return true;
  };

  private filterProjectByTranslation = (
    project: Project,
    filters: ViewFilters['project'],
    activeLocales: Set<Locale>
  ): boolean => {
    const translationChecks: {
      filterKey:
        | 'isNameTranslated'
        | 'isContextualNameTranslated'
        | 'isDescriptionTranslated'
        | 'isAttributionTranslated'
        | 'isLicenseTranslated';
      textField: 'name' | 'nameShort' | 'description' | 'attribution' | 'license';
      genField:
        | 'nameGen'
        | 'nameShortGen'
        | 'descriptionGen'
        | 'attributionGen'
        | 'licenseGen';
    }[] = [
      { filterKey: 'isNameTranslated', textField: 'name', genField: 'nameGen' },
      {
        filterKey: 'isContextualNameTranslated',
        textField: 'nameShort',
        genField: 'nameShortGen'
      },
      {
        filterKey: 'isDescriptionTranslated',
        textField: 'description',
        genField: 'descriptionGen'
      },
      {
        filterKey: 'isAttributionTranslated',
        textField: 'attribution',
        genField: 'attributionGen'
      },
      { filterKey: 'isLicenseTranslated', textField: 'license', genField: 'licenseGen' }
    ];

    for (const { filterKey, textField, genField } of translationChecks) {
      const isAnyLocaleFiltered = [...activeLocales].some(
        (locale) => filters[filterKey]?.[locale] !== null
      );
      if (!isAnyLocaleFiltered) continue;

      // First, check if ANY locale has manual (non-generated) content for this field
      const hasAnyManualContent = Object.values(project.i18n ?? {}).some(
        (i18n: any) => {
          const text = i18n?.[textField];
          const isGenerated = i18n?.[genField] ?? false;
          return text && typeof text === 'string' && text.length > 0 && !isGenerated;
        }
      );

      // Calculate multi-locale translation status - ALL active locales must be translated for TRUE
      const calculateMultiLocaleTranslationStatus = (): boolean | null => {
        if (!hasAnyManualContent) {
          return null; // No manual content anywhere
        }

        // Check if ALL active locales have manual translation
        const allActiveLocalesTranslated = [...activeLocales].every((locale) => {
          const i18n = project.i18n?.[locale];
          if (!i18n) return false; // No entry for this locale

          const text = i18n[textField as keyof typeof i18n];
          const isGenerated = i18n[genField as keyof typeof i18n] ?? false;

          return text && typeof text === 'string' && text.length > 0 && !isGenerated;
        });

        return allActiveLocalesTranslated;
      };

      const multiLocaleStatus = calculateMultiLocaleTranslationStatus();

      const allLocalesMatch = [...activeLocales].every((locale) => {
        const filterValue = filters[filterKey]?.[locale];
        if (filterValue === null) return true;
        // Use multi-locale status for filtering
        if (filterValue === true) {
          return multiLocaleStatus === true; // ALL locales must be translated
        } else {
          return multiLocaleStatus === false; // Some locales are not translated (but manual content exists)
        }
      });

      if (!allLocalesMatch) return false;
    }

    return true;
  };

  private filterProjectByImages = (
    project: Project,
    filters: ViewFilters['project']
  ): boolean => {
    if (filters.hasImage !== null) {
      const hasImages = project.image ? true : false;
      if (filters.hasImage !== hasImages) return false;
    }
    return true;
  };

  // ═══════════════════════
  // LAYER VIEW FILTERS
  // ═══════════════════════

  applyLayerViewFilters = (entities: Resource[]): Resource[] => {
    const layers = entities as Layer[];
    const filters = this.appCtx.state.viewFilters.layer;
    if (!filters) return layers;

    // Determine active locales from filter state
    const activeLocales = new Set<Locale>();
    for (const [locale, isActive] of Object.entries(filters.translationLocales)) {
      if (isActive) {
        activeLocales.add(locale as Locale);
      }
    }

    return layers.filter((layer) => {
      if (!this.filterLayerByStatus(layer, filters)) return false;
      if (!this.filterLayerByAuthorship(layer, filters)) return false;
      if (!this.filterLayerByTranslation(layer, filters, activeLocales)) return false;
      return true;
    });
  };

  private filterLayerByStatus = (
    layer: Layer,
    filters: ViewFilters['layer']
  ): boolean => {
    if (filters.isPublished !== null && layer.isPublished !== filters.isPublished)
      return false;
    if (filters.isArchived !== null && layer.isArchived !== filters.isArchived)
      return false;
    return true;
  };

  private filterLayerByAuthorship = (
    layer: Layer,
    filters: ViewFilters['layer']
  ): boolean => {
    if (!layer.i18n) {
      if (
        filters.hasName === true ||
        filters.hasContextualName === true ||
        filters.hasDescription === true
      )
        return false;
      return true;
    }

    const allLocales = Object.keys(layer.i18n) as Locale[];

    if (filters.hasName !== null) {
      const hasName = allLocales.some(
        (locale) =>
          layer.i18n?.[locale]?.name &&
          layer.i18n[locale]!.name!.length > 1 &&
          !layer.i18n[locale]!.nameGen
      );
      if (hasName !== filters.hasName) return false;
    }

    if (filters.hasContextualName !== null) {
      const hasContextualName = allLocales.some(
        (locale) =>
          layer.i18n?.[locale]?.nameShort &&
          layer.i18n[locale]!.nameShort!.length > 1 &&
          !layer.i18n[locale]!.nameShortGen
      );
      if (hasContextualName !== filters.hasContextualName) return false;
    }

    if (filters.hasDescription !== null) {
      const hasDescription = allLocales.some(
        (locale) =>
          layer.i18n?.[locale]?.description &&
          layer.i18n[locale]!.description!.length > 1 &&
          !layer.i18n[locale]!.descriptionGen
      );
      if (hasDescription !== filters.hasDescription) return false;
    }

    return true;
  };

  private filterLayerByTranslation = (
    layer: Layer,
    filters: ViewFilters['layer'],
    activeLocales: Set<Locale>
  ): boolean => {
    const translationChecks: {
      filterKey:
        | 'isNameTranslated'
        | 'isContextualNameTranslated'
        | 'isDescriptionTranslated';
      textField: 'name' | 'nameShort' | 'description';
      genField: 'nameGen' | 'nameShortGen' | 'descriptionGen';
    }[] = [
      { filterKey: 'isNameTranslated', textField: 'name', genField: 'nameGen' },
      {
        filterKey: 'isContextualNameTranslated',
        textField: 'nameShort',
        genField: 'nameShortGen'
      },
      {
        filterKey: 'isDescriptionTranslated',
        textField: 'description',
        genField: 'descriptionGen'
      }
    ];

    for (const { filterKey, textField, genField } of translationChecks) {
      const isAnyLocaleFiltered = [...activeLocales].some(
        (locale) => filters[filterKey]?.[locale] !== null
      );
      if (!isAnyLocaleFiltered) continue;

      // First, check if ANY locale has manual (non-generated) content for this field
      const hasAnyManualContent = Object.values(layer.i18n ?? {}).some((i18n: any) => {
        const text = i18n?.[textField];
        const isGenerated = i18n?.[genField] ?? false;
        return text && typeof text === 'string' && text.length > 0 && !isGenerated;
      });

      // Calculate multi-locale translation status - ALL active locales must be translated for TRUE
      const calculateMultiLocaleTranslationStatus = (): boolean | null => {
        if (!hasAnyManualContent) {
          return null; // No manual content anywhere
        }

        // Check if ALL active locales have manual translation
        const allActiveLocalesTranslated = [...activeLocales].every((locale) => {
          const i18n = layer.i18n?.[locale];
          if (!i18n) return false; // No entry for this locale

          const text = i18n[textField as keyof typeof i18n];
          const isGenerated = i18n[genField as keyof typeof i18n] ?? false;

          return text && typeof text === 'string' && text.length > 0 && !isGenerated;
        });

        return allActiveLocalesTranslated;
      };

      const multiLocaleStatus = calculateMultiLocaleTranslationStatus();

      const allLocalesMatch = [...activeLocales].every((locale) => {
        const filterValue = filters[filterKey]?.[locale];
        if (filterValue === null) return true;
        // Use multi-locale status for filtering
        if (filterValue === true) {
          return multiLocaleStatus === true; // ALL locales must be translated
        } else {
          return multiLocaleStatus === false; // Some locales are not translated (but manual content exists)
        }
      });

      if (!allLocalesMatch) return false;
    }

    return true;
  };

  // ═══════════════════════
  // TASK VIEW FILTERS
  // ═══════════════════════

  applyTaskViewFilters = (entities: Resource[]): Resource[] => {
    const tasks = entities as Task[];
    const filters = this.appCtx.state.viewFilters.task;
    if (!filters) return tasks;

    return tasks.filter((task) => {
      if (!this.filterTaskByStatus(task, filters)) return false;
      return true;
    });
  };

  private filterTaskByStatus = (task: Task, filters: ViewFilters['task']): boolean => {
    if (filters.isReviewed !== null && task.isReviewed !== filters.isReviewed)
      return false;
    return true;
  };

  // ═══════════════════════
  // HUB VIEW FILTERS
  // ═══════════════════════

  applyHubViewFilters = (entities: Resource[]): Resource[] => {
    const hubs = entities as Hub[];
    const filters = this.appCtx.state.viewFilters.hub;
    if (!filters) return hubs;

    // Determine active locales from filter state
    const activeLocales = new Set<Locale>();
    for (const [locale, isActive] of Object.entries(filters.translationLocales)) {
      if (isActive) {
        activeLocales.add(locale as Locale);
      }
    }

    return hubs.filter((hub) => {
      if (!this.filterHubByStatus(hub, filters)) return false;
      if (!this.filterHubByAuthorship(hub, filters)) return false;
      if (!this.filterHubByTranslation(hub, filters, activeLocales)) return false;
      if (!this.filterHubByImages(hub, filters)) return false;
      return true;
    });
  };

  private filterHubByStatus = (hub: Hub, filters: ViewFilters['hub']): boolean => {
    if (filters.isArchived !== null && hub.isArchived !== filters.isArchived)
      return false;
    return true;
  };

  private filterHubByAuthorship = (hub: Hub, filters: ViewFilters['hub']): boolean => {
    const allLocales = Object.keys(hub.i18n || {}) as Locale[];

    if (filters.hasName !== null) {
      const hasName = allLocales.some(
        (locale) =>
          hub.i18n?.[locale]?.name &&
          hub.i18n[locale]!.name!.length > 1 &&
          !hub.i18n[locale]!.nameGen
      );
      if (hasName !== filters.hasName) return false;
    }

    if (filters.hasContextualName !== null) {
      const hasContextualName = allLocales.some(
        (locale) =>
          hub.i18n?.[locale]?.nameShort &&
          hub.i18n[locale]!.nameShort!.length > 1 &&
          !hub.i18n[locale]!.nameShortGen
      );
      if (hasContextualName !== filters.hasContextualName) return false;
    }

    if (filters.hasDescription !== null) {
      const hasDescription = allLocales.some(
        (locale) =>
          hub.i18n?.[locale]?.description &&
          hub.i18n[locale]!.description!.length > 1 &&
          !hub.i18n[locale]!.descriptionGen
      );
      if (hasDescription !== filters.hasDescription) return false;
    }

    return true;
  };

  private filterHubByTranslation = (
    hub: Hub,
    filters: ViewFilters['hub'],
    activeLocales: Set<Locale>
  ): boolean => {
    const translationChecks: {
      filterKey:
        | 'isNameTranslated'
        | 'isContextualNameTranslated'
        | 'isDescriptionTranslated';
      textField: 'name' | 'nameShort' | 'description';
      genField: 'nameGen' | 'nameShortGen' | 'descriptionGen';
    }[] = [
      { filterKey: 'isNameTranslated', textField: 'name', genField: 'nameGen' },
      {
        filterKey: 'isContextualNameTranslated',
        textField: 'nameShort',
        genField: 'nameShortGen'
      },
      {
        filterKey: 'isDescriptionTranslated',
        textField: 'description',
        genField: 'descriptionGen'
      }
    ];

    for (const { filterKey, textField, genField } of translationChecks) {
      const isAnyLocaleFiltered = [...activeLocales].some(
        (locale) => filters[filterKey]?.[locale] !== null
      );
      if (!isAnyLocaleFiltered) continue;

      // First, check if ANY locale has manual (non-generated) content for this field
      const hasAnyManualContent = Object.values(hub.i18n ?? {}).some((i18n: any) => {
        const text = i18n?.[textField];
        const isGenerated = i18n?.[genField] ?? false;
        return text && typeof text === 'string' && text.length > 0 && !isGenerated;
      });

      // Calculate multi-locale translation status - ALL active locales must be translated for TRUE
      const calculateMultiLocaleTranslationStatus = (): boolean | null => {
        if (!hasAnyManualContent) {
          return null; // No manual content anywhere
        }

        // Check if ALL active locales have manual translation
        const allActiveLocalesTranslated = [...activeLocales].every((locale) => {
          const i18n = hub.i18n?.[locale];
          if (!i18n) return false; // No entry for this locale

          const text = i18n[textField as keyof typeof i18n];
          const isGenerated = i18n[genField as keyof typeof i18n] ?? false;

          return text && typeof text === 'string' && text.length > 0 && !isGenerated;
        });

        return allActiveLocalesTranslated;
      };

      const multiLocaleStatus = calculateMultiLocaleTranslationStatus();

      const allLocalesMatch = [...activeLocales].every((locale) => {
        const filterValue = filters[filterKey]?.[locale];
        if (filterValue === null) return true;
        // Use multi-locale status for filtering
        if (filterValue === true) {
          return multiLocaleStatus === true; // ALL locales must be translated
        } else {
          return multiLocaleStatus === false; // Some locales are not translated (but manual content exists)
        }
      });

      if (!allLocalesMatch) return false;
    }

    return true;
  };

  private filterHubByImages = (hub: Hub, filters: ViewFilters['hub']): boolean => {
    if (filters.hasImage !== null) {
      // Hubs don't have direct image relationships, this filter is not applicable
      return true;
    }
    return true;
  };

  /**
   * Filters features by property presence and values.
   *
   * Handles both classifier and specifier property types:
   * - Classifier: Checks for presence/absence of a selected value
   * - Specifier: For translatable properties, checks across all locales;
   *   for non-translatable, checks single value
   *
   * @param feature - The feature to evaluate
   * @param filters - Property filter settings (propertyId -> boolean)
   * @returns true if feature passes all property filters
   */
  private filterByProperties = (
    feature: Feature | FeatureFromCollection,
    filters: ViewFilters['feature']
  ): boolean => {
    const propertyFilters = filters.properties;

    const propertyFilterIds = Object.keys(propertyFilters).filter(
      (id) => propertyFilters[id] !== null
    );

    if (propertyFilterIds.length === 0) {
      return true; // No active property filters
    }

    const PropertyCache = this.appCtx.cache.property;

    for (const propertyId of propertyFilterIds) {
      const filterValue = propertyFilters[propertyId]; // true or false
      const propertyDef = PropertyCache.get(propertyId) as Property;
      const featureProp = feature.properties?.find((p) => p.propertyId === propertyId);

      if (!propertyDef) continue;

      if (propertyDef.type === 'classifier') {
        let hasValue = false;

        if (propertyDef.component === 'RangeField') {
          // RangeField classifier: check if value is not undefined, null, or empty string
          hasValue =
            featureProp?.value !== undefined &&
            featureProp?.value !== null &&
            featureProp?.value !== '';
        } else {
          // SelectField classifier (default): check if there's a propertyValueId
          hasValue = !!featureProp?.propertyValueId;
        }

        if (hasValue !== filterValue) return false;
      } else if (propertyDef.type === 'specifier') {
        // For "specifier" properties, the filter checks for the presence or absence of a value.
        // If the property is translatable, it checks all locales for values.
        // - If filterValue is true: the feature must have at least one non-empty value in any locale.
        // - If filterValue is false: the feature must have all locales empty for this property.
        if (propertyDef.isTranslatable) {
          const allLocaleValues = featureProp?.i18n
            ? Object.values(featureProp.i18n).map((t) => t.value)
            : [];
          if (filterValue === true) {
            // ASSERT: Only features with at least one non-empty value in any locale pass.
            const hasSomeValue = allLocaleValues.some((v) => v && v.length > 0);
            if (!hasSomeValue) return false;
          } else {
            // ASSERT: Only features with all locales empty for this property pass.
            const allAreEmpty = allLocaleValues.every((v) => !v || v.length === 0);
            if (!allAreEmpty) return false;
          }
        } else {
          // For non-translatable specifiers, check the single value.
          // - If filterValue is true: the feature must have a non-empty value.
          // - If filterValue is false: the feature must have an empty or missing value.
          const hasValue = !!featureProp?.value && featureProp.value.length > 0;
          if (hasValue !== filterValue) return false;
        }
      }
    }

    return true;
  };

  getFilteredTask = () => {
    let query = this.appCtx.state.filters.task.text || '';
    // FULL SET
    let result: Task[] = this.appCtx.state.resources.task;

    // TEXT FILTER
    if (query) {
      result = result.filter((entity) => {
        // Get related entities using IDs
        const feature = this.appCtx.state.resources.feature.find(
          (f) => f.id === entity.featureId
        );
        const project = this.appCtx.state.resources.project.find(
          (p) => p.id === entity.projectId
        );
        const organisation = this.appCtx.state.resources.organisation.find(
          (o) => o.id === entity.organisationId
        );

        return (
          (feature &&
            this.appCtx.textFilter(FirstClassResource.feature, feature, query)) ||
          (project &&
            this.appCtx.textFilter(FirstClassResource.project, project, query)) ||
          (organisation &&
            this.appCtx.textFilter(
              FirstClassResource.organisation,
              organisation,
              query
            )) ||
          entity.message?.toLowerCase().includes(query.toLowerCase())
        );
      });
    }

    return result;
  };

  getFilteredHub = () => {
    if (!this.appCtx.isSuperAdmin()) return [];
    let query = this.appCtx.state.filters.hub.text || '';
    // FULL SET
    let result: Hub[] = this.appCtx.state.resources.hub;

    // Use cache if state is empty but cache has data
    if (result.length === 0) {
      const cacheHubs = Array.from(this.appCtx.cache.hub.values());
      if (cacheHubs.length > 0) {
        result = cacheHubs;
      }
    }

    // TEXT FILTER - Simple text search on code and domain
    if (query) {
      result = result.filter(
        (entity) =>
          entity.code?.toLowerCase().includes(query.toLowerCase()) ||
          entity.domain?.toLowerCase().includes(query.toLowerCase()) ||
          entity.organisations?.some((org) =>
            org.i18n?.[getLocale()]?.name?.toLowerCase().includes(query.toLowerCase())
          )
      );
    }

    return result;
  };

  // ═══════════════════════
  // ADMIN FILTERS :: DERIVED
  // ═══════════════════════

  // Filtered Helpers
  filteredOrganisations = $derived.by(() => {
    return this.appCtx.filteredOrganisations;
  });
  filteredProjects = $derived.by(() => {
    return this.appCtx.filteredProjects;
  });
  filteredLayers = $derived.by(() => {
    return this.appCtx.filteredLayers;
  }) as Layer[];
  filteredFeatures = $derived.by(() => {
    return this.appCtx.filteredFeatures;
  });

  filteredTasks = $derived.by(() => {
    this.appCtx.state.resources.task;
    this.appCtx.state.filters.task;
    return this.getFilteredTask();
  });
  filteredHubs = $derived.by(() => {
    if (!this.appCtx.isSuperAdmin()) return [];
    this.appCtx.state.resources.hub;
    this.appCtx.state.filters.hub;
    return this.getFilteredHub();
  });

  // ═══════════════════════
  // ADMIN FILTERS :: MUTATION
  // ═══════════════════════

  resetViewFilters = () => {
    this.appCtx.state.viewFilters = structuredClone(viewFilters);
  };

  // ═══════════════════════
  // ADMIN PREFERENCES
  // ═══════════════════════

  setAdminPreference = (code: keyof AdminPreferences, value: boolean) => {
    if (!this.appCtx.user) return;
    if (!(this.appCtx.user as CurrentUser).preferences?.admin) {
      (this.appCtx.user as CurrentUser).preferences!.admin = {
        isAdminMapCollapsed: false,
        isPrimaryPanelCollapsed: false,
        isPrimaryPanelAutoHide: false
      };
    }
    if (!this.appCtx.user.preferences.admin) {
      this.appCtx.user.preferences.admin = { [code]: value };
    }
    this.appCtx.user.preferences.admin![code] = value;
    debouncedUpdateUserPreferences(
      (this.appCtx.user as CurrentUser).id,
      (this.appCtx.user as CurrentUser).preferences as UserPreferences
    );
  };

  // ═══════════════════════
  // UTILS :: LAYOUT
  // ═══════════════════════

  hasManyEntities = (resource: FirstClassResource | HierarchicalResource) => {
    return this.appCtx.state.resources[resource as keyof FilteredResources].length > 3;
  };

  isViewportContained = $derived(
    this.appCtx.state.nav.resourceRef == false ||
      this.appCtx.state.nav.facet == 'address' ||
      this.appCtx.state.nav.facet == 'images' ||
      (this.appCtx.state.nav.resourceType == 'feature' &&
        (this.appCtx.state.nav.facet == 'core' ||
          this.appCtx.state.nav.facet == false)) ||
      (this.activeResourceType == 'task' && this.activeResourceRef)
  );

  isShowIndex = $derived(
    this.activeResourceType &&
      (this.activeResourceRef === null || this.activeResourceRef === false)
  );
}

export const ADMINCTX_KEY = Symbol('adminCtx');

export const setAdminCtx = (queryClient: QueryClient, appCtx: AppCtx) =>
  setContext(ADMINCTX_KEY, new AdminCtx(queryClient, appCtx));

export const getAdminCtx = (): AdminCtx => {
  const ctx = getContext(ADMINCTX_KEY);
  if (!ctx) {
    // Return a safe proxy object that prevents errors when AdminCtx isn't ready
    return new Proxy({} as any, {
      get(target, prop) {
        if (prop === 'isInitialised') return false;
        if (prop === 'setFacet') return () => {}; // No-op function
        if (prop === 'setHeaderForIndex') return () => {}; // No-op function
        if (prop === 'setHeaderForEntity') return () => {}; // No-op function
        if (prop === 'filteredOrganisations') return [];
        if (prop === 'filteredProjects') return [];
        if (prop === 'filteredLayers') return [];
        if (prop === 'filteredFeatures') return [];
        if (prop === 'filteredTasks') return [];
        if (prop === 'filteredHubs') return [];
        if (prop === 'activeResourceType') return false;
        if (prop === 'activeResourceRef') return false;
        if (prop === 'activeFacet') return false;
        if (prop === 'isShowIndex') return false;
        if (prop === 'isViewportContained') return true;
        if (prop === 'appCtx')
          return {
            isInitialised: false,
            state: { resources: {} }
          };
        return undefined;
      }
    }) as AdminCtx;
  }
  return ctx as AdminCtx;
};
