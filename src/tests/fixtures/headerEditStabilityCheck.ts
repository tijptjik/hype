// SVELTE
import { mount } from 'svelte'
// STYLES
import '#lib/styles/app.css'
// COMPONENTS
import Fixture from './components/HeaderEditStabilityFixture.svelte'
const target = document.getElementById('app')
if (!target) throw new Error('Header Edit fixture target missing')
mount(Fixture, { target })
