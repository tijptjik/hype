// SVELTE
import { mount } from 'svelte'
// STYLES
import '#lib/styles/app.css'
// FIXTURE
import Fixture from './components/FieldEditorFixture.svelte'
const target = document.getElementById('app')
if (!target) throw new Error('Missing field editor fixture target')
mount(Fixture, {
  target,
  props: {
    fieldCount: Number(new URLSearchParams(location.search).get('fields') ?? 1),
    extraLocales: new URLSearchParams(location.search).getAll('locale'),
  },
})
