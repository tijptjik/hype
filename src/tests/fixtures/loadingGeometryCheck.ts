// STYLES
import '#lib/styles/app.css'
// SVELTE
import { mount } from 'svelte'
// COMPONENTS
import Fixture from './components/LoadingGeometryFixture.svelte'
mount(Fixture, { target: document.getElementById('app')! })
