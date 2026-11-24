"""Test-only worker with deterministic geometry; never installed in production."""
import json
from pathlib import Path
import server

def extract_fixture(source, output, codex):
    from PIL import Image
    Image.new('RGB',(100,100),'white').save(output/'page-1.png')
    floor={'id':'fixture-floor','label':'Integration test floor','page':1,'width':100,'height':100,'boundary':[[0,0],[100,0],[100,100],[0,100],[0,0]],'warnings':[],'units':[{'id':'fixture-room','label':'Integration room','category':'room','polygon':[[0,0],[100,0],[100,100],[0,100],[0,0]],'confidence':1,'evidence':'Synthetic integration fixture; not building evidence.'}]}
    (output/'extraction.json').write_text(json.dumps({'warnings':['Synthetic integration test data.'], 'floors':[floor]}))
    (output/'receipt.json').write_text(json.dumps({'pages':[[100,100]],'status':'needs-review'}))

if __name__=='__main__':
    import os
    server.extract=extract_fixture
    server.ROOT.mkdir(parents=True,exist_ok=True)
    http=server.ThreadingHTTPServer(('127.0.0.1',int(os.environ['FLOORPLAN_PORT'])),server.Handler)
    http.serve_forever()
