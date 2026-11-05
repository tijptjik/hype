import { mount } from 'svelte'
import '#lib/styles/app.css'
import Fixture from './components/OrganisationContributionSettingsFixture.svelte'
const target = document.getElementById('app')
if (!target) throw new Error('Missing contribution settings fixture target')
mount(Fixture, { target })
