<script lang="ts">
import FormI18nSourceBar from '#lib/bits/patterns/forms/formI18nSection/components/FormI18nSourceBar.svelte'
import FormI18nInlineRow from '#lib/bits/patterns/forms/formI18nSection/components/FormI18nInlineRow.svelte'
const original =
  '# Policy\n\n**Bold** and [Link](https://example.com)\n\n| Party | Role |\n| --- | --- |\n| HYPE | Controller |\n\nContact<br>Hong Kong'
let value = $state(original)
let before = ''
let saved = $state('')
</script>
{#snippet translationActions()}
  <FormI18nSourceBar
    compact
    visible
    sources={[
      { locale: 'en', label: 'English', accessibleLabel: 'Translate from English' },
    ]}
    label="Translate from"
    onTranslate={() => (value = '# Translated from toolbar')}
  />
{/snippet}
<form
  onsubmit={event => {
    event.preventDefault()
    saved = String(new FormData(event.currentTarget).get('policy'))
  }}
  class="mx-auto max-w-3xl p-4"
>
  <FormI18nInlineRow
    {value}
    toolbarActions={translationActions}
    label="Privacy Policy"
    multiline
    markdown
    editable
    showVerification={false}
    required={false}
    issues={undefined}
    attrs={{
      name: 'policy',
      oninput: (event: Event) => (value = (event.target as HTMLTextAreaElement).value),
    }}
    onStart={() => (before = value)}
    onCancel={() => (value = before)}
    onClear={() => (value = '')}
  />
  <button type="submit">Save</button>
  <button
    type="button"
    onclick={() => (value = '# Translated\n\nExternal replacement')}
  >
    Replace
  </button>
  <button type="button" onclick={() => (value = '<p>Legacy <strong>HTML</strong></p>')}>
    Legacy
  </button>
  <button
    type="button"
    onclick={() =>
      (value = Array.from(
        { length: 35 },
        (_, i) =>
          `## Section ${i + 1}\n\nPolicy paragraph with **bold** and links for long document verification.`,
      ).join('\n\n'))}
  >
    Long document
  </button>
  <output data-saved>{saved}</output><output data-value>{value}</output>
</form>
