import '#lib/styles/app.css'
import { mount } from 'svelte'
import Fixture from './components/FormUserRolesSectionFixture.svelte'
const target = document.getElementById('app')
if (target) mount(Fixture, { target })
