<script lang="ts">
// COMPONENTS
import { FormMapStyleSection } from '#lib/bits/patterns/forms/formMapStyleSection/index.js'
// MAP
import { SELECTABLE_MAP_STYLE_CATALOG } from '#lib/map/styles/catalog.js'
import { getMapStyleCatalogI18n } from '#lib/map/styles/i18n.js'
import { getMapStyleRenderAssetPath } from '#lib/map/styles/render.shared.js'
import { LayerMetadataSchema } from '#lib/db/zod/schema/layer.js'
// TYPES
import type { MapStyleSelectionItem } from '#lib/bits/patterns/forms/formMapStyleSection/formMapStyleSection.types.js'

let code = $state<string | undefined>(undefined)
let submitted = $state('')
const options = SELECTABLE_MAP_STYLE_CATALOG.map(entry => ({
  id: entry.key,
  code: entry.key,
  previewImagePath: getMapStyleRenderAssetPath(entry.key),
  i18n: getMapStyleCatalogI18n(entry.key),
}))
const inherited: MapStyleSelectionItem = {
  id: 'project-default',
  code: '__project-default__',
  i18n: { en: { name: 'Project Default' } },
}
const selected = $derived(
  code === undefined
    ? inherited
    : (options.find(option => option.code === code) ?? null),
)
const inputs = $derived(
  code === undefined
    ? []
    : [{ type: 'hidden', name: 'data.metadata.mapStyleCode', value: code }],
)
/**
 * Controls the shared picker for manual visual checks.
 * @param selection - Chosen explicit or automatic style.
 * @returns Nothing.
 */
function select(selection: MapStyleSelectionItem): void {
  code = selection.code === '__project-default__' ? undefined : selection.code
}
/**
 * Shows the real HTML input and normalized metadata contract without writing a layer.
 * @param event - Native form submit event.
 * @returns Nothing.
 */
function inspect(event: SubmitEvent): void {
  event.preventDefault()
  const form = event.currentTarget as HTMLFormElement
  const data = new FormData(form)
  submitted = JSON.stringify(
    LayerMetadataSchema.parse(
      data.has('data.metadata.mapStyleCode')
        ? { mapStyleCode: data.get('data.metadata.mapStyleCode') }
        : {},
    ),
  )
}
</script>
<form class="max-w-3xl bg-panel p-6 text-foreground" onsubmit={inspect}>
  <FormMapStyleSection
    title="Map style"
    availableMapStyles={options}
    selectedMapStyle={selected}
    additionalMapStyles={[inherited]}
    hiddenMapStyleInputAttrs={inputs}
    onSelectMapStyle={select}
  />
  <button type="submit" class="mt-4 rounded border border-border px-4 py-2">
    Inspect submission
  </button>
  <output class="block p-3">{submitted}</output>
</form>
