// SVELTE
import { onMount } from 'svelte'
// I18N
import { m } from '#lib/i18n.js'
import {
  getLocale as getRuntimeLocale,
  overwriteGetLocale,
} from '#lib/paraglide/runtime.js'
import { embedLabel } from '#lib/embed/presentation.js'
import { embedLanguages } from '#lib/embed/config.js'
import { embedCopy } from '#lib/embed/copy.js'
// ENUMS
import { Panel } from '#lib/enums.js'
// TYPES
import type { useEmbedModel } from './useEmbedModel.svelte'
import type {
  ResourcePanelModel,
  ResourcePanelRow,
  ResourcePanelSection,
} from '#lib/bits/patterns/resourcePanel/resourcePanel.types.js'
import type { EmbedSettingsModel } from '#lib/bits/patterns/settingsPanel/settingsPanel.types.js'
import type { PanelProps } from '#lib/bits/patterns/panels/panel.types.js'
import type { Locale, LocaleKey } from '#lib/types.js'

/** Supplies ordinary panel renderers with embed-local selection and settings.
 * @param model Public embed data owner. @returns Shared panel models and navigation.
 * @remarks No app/account context is initialized. Searching a section never widens its source set.
 */
export function useEmbedPanels(model: ReturnType<typeof useEmbedModel>) {
  let activePanel = $state<'maps' | 'filters' | 'settings' | null>(null)
  let search = $state({ organisation: '', project: '', layer: '', feature: '' })
  let pendingLocale = $state<Locale | null>(null)
  const layers = $derived(model.payload?.layers ?? [])
  const copy = $derived(embedCopy(model.lang))
  const locale = $derived(model.lang.toLowerCase() as Locale)
  const localeKey = $derived<LocaleKey>(
    model.lang === 'zh-Hant' ? 'zhHant' : model.lang === 'zh-Hans' ? 'zhHans' : 'en',
  )
  // Bind shared translations to iframe-local state, including when third-party cookies are blocked.
  // Restore the runtime getter if this surface is disposed by client-side navigation.
  onMount(() => {
    const previous = getRuntimeLocale
    overwriteGetLocale(() => model.lang.toLowerCase() as Locale)
    return () => overwriteGetLocale(previous)
  })
  /** Creates geometry/visibility props for the existing panel shell.
   * @param panelType Shared panel identity. @returns Overlay props within this iframe.
   */
  function panelProps(panelType: Panel): PanelProps {
    return {
      panelType,
      position: panelType === Panel.prisms ? 'left' : 'right',
      scrollable: panelType !== Panel.prisms,
      inline: false,
      isNarrow: false,
      isAdmin: false,
    }
  }
  /** Toggles only included layers, independently of the section's search results.
   * @param ids Included descendants. @returns Nothing.
   */
  function toggleLayers(ids: string[]): void {
    model.active = ids.every(id => model.active.includes(id))
      ? model.active.filter(id => !ids.includes(id))
      : [...new Set([...model.active, ...ids])]
  }
  /** Projects a hierarchy choice onto the existing resource row.
   * @param id Resource identity. @param name Localized name. @param ids Included descendants.
   * @param breadcrumbs Parent labels. @returns Controlled row actions.
   */
  function resourceRow(
    id: string,
    name: string,
    ids: string[],
    breadcrumbs: string[] = [],
  ): ResourcePanelRow {
    return {
      id,
      name,
      multiline: true,
      breadcrumbs,
      selected: ids.every(id => model.active.includes(id)),
      active: false,
      enabled: ids.some(id => model.active.includes(id)),
      primaryLabel: name,
      toggleLabel: `${m.maps__title()}: ${name}`,
      onPrimary: () => toggleLayers(ids),
      onToggle: () => toggleLayers(ids),
      onIsolate: () => {
        model.active = ids
      },
    }
  }
  /** Builds a searchable section using only already-authorized rows.
   * @param id Section identity. @param title Localized heading. @param rows Complete included rows.
   * @returns Shared resource-section presentation.
   */
  function section(
    id: ResourcePanelSection['id'],
    title: string,
    rows: ResourcePanelRow[],
  ): ResourcePanelSection {
    return {
      id,
      title,
      search: search[id],
      rows: rows.filter(row =>
        `${row.name} ${row.breadcrumbs.join(' ')}`
          .toLocaleLowerCase()
          .includes(search[id].toLocaleLowerCase()),
      ),
      loading: model.loading,
      error: !!model.failure,
      viewKey: `embed-${id}`,
      defaultOpen: true,
      searchable: true,
      onSearch: value => {
        search[id] = value
      },
      onReset: () => {
        search[id] = ''
      },
      onNext: () => {},
      onRetry: () => {
        void model.load()
      },
      onVisible: () => {},
    }
  }
  const sections = $derived.by((): ResourcePanelSection[] => {
    const organisations = [
      ...new Map(
        layers.map(row => [
          row.organisationId,
          embedLabel(
            { i18n: row.organisationI18n },
            model.lang,
            'name',
            row.organisationName,
          ),
        ]),
      ).entries(),
    ]
    const projects = [
      ...new Map(
        layers.map(row => [
          row.projectId,
          embedLabel({ i18n: row.projectI18n }, model.lang, 'name', row.projectName),
        ]),
      ).entries(),
    ]
    const result: ResourcePanelSection[] = []
    if (organisations.length > 1)
      result.push(
        section(
          'organisation',
          m.maps__organisations(),
          organisations.map(([id, name]) =>
            resourceRow(
              id,
              name,
              layers.filter(row => row.organisationId === id).map(row => row.id),
            ),
          ),
        ),
      )
    if (projects.length > 1)
      result.push(
        section(
          'project',
          m.maps__projects(),
          projects.map(([id, name]) =>
            resourceRow(
              id,
              name,
              layers.filter(row => row.projectId === id).map(row => row.id),
            ),
          ),
        ),
      )
    if (layers.length > 1)
      result.push(
        section(
          'layer',
          m.maps__layers(),
          layers.map(row =>
            resourceRow(row.id, embedLabel(row, model.lang, 'name', row.name), [
              row.id,
            ]),
          ),
        ),
      )
    result.push(
      section(
        'feature',
        copy.places,
        model.visible.map(feature => {
          const name = embedLabel(feature, model.lang, 'title', feature.id)
          return {
            id: feature.id,
            name,
            breadcrumbs: [],
            selected: false,
            active: model.selected?.id === feature.id,
            enabled: true,
            primaryLabel: name,
            toggleLabel: name,
            actionOnly: true,
            multiline: true,
            onPrimary: () => {
              model.select(feature.id)
              activePanel = null
            },
            onToggle: () => {},
          }
        }),
      ),
    )
    return result
  })
  const resources: ResourcePanelModel = {
    get panel() {
      return panelProps(Panel.prisms)
    },
    get open() {
      return activePanel === 'maps'
    },
    get title() {
      return copy.maps
    },
    get sections() {
      return sections
    },
    showInfo: false,
    onClose: () => {
      activePanel = null
    },
    get loadError() {
      return !!model.failure
    },
    onRetryFeatures: () => {
      void model.load()
    },
  }
  const settings: EmbedSettingsModel = {
    mode: 'embed',
    get panel() {
      return panelProps(Panel.settings)
    },
    get open() {
      return activePanel === 'settings'
    },
    onClose: () => {
      activePanel = null
    },
    get theme() {
      return model.theme
    },
    onTheme: value => {
      model.theme = value
    },
    language: {
      get availableLocales() {
        return (model.payload?.config.languages ?? embedLanguages).map(
          value => value.toLowerCase() as Locale,
        )
      },
      get currentLocale() {
        return locale
      },
      get currentLocaleKey() {
        return localeKey
      },
      get pendingLocale() {
        return pendingLocale
      },
      async handleLocaleChange(value: Locale): Promise<void> {
        if (
          !(model.payload?.config.languages ?? embedLanguages).some(
            item => item.toLowerCase() === value,
          )
        )
          return
        pendingLocale = value
        try {
          model.lang =
            value === 'zh-hant' ? 'zh-Hant' : value === 'zh-hans' ? 'zh-Hans' : 'en'
        } finally {
          pendingLocale = null
        }
      },
    },
  }
  return {
    resources,
    settings,
    filterShell: {
      get panel() {
        return panelProps(Panel.filters)
      },
      get open() {
        return activePanel === 'filters'
      },
      onClose: () => {
        activePanel = null
      },
    },
    get active() {
      return activePanel
    },
    toggle(value: NonNullable<typeof activePanel>): void {
      activePanel = activePanel === value ? null : value
    },
    close(): void {
      activePanel = null
    },
  }
}
