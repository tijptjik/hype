// SVELTE
import { mount } from 'svelte'
// STYLES
import '#lib/styles/app.css'
// COMPONENTS
import Fixture from './components/HubTabsVisualFixture.svelte'

const target = document.getElementById('app')
if (!target) throw new Error('Missing hub layers fixture target')
mount(Fixture, { target, props: { tab: 'layers', editing: true } })
