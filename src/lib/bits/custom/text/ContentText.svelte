<script lang="ts">
// I18N
import { getLocale } from '#lib/i18n.js'
import { contentLocaleOrder, resolveContentField } from '#lib/i18n/automatic.js'
// CONTEXT
import { getSurfaceCtx } from '#lib/context/resourceView.svelte.js'
// SERVICES
import { requestAutomaticResourceTranslations } from '#lib/client/services/automaticTranslations.js'
// COMPONENTS
import AutomaticTranslationIndicator from './AutomaticTranslationIndicator.svelte'

let {
  record,
  field = 'name',
  resource,
  fallback = '',
}: {
  record: { id?: string; modifiedAt?: string; i18n?: Record<string, unknown> | null }
  field?: string
  resource?: 'feature' | 'hub' | 'organisation' | 'project' | 'layer'
  fallback?: string
} = $props()
const context = getSurfaceCtx()
const preferences = $derived(context.getUserPreferences())
const target = $derived(preferences.contentLocale ?? getLocale())
const sourceVersion = $derived(record.modifiedAt ?? JSON.stringify(record.i18n))
let cached = $state<Record<string, unknown>>({})
const resolution = $derived(
  resolveContentField(
    { ...record.i18n, ...cached },
    field,
    target,
    preferences.allowMachineTranslation,
  ),
)
$effect(() => {
  const id = record.id
  const kind = resource
  const version = sourceVersion
  const language = target
  const account = context.account.revision
  cached = {}
  if (!id || !kind || !preferences.allowMachineTranslation) return
  const current = resolveContentField(record.i18n ?? {}, field, language, true)
  if (current.locale === contentLocaleOrder(language)[0] && current.kind !== 'missing')
    return
  let active = true
  void requestAutomaticResourceTranslations(context, kind, id, version, language).then(
    rows => {
      if (active && context.account.revision === account) cached = rows
    },
  )
  return () => {
    active = false
  }
})
</script>

{resolution.value || fallback}<AutomaticTranslationIndicator {resolution} />
