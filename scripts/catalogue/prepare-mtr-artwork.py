#!/usr/bin/env python3
"""Normalise visually selected source logos for local catalogue review, never markers."""
import hashlib, io, json, pathlib, subprocess, uuid
from PIL import Image
ROOT = pathlib.Path('.research/catalogue/mtr')
# Indices refer to retained source-artwork.json candidates; third-party badges excluded.
SELECTION = json.loads(pathlib.Path('scripts/catalogue/mtr-artwork-selection.json').read_text())

def main():
    """Write immutable PNG candidates and a provenance manifest for the importer."""
    records = json.loads((ROOT/'source-artwork.json').read_text())
    output = ROOT/'prepared'; output.mkdir(exist_ok=True)
    manifest=[]
    for record in records:
        selection=SELECTION.get(record['code'])
        if selection is None: continue
        source=next((c for c in record['candidates'] if c['sha256']==selection['sha256'] and c['sourceUrl']==selection['sourceUrl']), None)
        if source is None: raise ValueError(f'Selected source missing: {record["code"]}')
        path=pathlib.Path(source['path'])
        if hashlib.sha256(path.read_bytes()).hexdigest()!=source['sha256']:raise ValueError(f'Source changed: {path}')
        if path.suffix=='.svg':
            data=subprocess.run(['magick','-background','none',str(path),'-resize','512x512','png:-'],capture_output=True,check=True,timeout=20).stdout
            image=Image.open(io.BytesIO(data)).convert('RGBA')
        else: image=Image.open(path).convert('RGBA')
        width,height=image.size
        image.thumbnail((480,480),Image.Resampling.LANCZOS)
        if max(image.size)<480:image=image.resize((round(image.width*480/max(image.size)),round(image.height*480/max(image.size))),Image.Resampling.LANCZOS)
        canvas=Image.new('RGB',(512,512),'white');canvas.paste(image,((512-image.width)//2,(512-image.height)//2),image)
        buffer=io.BytesIO();canvas.save(buffer,format='PNG',optimize=True);body=buffer.getvalue()
        digest=hashlib.sha256(body).hexdigest();asset_id=str(uuid.uuid5(uuid.NAMESPACE_URL,'hype:mtr:source-logo:'+digest))
        target=output/f'{asset_id}.png';target.write_bytes(body)
        manifest.append({'code':record['code'],'file':str(target),'sha256':digest,'assetId':asset_id,'sourceUrl':source['sourceUrl'],'pageUrl':source['pageUrl'],'sourceSha256':source['sha256'],'background':'#ffffff','notes':f'Retained brand or property-directory source, {width}×{height}px. Review candidate; no marker derivative. '+('Low-resolution source; replacement desirable.' if min(width,height)<100 else '')})
    (ROOT/'prepared-artwork.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
    print(f'Prepared {len(manifest)} review candidates')
if __name__=='__main__':main()
