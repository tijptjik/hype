// STYLES
import '#lib/styles/app.css'
// SVELTE
import { mount } from 'svelte'
// COMPONENTS
import Fixture from './components/ResourceTransitionFixture.svelte'
const target = document.getElementById('app')
if (!target) throw new Error('Missing fixture target')
if (new URLSearchParams(location.search).has('shell')) {
  const { default: ShellFixture } = await import(
    './components/AdminShellLayoutFixture.svelte'
  )
  mount(ShellFixture, { target })
} else {
  mount(Fixture, { target })
}
