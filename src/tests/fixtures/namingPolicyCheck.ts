// SVELTE
import { mount } from 'svelte'
// FIXTURE
import Fixture from './components/NamingPolicyFixture.svelte'
import '#lib/styles/app.css'
const target = document.getElementById('app')
if (!target) throw new Error('Fixture mount target is missing')
mount(Fixture, { target })
