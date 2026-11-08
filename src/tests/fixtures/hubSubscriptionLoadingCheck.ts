// STYLES
import '#lib/styles/app.css'
// SVELTE
import { mount } from 'svelte'
// COMPONENTS
import Fixture from './components/HubSubscriptionLoadingFixture.svelte'

mount(Fixture, { target: document.getElementById('app')! })
