import { redirect } from '@sveltejs/kit';
export function load() {
	return redirect(307, '/admin/organisations');
}