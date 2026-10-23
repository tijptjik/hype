import { mount } from 'svelte'
import Fixture from './components/FeatureAddress3dFixture.svelte'
import { emptyFeatureAddress } from '#lib/addresses/featureAddress.js'
import { structurePlaceAddress } from '#lib/addresses/nameCatalogue.js'
import '#lib/styles/app.css'
const initialAddress = structurePlaceAddress(
  emptyFeatureAddress({ en: '25 Lyndhurst Terrace' }),
  [{ id: 'example', names: { en: 'LYNDHURST TERRACE' }, divisionCodes: ['CW'] }],
)
mount(Fixture, { target: document.getElementById('app')!, props: { initialAddress } })
