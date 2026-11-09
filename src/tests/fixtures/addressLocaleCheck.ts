import { mount } from 'svelte'
import Fixture from './components/FeatureAddress3dFixture.svelte'
import { emptyFeatureAddress } from '#lib/addresses/featureAddress.js'
import { setAddressName } from '#lib/addresses/nameCatalogue.js'
import '#lib/styles/app.css'
let address = setAddressName(emptyFeatureAddress(), 'buildingName', {
  id: 'fixture',
  names: { en: 'Test Building', 'zh-hant': '測試大廈' },
  divisionCodes: [],
})
address = {
  ...address,
  overrides: {
    ...address.overrides,
    en: {
      ...address.overrides.en,
      unitPortion: 'Side door',
      phaseExpression: 'Phase 2',
      premisesName: 'Test Estate',
    },
    'zh-hant': {
      ...address.overrides['zh-hant'],
      unitPortion: '側門',
      phaseExpression: '二期',
      premisesName: '測試屋苑',
    },
  },
  accessHints: { en: 'Use the side entrance' },
}
mount(Fixture, {
  target: document.getElementById('app')!,
  props: { initialAddress: address, translations: true, responsiveViewport: true },
})
