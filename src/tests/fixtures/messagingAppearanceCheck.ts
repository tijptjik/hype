// STYLES
import '#lib/styles/app.css'
// SVELTE
import { mount } from 'svelte'
// COMPONENTS
import Fixture from './components/MessagingAppearanceFixture.svelte'

// The visual check intercepts the appearance API module; this never touches real accounts.
mount(Fixture, { target: document.getElementById('app')! })
