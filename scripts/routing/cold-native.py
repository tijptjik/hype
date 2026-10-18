#!/usr/bin/env python3
"""Measure five local native process restarts, including startup and first route."""
import json
from pathlib import Path
import socket
import subprocess
import time
import urllib.request

samples = []
payload = json.dumps({'locations': [
    {'lat':22.2819,'lon':114.1589,'radius':30,'minimum_reachability':0},
    {'lat':22.2865,'lon':114.15,'radius':30,'minimum_reachability':0}],
    'costing':'pedestrian', 'directions_options':{'units':'kilometers','language':'en-US'}}).encode()
opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
for _ in range(5):
    started = time.perf_counter()
    subprocess.run(['docker','restart','--time','0','hype-routing-native-benchmark'],check=True,capture_output=True)
    while True:
        try:
            with socket.create_connection(('127.0.0.1',8795),timeout=1):
                break
        except OSError:
            if time.perf_counter()-started > 15:
                raise TimeoutError('Native startup exceeded 15 seconds')
            time.sleep(.01)
    request_start = time.perf_counter()
    request = urllib.request.Request('http://127.0.0.1:8795/route',data=payload,headers={'Content-Type':'application/json'})
    with opener.open(request,timeout=15) as response:
        route = json.load(response)
    samples.append({'startupAndRouteMs':(time.perf_counter()-started)*1000,
        'firstRouteMs':(time.perf_counter()-request_start)*1000,
        'status':route['trip']['status'], 'summary':route['trip']['summary']})
result = {'scope':'Local forced process restarts, 1 CPU / 1 GiB; graph and image already present; excludes graceful shutdown/drain; not Cloudflare cold start.', 'samples':samples}
Path('build/routing-benchmark/local-native-cold.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps(result,indent=2))
