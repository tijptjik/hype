import { mount } from 'svelte'
import '#lib/styles/app.css'
import DraftSearch from '#lib/bits/patterns/forms/featureLocation/DraftFeatureLocationSearch.svelte'
const target = document.getElementById('app')
if (!target) throw new Error('Missing fixture target')
mount(DraftSearch, {
  target,
  props: {
    active: true,
    focusRequest: 1,
    onSelect: () => {},
    onDropPin: () => {},
    onMapCandidates: markers => {
      document.body.dataset.markers = JSON.stringify(markers)
    },
  },
})
