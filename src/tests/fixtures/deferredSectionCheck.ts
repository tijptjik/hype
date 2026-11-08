// STYLES
import '#lib/styles/app.css'
// SVELTE
import { mount } from 'svelte'
// COMPONENTS
import Fixture from './components/DeferredSectionFixture.svelte'

let fail = true
mount(Fixture, {
  target: document.getElementById('app')!,
  props: {
    load: async () => {
      if (fail) {
        fail = false
        throw new Error('Simulated chunk failure')
      }
      return import('./deferredSectionPayload.js')
    },
  },
})
