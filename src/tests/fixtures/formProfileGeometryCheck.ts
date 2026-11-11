// SVELTE
import { mount } from 'svelte'
// COMPONENTS
import Fixture from './components/FormProfileLoadingFixture.svelte'
// STYLES
import '#lib/styles/app.css'
const target = document.getElementById('app')
if (target) {
  const fixture = mount(Fixture, { target })
  Object.assign(window, { profileGeometryFixture: fixture })
}
