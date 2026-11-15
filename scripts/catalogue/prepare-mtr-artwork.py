#!/usr/bin/env python3
"""Normalise visually selected source logos for local catalogue review, never markers."""
import hashlib, io, json, pathlib, re, uuid
import xml.etree.ElementTree as ET
from PIL import Image
ROOT = pathlib.Path('.research/catalogue/mtr')
# Indices refer to retained source-artwork.json candidates; third-party badges excluded.
SELECTION = json.loads(pathlib.Path('scripts/catalogue/mtr-artwork-selection.json').read_text())

def main():
    """Write immutable SVG/PNG candidates and a provenance manifest for the importer."""
    records = json.loads((ROOT/'source-artwork.json').read_text())
    output = ROOT/'prepared'; output.mkdir(exist_ok=True)
    manifest=[]
    for record in records:
        selection=SELECTION.get(record['code'])
        if selection is None: continue
        source=next((c for c in record['candidates'] if c['sha256']==selection['sha256'] and c['sourceUrl']==selection['sourceUrl']), None)
        if source is None: raise ValueError(f'Selected source missing: {record["code"]}')
        background=selection.get('background','#ffffff')
        if not re.fullmatch(r'#[0-9a-fA-F]{6}',background): raise ValueError('Invalid source background')
        path=pathlib.Path(source['path'])
        if hashlib.sha256(path.read_bytes()).hexdigest()!=source['sha256']:raise ValueError(f'Source changed: {path}')
        if path.suffix=='.svg':
            # Retain vector geometry, accepting only self-contained drawing markup.
            body=path.read_bytes()
            if re.search(rb'<!DOCTYPE|<!ENTITY',body,re.I): raise ValueError('SVG entities are not supported')
            svg=ET.fromstring(body)
            # Remove non-rendering editor metadata; drawing and active content remain validated.
            removed_metadata=False
            for parent in svg.iter():
                for child in list(parent):
                    if child.tag.split('}')[-1] in {'metadata','namedview'}:
                        parent.remove(child);removed_metadata=True
            allowed={'svg','g','path','rect','circle','ellipse','polygon','polyline','line','defs','style','title','desc','clipPath','mask','linearGradient','radialGradient','stop','use'}
            for node in svg.iter():
                tag=node.tag.split('}')[-1]
                if tag not in allowed: raise ValueError(f'Unsupported SVG element: {tag}')
                for key,value in node.attrib.items():
                    attr=key.split('}')[-1].lower()
                    if attr.startswith('on') or (attr=='href' and not value.startswith('#')): raise ValueError('Active SVG attribute')
                    if re.search(r'url\(\s*[\"\']?(?!#)',value,re.I): raise ValueError('External SVG resource')
                if tag=='style' and re.search(r'@import|url\(|expression\(',node.text or '',re.I): raise ValueError('Active SVG style')
            if svg.tag.split('}')[-1]!='svg': raise ValueError('SVG root required')
            if removed_metadata:body=ET.tostring(svg,encoding='utf-8',xml_declaration=True)
            extension='svg';mime='image/svg+xml';width=height=None
            quality='Scalable SVG source.'
        else:
            image=Image.open(path).convert('RGBA')
            width,height=image.size
            # Never enlarge a favicon and misrepresent the canvas size as source detail.
            image.thumbnail((480,480),Image.Resampling.LANCZOS)
            canvas=Image.new('RGB',(512,512),background);canvas.paste(image,((512-image.width)//2,(512-image.height)//2),image)
            buffer=io.BytesIO();canvas.save(buffer,format='PNG',optimize=True);body=buffer.getvalue()
            extension='png';mime='image/png'
            quality=f'{width}×{height}px source. '+('Higher-resolution replacement required.' if max(width,height)<512 else '')
        digest=hashlib.sha256(body).hexdigest();asset_id=str(uuid.uuid5(uuid.NAMESPACE_URL,'hype:mtr:source-logo:'+digest))
        target=output/f'{asset_id}.{extension}';target.write_bytes(body)
        manifest.append({'code':record['code'],'file':str(target),'sha256':digest,'assetId':asset_id,'format':extension,'mimeType':mime,**({'sourceWidth':width,'sourceHeight':height} if width else {}),'sourceUrl':source['sourceUrl'],'pageUrl':source['pageUrl'],'sourceSha256':source['sha256'],'background':background,'notes':f'Retained brand or property-directory source. {quality} Review candidate; no marker derivative.'})
    (ROOT/'prepared-artwork.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
    print(f'Prepared {len(manifest)} review candidates')
if __name__=='__main__':main()
