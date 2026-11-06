<script lang="ts">
import { configureForm } from '#lib/factories.svelte.js'
import { setResponsiveCtx } from '#lib/context/responsive.svelte.js'
import { updateFormData } from '#lib/client/services/form.js'
import { toOrganisationFormInput } from '#lib/client/services/organisation.js'
import {
  readOrganisationSettingsForm,
  OrganisationSettingsFormSchema,
} from '#lib/organisations/settings.js'
import { ContentLocaleSettingsSchema } from '#lib/content-locales/settings.js'
import {
  readChatAppearance,
  DEFAULT_CHAT_APPEARANCE,
} from '#lib/messaging/appearance.js'
import ChatBackgroundSettings from '#lib/bits/patterns/messaging/ChatBackgroundSettings.svelte'
// TYPES
import type { RemoteForm, RemoteFormInput } from '$app/server'
import type { FormDataUpdaterForm } from '#lib/client/services/form.types.js'
import type { OrganisationSettingsPatch } from '#lib/organisations/settings.js'

type EditorInput = ReturnType<typeof toOrganisationFormInput>
type TransportInput = EditorInput & RemoteFormInput
type FormResult = { data: { id: string; modifiedAt: string } }
type ValidationIssue = { message: string; path: (string | number)[] }
type Submission = {
  element: HTMLFormElement | undefined
  fields: { value: () => EditorInput }
  submit: () => Promise<void>
}
setResponsiveCtx()
const source = {
  id: 'fixture',
  code: 'fixture',
  modifiedAt: 'before',
  settings: ContentLocaleSettingsSchema.parse({
    contentLocales: ['en'],
    messagingAppearance: { ...DEFAULT_CHAT_APPEARANCE },
  }),
}
let value = $state(toOrganisationFormInput(source))
let editing = $state(false)
let formElement = $state<HTMLFormElement>()
let validationIssues = $state<ValidationIssue[]>([])
let saves = $state(0)
const fake = {
  fields: {
    set: (next: EditorInput) => {
      value = next
    },
    value: () => value,
    issues: () => undefined,
    allIssues: () => validationIssues,
  },
  result: undefined as FormResult | undefined,
  validate: async () => {
    const parsed = OrganisationSettingsFormSchema.safeParse(value.data.settings)
    validationIssues = parsed.success
      ? []
      : parsed.error.issues.map(issue => ({
          ...issue,
          path: ['data', 'settings', ...issue.path.map(String)],
        }))
  },
  preflight: () => fake,
  enhance: (callback: (submission: Submission) => Promise<void>) => ({
    onsubmit: async (event: SubmitEvent) => {
      event.preventDefault()
      await callback({
        element: formElement,
        fields: fake.fields,
        submit: async () => {
          const settings = OrganisationSettingsFormSchema.parse(value.data.settings)
          ;(
            window as Window & { submittedSettings?: OrganisationSettingsPatch }
          ).submittedSettings = settings
          saves += 1
          fake.result = { data: { id: 'fixture', modifiedAt: 'after' } }
        },
      })
    },
  }),
}
const configured = configureForm<TransportInput>(() => ({
  form: { for: () => fake } as unknown as RemoteForm<TransportInput, FormResult>,
  key: 'fixture',
  data: toOrganisationFormInput(source) as TransportInput,
  formEl: formElement,
  onresult: ({ success }) => {
    if (success) editing = false
  },
}))
const model = $derived(configured())
const settings = $derived(
  readOrganisationSettingsForm(model.form.fields.value().data?.settings),
)
const appearance = $derived(
  settings.messagingAppearance ?? readChatAppearance(undefined),
)
</script>
<div class="bits-theme bg-background text-foreground min-h-screen">
  <nav class="flex flex-wrap gap-4 p-4">
    <button
      type="button"
      onclick={() => {
        editing = true
      }}
    >
      Edit organisation
    </button>
    <button
      type="button"
      disabled={!editing}
      onclick={() => {
        model.reset()
        editing = false
      }}
    >
      Cancel
    </button>
    <button
      type="button"
      disabled={!editing || !model.dirty || model.submitting}
      onclick={() => model.requestSubmit()}
    >
      Save organisation
    </button>
    <span role="status"
      >{model.dirty ? 'Unsaved changes' : 'Saved'}
      · {saves} submissions</span
    >
  </nav>
  <form bind:this={formElement} {...model.attributes}>
    <input type="hidden" name="data.settings" value={JSON.stringify(settings)}>
    <ChatBackgroundSettings
      {appearance}
      disabled={!editing || model.submitting}
      issues={validationIssues.map(issue => issue.message)}
      onChange={appearance => {
        if (!editing || model.submitting) return
        updateFormData(
          model.form as unknown as FormDataUpdaterForm<EditorInput['data']>,
          data => ({
            ...data,
            settings: { ...settings, messagingAppearance: appearance },
          }),
        )
      }}
    />
  </form>
</div>
