// SVELTE
import { mount } from 'svelte'
// STYLES
import '#lib/styles/app.css'
// COMPONENTS
import Fixture from './components/MessagingIdentifiersFixture.svelte'

const target = document.getElementById('app')
if (!target) throw new Error('Missing messaging fixture mount point')
mount(Fixture, {
  target,
  props: { canVerify: new URL(location.href).searchParams.has('verify') },
})
