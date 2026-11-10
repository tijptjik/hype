<script lang="ts">
// SHARED FORM
import { configureForm } from '#lib/factories.svelte.js'
import FeatureIntentSettings from '#lib/bits/patterns/forms/featureIntent/FeatureIntentSettings.svelte'
import { FeatureIntentSettingsFormData } from '#lib/features/intents.js'
// TYPES
import type { RemoteForm, RemoteFormInput } from '$app/server'
const source = {
  meta: { mode: 'update', id: 'project', updatedAt: 'before' },
  data: {
    code: 'fixture',
    properties: [{ key: 'retained' }],
    featureIntentSettings: undefined as string | undefined,
  },
}
type Input = typeof source & RemoteFormInput
let value = $state(structuredClone(source))
let element = $state<HTMLFormElement>()
let issues = $state<{ message: string; path: string[] }[]>([])
let revision = $state('before')
let saved = $state(false)
const fake = {
  fields: {
    value: () => value,
    set: (next: typeof source) => {
      value = structuredClone(next)
    },
    issues: () => undefined,
    allIssues: () => issues,
  },
  result: undefined as { data: { id: string; modifiedAt: string } } | undefined,
  preflight: (): unknown => fake,
  validate: async () => {
    if (!element) return
    const packet = new FormData(element)
    const parsed = FeatureIntentSettingsFormData.safeParse(
      packet.get('data.featureIntentSettings/fixture') ?? undefined,
    )
    issues = parsed.success
      ? []
      : [{ message: 'Invalid model settings', path: ['data', 'featureIntentSettings'] }]
  },
  enhance: (
    callback: (instance: {
      element: HTMLFormElement
      fields: { value: () => typeof source }
      submit: () => Promise<void>
    }) => Promise<void>,
  ) => ({
    onsubmit: async (event: SubmitEvent) => {
      event.preventDefault()
      if (!element) return
      const packet = new FormData(element)
      await callback({
        element,
        fields: fake.fields,
        submit: async () => {
          const modelPatch = FeatureIntentSettingsFormData.parse(
            packet.get('data.featureIntentSettings/fixture') ?? undefined,
          )
          Object.assign(globalThis, {
            submittedModelPacket: Object.fromEntries(packet),
            ...(modelPatch ? { savedPolicy: modelPatch } : {}),
          })
          value = {
            ...value,
            data: { ...value.data, featureIntentSettings: undefined },
          }
          revision = String(Number.parseInt(revision, 10) + 1 || 1)
          fake.result = { data: { id: 'project', modifiedAt: revision } }
          saved = true
        },
      })
    },
  }),
}
const configured = configureForm<Input>(() => ({
  form: { for: () => fake } as unknown as RemoteForm<Input, unknown>,
  key: 'fixture',
  data: source as Input,
  formEl: element,
  tabResource: 'project',
}))
const model = $derived(configured())
</script>
<form class="min-w-0" bind:this={element} {...model.attributes}>
  <nav class="flex gap-3 p-4">
    <button type="submit">Save form</button>
    <button type="button" onclick={() => model.reset()}>Discard form</button>
    <span data-form-dirty>{String(model.dirty)}</span>
    <span data-dirty-tabs>{model.dirtyTabs.join(',')}</span>
  </nav>
  <input type="hidden" name="meta.id/fixture" value="project">
  <input type="hidden" name="data.code/fixture" value={value.data.code}>
  <input type="hidden" name="data.properties[0].key/fixture" value="retained">
  {#if value.data.featureIntentSettings !== undefined}
    <input
      type="hidden"
      name="data.featureIntentSettings/fixture"
      value={value.data.featureIntentSettings}
    >
  {/if}
  <FeatureIntentSettings
    scopeType="project"
    scopeId="project"
    {revision}
    draft={value.data.featureIntentSettings}
    onDraftChange={draft => {
      value = { ...value, data: { ...value.data, featureIntentSettings: draft } }
    }}
  />
  {#if saved}
    <p role="status">Form saved.</p>
  {/if}
</form>
