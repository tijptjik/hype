import { error, json } from '@sveltejs/kit';

export const getSessionOrThrow = async (locals : App.Locals) => {
	const session = await locals.auth();
	if (!session?.user) {
		throw error(401, 'No nice, no rice');
	}
	return session;
}

export const JSONResponseOrThrow = async (result : any) : Promise<any> =>  {
  if (!result) {
  	throw error(404, "These aren't the signs you're looking for");
  }
  return json(result);
}
