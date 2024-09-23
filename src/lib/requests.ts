// import { userData } from '$lib/stores/user';
// import { browser } from '$app/environment';
// import { get } from 'svelte/store';
// import { PUBLIC_BASE_URL } from '$env/static/public';
//
// /**
//  * Error handling is done inside this function, so it will never throw.
//  */
// // TODO: Switch to object instead of params
// export const sendUnauthorizedRequest = async (
// 	method: 'GET' | 'POST' = 'GET',
// 	url: string,
// 	data: object,
// 	fetchImplementation?: typeof fetch,
// 	timeout = 10000,
// 	headers = {}
// ) => {
// 	if (!browser) {
// 		console.error('💥 Error: sendUnauthorizedRequest called outside browser!');
// 		return {};
// 	}
//
// 	const selectedFetchImplementation = fetchImplementation ? fetchImplementation : fetch; // If this function is called from inside a Svelte component, the fetch will actually automatically be the Svelte version
//
// 	// https://developer.mozilla.org/en-US/docs/Web/API/AbortController
// 	const controller = new AbortController();
// 	const signal = controller.signal;
//
// 	const timeoutPromise = setTimeout(() => {
// 		// TODO: At some point it'd be nice to have a $lib/errors that could
// 		// Send this to Sentry
// 		console.error('💣 Request timed out, aborting!');
// 		if (controller) {
// 			controller.abort('The request timed out.');
// 		}
// 	}, timeout);
//
// 	let response;
// 	try {
// 		response = await selectedFetchImplementation(`${PUBLIC_BASE_URL}${url}`, {
// 			signal,
// 			method,
// 			body: JSON.stringify(data),
// 			headers: {
// 				'content-type': 'application/json',
// 				...headers
// 			}
// 		});
//
// 		// Clean up the timeout after we received the data
// 		clearTimeout(timeoutPromise);
//
// 		const responseData = await response.json();
//
// 		// TODO: Should type this as Response | ErrorResponse
// 		return {
// 			status: response?.status,
// 			ok: response.ok,
// 			...responseData
// 		};
// 	} catch (e) {
// 		console.log('Error when fetching data', e);
//
// 		// Clear timeout as there was an error
// 		clearTimeout(timeoutPromise);
//
// 		return {
// 			status: response?.status,
// 			ok: false,
// 			message: `${e}`
// 		};
// 	}
// };
//
// /**
//  * Error handling is done inside this function, so it will never throw.
//  */
// // TODO: Switch to object instead of params
// export const sendAuthorizedRequest = async (
// 	method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' = 'GET',
// 	url: string,
// 	data: object = {},
// 	fetchImplementation?: typeof fetch,
// 	timeout = 10000,
// 	throwOnError = false,
// 	overrideCredentials: {
// 		userId: number;
// 		userSecret: string;
// 	} | null = null,
// 	headers = {}
// ) => {
// 	if (!browser) {
// 		console.error('💥 Error: sendAuthorizedRequest called outside browser!');
// 		return {};
// 	}
//
// 	const selectedFetchImplementation = fetchImplementation ? fetchImplementation : fetch; // If this function is called from inside a Svelte component, the fetch will actually automatically be the Svelte version
//
// 	// https://developer.mozilla.org/en-US/docs/Web/API/AbortController
// 	const controller = new AbortController();
// 	const signal = controller.signal;
//
// 	const timeoutPromise = setTimeout(() => {
// 		// TODO: At some point it'd be nice to have a $lib/errors that could
// 		// Send this to Sentry
// 		console.error('💣 Request timed out, aborting!');
// 		if (controller) {
// 			controller.abort('The request timed out.');
// 		}
// 	}, timeout);
//
// 	const { userId = 0, userSecret = '' } = get(userData);
//
// 	let response;
// 	try {
// 		response = await selectedFetchImplementation(`${PUBLIC_BASE_URL}${url}`, {
// 			signal,
// 			method,
// 			body:
// 				method === 'POST' || method === 'PATCH' || method === 'PUT'
// 					? JSON.stringify(data)
// 					: undefined,
// 			headers: {
// 				'content-type': 'application/json',
// 				'x-user-id': overrideCredentials?.userId // TODO: Perhaps remove these special params and just allow to override headers
// 					? overrideCredentials?.userId.toString()
// 					: userId.toString(),
// 				'x-user-secret': overrideCredentials?.userSecret
// 					? overrideCredentials.userSecret
// 					: userSecret,
// 				...headers
// 			}
// 		});
//
// 		// Clean up the timeout after we received the data
// 		clearTimeout(timeoutPromise);
//
// 		const responseData = await response.json();
//
// 		// Even if we don't throw, response.ok = false indicates the request went wrong
// 		if (!response.ok && throwOnError) {
// 			throw new Error(responseData.message);
// 		}
//
// 		// TODO: Should type this as Response | ErrorResponse
// 		return {
// 			status: response?.status,
// 			ok: response.ok,
// 			...responseData
// 		};
// 	} catch (e) {
// 		console.error('Error when fetching data', e);
//
// 		// Clear timeout as there was an error
// 		clearTimeout(timeoutPromise);
//
// 		// TODO: See if there is a nicer way to handle this, as it's kind of janky
// 		if (throwOnError) {
// 			throw e;
// 		}
//
// 		return {
// 			status: response?.status,
// 			ok: false,
// 			message: `${e}`
// 		};
// 	}
// };
