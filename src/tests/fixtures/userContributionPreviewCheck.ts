// SVELTE
import { mount } from 'svelte'
// COMPONENTS
import Fixture from './components/UserContributionPreviewFixture.svelte'
// STYLES
import '#lib/styles/app.css'

const target = document.getElementById('app')
if (!target) throw new Error('Missing fixture mount')
mount(Fixture, { target })
