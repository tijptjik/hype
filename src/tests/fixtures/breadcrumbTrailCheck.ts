import { mount } from 'svelte'
import Fixture from './components/BreadcrumbTrailFixture.svelte'
import '#lib/styles/app.css'
const target = document.getElementById('app')
if (!target) throw new Error('Fixture target missing')
mount(Fixture, { target })
