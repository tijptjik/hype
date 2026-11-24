"""Bounded HTTP integration checks with synthetic source data and stubbed inference."""
import importlib.util
import json
import os
from pathlib import Path
import tempfile
import threading
import time
import unittest
from urllib.request import Request, urlopen
from urllib.error import HTTPError
import sys
sys.path.insert(0, str(Path(__file__).parent))
import server

class WorkerTests(unittest.TestCase):
    def test_upload_poll_source_and_retry(self):
        with tempfile.TemporaryDirectory() as state:
            server.ROOT = Path(state)
            server.TOKEN = 'synthetic-test-token'
            calls = []
            def fake_extract(source, output, codex):
                calls.append(source.read_bytes())
                if len(calls) == 1:
                    raise ValueError('synthetic first-attempt failure')
                (output / 'page-1.png').write_bytes(b'original-test-image')
                (output / 'extraction.json').write_text(json.dumps({'floors': [], 'warnings': []}))
                (output / 'receipt.json').write_text(json.dumps({'pages': [[100,100]]}))
            server.extract = fake_extract
            http = server.ThreadingHTTPServer(('127.0.0.1',0),server.Handler)
            thread=threading.Thread(target=http.serve_forever,daemon=True);thread.start()
            base=f'http://127.0.0.1:{http.server_port}'
            def request(path, data=None, authenticated=True):
                headers={'Authorization':'Bearer synthetic-test-token'} if authenticated else {}
                return urlopen(Request(base+path,data=data,headers=headers),timeout=5)
            try:
                with self.assertRaises(HTTPError) as denied: request('/jobs',b'%PDF-test',False)
                self.assertEqual(denied.exception.code,403)
                job=json.load(request('/jobs',b'%PDF-test'))['id']
                def poll(status):
                    for _ in range(100):
                        result=json.load(request('/jobs/'+job))
                        if result['status']==status:return result
                        time.sleep(.02)
                    self.fail('Job did not reach '+status)
                poll('failed')
                request('/jobs/'+job+'/retry',b'').close()
                completed=poll('needs-review')
                self.assertEqual(completed['pages'],['page-1.png'])
                self.assertEqual(request('/jobs/'+job+'/page-1.png').read(),b'original-test-image')
                self.assertEqual(calls,[b'%PDF-test',b'%PDF-test'])
                with self.assertRaises(HTTPError) as conflict:request('/jobs/'+job+'/retry',b'')
                self.assertEqual(conflict.exception.code,409)
            finally:
                http.shutdown();http.server_close();thread.join()
if __name__=='__main__':unittest.main()
