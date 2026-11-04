// SVELTE
import { mount } from 'svelte'
// STYLES
import '#lib/styles/app.css'
// COMPONENTS
import Fixture from './components/LocationSettingsTooltipFixture.svelte'
mount(Fixture, { target: document.getElementById('app')! })
