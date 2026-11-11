// STYLES
import '#lib/styles/app.css'
// SVELTE
import { mount } from 'svelte'
// COMPONENTS
import Fixture from './components/PrismLoadingFixture.svelte'
const target = document.getElementById('app')
if (!target) throw new Error('Missing fixture target')
mount(Fixture, { target })
