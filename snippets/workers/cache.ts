// src/service-worker.js
// Offline-first IndexedDB cache for SvelteKit Remote Functions (/_app/remote/*)
// - GET: serve fast from IDB (if available), revalidate in background
// - non-GET: pass-through; (optional) server can tell which GETs to refresh via `X-Refresh-URLs`

const self_sw = /** @type {ServiceWorkerGlobalScope} */ (/** @type {unknown} */ (self));

// ---- IndexedDB helpers ----
const db_name = 'remote_fn_cache_v1';
const store_name = 'responses';

function open_db() {
	return new Promise((resolve, reject) => {
		const req = indexedDB.open(db_name, 1);
		req.onupgradeneeded = () => {
			const db = req.result;
			if (!db.objectStoreNames.contains(store_name)) {
				const os = db.createObjectStore(store_name, { keyPath: 'key' });
				os.createIndex('updated_at', 'updated_at');
			}
		};
		req.onsuccess = () => resolve(req.result);
		req.onerror = () => reject(req.error);
	});
}

async function idb_get(key) {
	const db = await open_db();
	return new Promise((resolve, reject) => {
		const tx = db.transaction(store_name, 'readonly').objectStore(store_name).get(key);
		tx.onsuccess = () => resolve(tx.result || undefined);
		tx.onerror = () => reject(tx.error);
	});
}

async function idb_put(record) {
	const db = await open_db();
	return new Promise((resolve, reject) => {
		const tx = db.transaction(store_name, 'readwrite');
		tx.objectStore(store_name).put({ ...record, updated_at: Date.now() });
		tx.oncomplete = () => resolve();
		tx.onerror = () => reject(tx.error);
	});
}

const bc = new BroadcastChannel('sw_cache');

function headers_to_obj(h) {
	const o = {};
	h.forEach((v, k) => (o[k] = v));
	return o;
}

async function cache_response(key, res) {
	const ct = res.headers.get('content-type') || '';
	if (!res.ok || (!ct.includes('application/json') && !ct.includes('text/json'))) return res;
	const cloned = res.clone();
	const body = await cloned.arrayBuffer();
	await idb_put({ key, body, headers: headers_to_obj(cloned.headers), status: cloned.status });
	bc.postMessage({ type: 'updated', key });
	return res;
}

function response_from_idb(rec) {
	const headers = new Headers(rec.headers);
	headers.set('x-sw-idb', '1'); // visible in DevTools
	return new Response(rec.body.slice(0), { status: rec.status, headers });
}

// ---- lifecycle ----
self_sw.addEventListener('install', () => self_sw.skipWaiting());
self_sw.addEventListener('activate', (e) => e.waitUntil(self_sw.clients.claim()));

// ---- intercept remote functions ----
self_sw.addEventListener('fetch', (event) => {
	const req = event.request;
	const url = new URL(req.url);

	if (!url.pathname.startsWith('/_app/remote/')) return;

	const cache_key = url.pathname + url.search;

	const forward = async () => {
		const init = {
			method: req.method,
			headers: req.headers,
			credentials: 'include',
			redirect: req.redirect,
			referrer: req.referrer,
			referrerPolicy: req.referrerPolicy,
			cache: 'no-store'
		};

		if (req.method !== 'GET' && req.method !== 'HEAD') {
			const buf = await req.arrayBuffer();
			if (buf.byteLength) init.body = buf;
		}

		const net_res = await fetch(req.url, init);

		if (req.method === 'GET') {
			cache_response(cache_key, net_res.clone()).catch(() => {});
		} else {
			// optional: server can return a comma-separated list of GET URLs to refresh
			const to_refresh = (net_res.headers.get('X-Refresh-URLs') || '')
				.split(',')
				.map((s) => s.trim())
				.filter(Boolean);

			for (const path of to_refresh) {
				const refresh_url = new URL(path, url.origin).toString();
				fetch(refresh_url, {
					method: 'GET',
					credentials: 'include',
					headers: new Headers([['cache-control', 'no-store']])
				})
					.then((r) => cache_response(path, r))
					.catch(() => {});
			}
		}

		return net_res;
	};

	if (req.method === 'GET') {
		event.respondWith(
			(async () => {
				const cached = await idb_get(cache_key);
				const network_promise = forward().catch((err) => {
					if (cached) return response_from_idb(cached);
					throw err;
				});

				if (cached) {
					network_promise.catch(() => {});
					return response_from_idb(cached);
				}

				return network_promise;
			})()
		);
	} else {
		event.respondWith(forward());
	}
});
