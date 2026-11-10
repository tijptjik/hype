// SVELTE
import { mount } from 'svelte'
// STYLES
import '#lib/styles/app.css'
// COMPONENTS
import Fixture from './components/FacetResizeFixture.svelte'

const target = document.getElementById('app')
if (!target) throw new Error('Missing facet resize fixture target')
mount(Fixture, { target })
