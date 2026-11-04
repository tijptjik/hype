// SVELTE
import { mount } from 'svelte'
// STYLES
import '#lib/styles/app.css'
// COMPONENTS
import Fixture from './components/MessagingThreadsFixture.svelte'

// The manual browser check supplies synthetic account APIs before mounting this real inbox.
mount(Fixture, { target: document.getElementById('app')! })
