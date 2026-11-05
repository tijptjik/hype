// SVELTE
import { mount } from 'svelte'
// STYLES
import '#lib/styles/app.css'
// COMPONENTS
import Fixture from './components/OrganisationSettingsFixture.svelte'
// The browser check replaces both messaging APIs; no real accounts are contacted.
mount(Fixture, { target: document.getElementById('app')! })
