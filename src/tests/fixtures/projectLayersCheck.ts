// SVELTE
import { mount } from 'svelte'
// STYLES
import '#lib/styles/app.css'
// COMPONENTS
import Fixture from './components/ProjectLayersFixture.svelte'
const target = document.getElementById('app')
if (!target) throw new Error('Missing project layers fixture target')
mount(Fixture, { target })
