import { mount } from 'svelte'
import '#lib/styles/app.css'
import DraftSearch from '#lib/bits/patterns/forms/featureLocation/DraftFeatureLocationSearch.svelte'
import { emptyFeatureAddress } from '#lib/addresses/featureAddress.js'
const target = document.getElementById('app')
if (!target) throw new Error('Missing fixture target')
const search = mount(DraftSearch, {
  target,
  props: { active: true, focusRequest: 0, onSelect: () => {} },
})
const building = new URLSearchParams(window.location.search).has('building')
search.restoreProgress({
  ...search.getProgress(),
  accepted: true,
  linked: true,
  selected: {
    id: 'location:bakery',
    kind: building ? 'building' : 'establishment',
    names: { en: building ? 'Garden Bakery' : 'A1 Bakery' },
    ...(building
      ? { buildingSource: { id: 'garden', release: 'r1', addressId: 'second' } }
      : { identity: { locationId: 'bakery', revisionId: 'r1' } }),
    address: emptyFeatureAddress(),
  },
})
