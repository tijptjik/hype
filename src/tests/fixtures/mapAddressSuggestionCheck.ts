// SVELTE
import { mount } from 'svelte'
// COMPONENTS
import MapAddressSuggestion from '#lib/bits/patterns/forms/formFeatureAddress/MapAddressSuggestion.svelte'
// STYLES
import '#lib/styles/app.css'

mount(MapAddressSuggestion, {
  target: document.getElementById('app')!,
  props: {
    parts: { block: { type: 'tower', ref: 'B', label: 'Tower B' } },
    onApply: () => {
      document.body.dataset.applied = 'tower:B'
    },
    onDismiss: () => {
      document.body.dataset.dismissed = 'true'
    },
  },
})
