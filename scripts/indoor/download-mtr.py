"""Collect official MTR station PDFs; retain HTTP failures and content hashes."""
import concurrent.futures, datetime, hashlib, json, pathlib, re, urllib.request, urllib.error, time
ROOT = pathlib.Path(__file__).resolve().parents[2]
OUT = ROOT / '.research/premises/transit/mtr/maps'
OUT.mkdir(parents=True, exist_ok=True)
INDEX = 'https://www.mtr.com.hk/en/customer/services/system_map.html'
html = urllib.request.urlopen(INDEX, timeout=60).read()
(OUT / 'system-map.html').write_bytes(html)
codes = sorted(set(re.findall(r'services/maps/([a-z]+)\.pdf', html.decode())))
assert len(codes) >= 98, 'Unexpected station index; refusing partial collection'
kinds = {'shops': 'ch/services/shop', 'layout': 'en/services/layouts', 'location': 'ch/services/maps'}
def download(task):
    code, kind = task
    url = f'https://www.mtr.com.hk/archive/{kinds[kind]}/{code}.pdf'
    entry = dict(station=code.upper(), kind=kind, url=url)
    path = OUT / kind / f'{code.upper()}.pdf'
    for attempt in range(3):
        try:
            with urllib.request.urlopen(url, timeout=60) as response:
                data = response.read()
                entry['httpStatus'] = response.status
            if not data.startswith(b'%PDF-'):
                entry['status'] = 'invalid-content'
                break
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(data)
            entry.update(status='downloaded', bytes=len(data), sha256=hashlib.sha256(data).hexdigest(), path=url, researchPath=f'premises/transit/mtr/maps/{kind}/{code.upper()}.pdf')
            break
        except urllib.error.HTTPError as error:
            entry.update(httpStatus=error.code, status='missing' if error.code == 404 else 'http-error')
            if error.code == 404: break
        except Exception as error:
            entry.update(status='network-error', error=str(error))
        time.sleep(attempt + 1)
    print(code, kind, entry['status'], flush=True)
    return entry
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
    entries = list(pool.map(download, [(code, kind) for code in codes for kind in kinds]))
manifest = dict(retrievedAt=datetime.datetime.now(datetime.timezone.utc).isoformat(), source=INDEX, stationCodes=[c.upper() for c in codes], entries=entries)
(OUT / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
print('COMPLETE', len(entries), 'requests', flush=True)

# The application retains only a small public index; PDFs stay in research storage.
(ROOT / '.research/indoor/mtr/manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
