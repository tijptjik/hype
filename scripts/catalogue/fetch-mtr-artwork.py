#!/usr/bin/env python3
"""Fetch source logo candidates for local review; never generates marker derivatives."""
import sys, concurrent.futures, hashlib, html.parser, json, pathlib, urllib.request, urllib.parse
ROOT=pathlib.Path('.research/catalogue/mtr'); ROOT.mkdir(parents=True,exist_ok=True)
class Assets(html.parser.HTMLParser):
 def __init__(self): super().__init__(); self.assets=[]; self.links=[]
 def handle_starttag(self,tag,attrs):
  a=dict(attrs)
  if tag=='link':
   rel=(a.get('rel') or '').lower();href=a.get('href') or ''
   if 'icon' in rel: self.assets.append((100 if 'apple-touch' in rel else 80,href))
  if tag=='img':
   src=a.get('src') or a.get('data-src') or '';desc=' '.join([src,a.get('alt') or '',a.get('class') or '']).lower()
   if 'logo' in desc and not any(w in desc for w in ['payment','visa','mastercard','paypal','facebook','instagram','whatsapp']):self.assets.append((70,src))
  if tag=='a' and a.get('href'):self.links.append(a['href'])
def fetch(url):
 req=urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0 (compatible; Hype local catalogue research)'})
 with urllib.request.urlopen(req,timeout=18) as r:
  content=r.read(8*1024*1024+1)
  if len(content)>8*1024*1024:raise ValueError('Asset too large')
  return content,r.geturl(),r.headers.get('Content-Type','')
def crawl(record):
 code=record['code'];folder=ROOT/'sources'/code;folder.mkdir(parents=True,exist_ok=True)
 report={'code':code,'website':record['website'],'candidates':[]}
 if not record['website']:return report
 try:
  data,url,_=fetch(record['website']);(folder/'page.html').write_bytes(data)
  parser=Assets();parser.feed(data.decode('utf-8','replace'))
  links=[urllib.parse.urljoin(url,x) for x in parser.links if any(k in x.lower() for k in ['about','corporate','company','privacy'])][:12]
  report['evidenceLinks']=list(dict.fromkeys(links))
  seen=set()
  for score,href in sorted(parser.assets,reverse=True):
   src=urllib.parse.urljoin(url,href)
   if src in seen or not src.startswith('http'):continue
   seen.add(src)
   try:
    body,final,mime=fetch(src)
    if 'image' not in mime and not body.lstrip().startswith(b'<svg'):continue
    ext='.svg' if 'svg' in mime or b'<svg' in body[:1000] else '.png' if body.startswith(b'\x89PNG') else '.jpg' if body.startswith(b'\xff\xd8') else '.ico' if body.startswith(b'\x00\x00\x01\x00') else '.webp'
    path=folder/(str(len(report['candidates']))+ext);path.write_bytes(body)
    report['candidates'].append({'sourceUrl':src,'pageUrl':url,'path':str(path),'sha256':hashlib.sha256(body).hexdigest(),'score':score})
    if len(report['candidates'])>=3:break
   except Exception:pass
 except Exception as e:report['error']=str(e)
 print(code,len(report['candidates']),report.get('error',''),flush=True)
 return report
if __name__=='__main__':
 records=json.loads(pathlib.Path('scripts/catalogue/mtr-brands.json').read_text())
 groups=pathlib.Path('scripts/catalogue/mtr-groups.json')
 if groups.exists():records+=json.loads(groups.read_text())
 cache=ROOT/'source-artwork.json'
 previous={r['code']:r for r in json.loads(cache.read_text())} if cache.exists() else {}
 selection_path=pathlib.Path('scripts/catalogue/mtr-artwork-selection.json')
 selected=json.loads(selection_path.read_text()) if selection_path.exists() else {}
 # Restore pinned selections directly; a changed remote image requires fresh visual review.
 for code,source in selected.items():
  cached=previous.get(code,{})
  matching=[c for c in cached.get('candidates',[]) if c['sha256']==source['sha256'] and c['sourceUrl']==source['sourceUrl'] and pathlib.Path(c['path']).exists()]
  if matching:continue
  body,_,mime=fetch(source['sourceUrl'])
  if hashlib.sha256(body).hexdigest()!=source['sha256']:raise ValueError(f'Selected source changed: {code}')
  folder=ROOT/'sources'/code;folder.mkdir(parents=True,exist_ok=True)
  path=folder/('selected.svg' if 'svg' in mime else 'selected.png');path.write_bytes(body)
  previous[code]={'code':code,'website':source['pageUrl'],'candidates':[{**source,'path':str(path),'score':100}]}

 pending=[r for r in records if (not sys.argv[1:] or r['code'] in sys.argv[1:]) and r['code'] not in selected and (not previous.get(r['code'],{}).get('candidates') or previous[r['code']]['website']!=r['website'])]
 with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool: refreshed=list(pool.map(crawl,pending))
 previous.update({r['code']:r for r in refreshed})
 results=[previous[r['code']] for r in records if r['code'] in previous]
 (ROOT/'source-artwork.json').write_text(json.dumps(results,ensure_ascii=False,indent=2)+'\n')
