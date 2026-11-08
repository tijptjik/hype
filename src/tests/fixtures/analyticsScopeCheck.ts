import { mount } from 'svelte'
import Fixture from './components/AnalyticsScopeFixture.svelte'
import '#lib/styles/app.css'
const target = document.getElementById('app')
if (!target) throw new Error('Missing analytics fixture target')
mount(Fixture, { target })
