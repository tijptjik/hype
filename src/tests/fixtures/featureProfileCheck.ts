import { mount } from 'svelte'
import '#lib/styles/app.css'
import Fixture from './components/FeatureProfileFixture.svelte'
const target = document.getElementById('app')
if (!target) throw new Error('Missing profile fixture target')
mount(Fixture, {
  target,
  props: {
    toolbarIssue: new URLSearchParams(location.search).get('toolbarIssue') ?? '',
  },
})
