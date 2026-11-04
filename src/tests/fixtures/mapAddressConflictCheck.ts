// SVELTE
import { mount } from 'svelte'
// COMPONENTS
import MapAddressConflict from '#lib/bits/patterns/forms/formFeatureAddress/MapAddressConflict.svelte'
// STYLES
import '#lib/styles/app.css'
mount(MapAddressConflict, {
  target: document.getElementById('app')!,
  props: {
    conflicts: [{ field: 'number', selected: '238', mapped: '242-244' }],
    onReview: () => {
      document.body.dataset.review = 'true'
    },
    onAccept: () => {
      document.body.dataset.accept = 'true'
    },
  },
})
