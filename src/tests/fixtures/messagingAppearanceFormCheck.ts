// STYLES
import '#lib/styles/app.css'
// SVELTE
import { mount } from 'svelte'
// COMPONENTS
import Fixture from './components/MessagingAppearanceFormFixture.svelte'

// The transport is synthetic; the fixture exercises the real organisation form controller.
const target = document.getElementById('app')
if (!target) throw new Error('Missing fixture mount point')
mount(Fixture, { target })
