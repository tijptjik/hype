// SVELTE
import { mount } from 'svelte'
// COMPONENTS
import Fixture from './components/FeatureAddress3dFixture.svelte'
// ADDRESS
import { emptyFeatureAddress } from '#lib/addresses/featureAddress.js'
// STYLES
import '#lib/styles/app.css'

const address = emptyFeatureAddress()
address.overrides.en = { premisesName: 'Pretty Garden' }
const candidate = emptyFeatureAddress({
  en: 'PRETTY GARDEN, 75, KO PO TSUEN, KAM TIN, NT',
})
candidate.overrides.en = {
  premisesName: 'Pretty Garden',
  buildingNumberExpression: '75',
}
mount(Fixture, {
  target: document.getElementById('app')!,
  props: {
    initialAddress: address,
    candidates: [candidate],
    displayAddressInToolbar: true,
    isLoading: location.search.includes('loading'),
    onPreviewCandidate: candidate => {
      document.body.dataset.preview = candidate ? 'candidate' : 'location'
    },
  },
})
