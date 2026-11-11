import { mount } from 'svelte'
import '#lib/styles/app.css'
import Fixture from './components/PhoneValidationFixture.svelte'
const target = document.getElementById('app')
if (!target) throw new Error('Phone validation fixture target missing')
mount(Fixture, { target })
