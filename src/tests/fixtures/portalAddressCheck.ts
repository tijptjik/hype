import { mount } from 'svelte'
import Address from '#lib/bits/patterns/cards/featureCard/components/content/FeatureCardContentAddress.svelte'
import '#lib/styles/app.css'
const target = document.getElementById('app')!
target.style.cssText =
  'position:absolute;right:24px;top:220px;width:120px;height:120px;border:2px solid #ff50a0;border-radius:50%'
mount(Address, {
  target,
  props: {
    addressText: 'Shamshuipo Army Camp Substation, 733 Lai Chi Kok Rd',
    featureKey: 'address-check',
  },
})
