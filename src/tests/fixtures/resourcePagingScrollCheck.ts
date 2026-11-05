// SVELTE
import { mount } from 'svelte'
// COMPONENTS
import Fixture from './components/ResourcePagingScrollFixture.svelte'
// STYLES
import '#lib/styles/app.css'

const target = document.getElementById('app')
if (!target) throw new Error('Missing fixture target')
mount(Fixture, { target })
