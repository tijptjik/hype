"""Upload reviewed covers and emit image SQL only after hash-verified readback.

This command never applies database SQL. The stage and storage location are explicit.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[2]


def quote(value):
    """Escape a SQL text literal."""
    return "'" + str(value).replace("'", "''") + "'"


def main():
    """Validate every asset before uploading, then generate gap-only image links."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--stage', choices=['local', 'preview', 'production'], required=True)
    where = parser.add_mutually_exclusive_group(required=True)
    where.add_argument('--local', action='store_true')
    where.add_argument('--remote', action='store_true')
    parser.add_argument('--write', action='store_true', help='Upload and read back assets; otherwise print plan only')
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--persist-to', default='.wrangler/state/asset-service')
    args = parser.parse_args()
    os.chdir(ROOT)
    assets = json.loads((ROOT/'scripts/eln/data/covers.json').read_text())
    books = json.loads((ROOT/'scripts/eln/data/backfill.json').read_text())['books']
    bucket = 'hype-assets-raw-' + {'local':'dev','preview':'preview','production':'prod'}[args.stage]
    location = '--local' if args.local else '--remote'
    for asset in assets:
        body = (ROOT/asset['file']).read_bytes()
        assert hashlib.sha256(body).hexdigest() == asset['sha256'], asset['file']
        assert body[:2] == b'\xff\xd8', 'Expected validated JPEG'
    print(f'{len(assets)} covers -> {location} {bucket}', flush=True)
    if not args.write:
        return
    # Remove an earlier receipt before starting so a failed retry cannot leave stale success SQL.
    args.output.unlink(missing_ok=True)
    out = ['-- Generated only after every R2 object passed SHA-256 readback.',
           f'-- Storage: {location} {bucket}. Apply after 0127_eln_sourced_backfill.sql.',
           'PRAGMA foreign_keys=ON;',
           'CREATE TABLE _eln_image_guard (ok INTEGER NOT NULL CHECK(ok=1));']
    with tempfile.TemporaryDirectory(prefix='eln-covers-') as temp:
        for a in assets:
            key = 'cgczhk/eln/backfill/' + a['key'] + '-' + a['sha256'][:16]
            # Content-addressed keys make retries non-destructive and independent of later covers.
            for suffix in ['', '.raw']:
                object_path = bucket+'/'+key+suffix
                common = [location,'--persist-to',args.persist_to,'-c','workers/asset-service/wrangler.local.toml']
                subprocess.run(['bun','wrangler','r2','object','put',object_path,*common,'--file',a['file'],'--content-type','image/jpeg'],check=True,stdout=subprocess.DEVNULL)
                downloaded=Path(temp)/'readback.jpg'
                subprocess.run(['bun','wrangler','r2','object','get',object_path,*common,'--file',str(downloaded)],check=True,stdout=subprocess.DEVNULL)
                assert hashlib.sha256(downloaded.read_bytes()).hexdigest()==a['sha256'], object_path
            image_id='elnCover_'+a['key']+'_'+args.stage
            out.append(f"INSERT INTO _eln_image_guard SELECT NOT EXISTS(SELECT 1 FROM image WHERE id={quote(image_id)} AND (publicId<>{quote(key)} OR env<>{quote(args.stage)} OR contentHash IS NOT {quote(a['sha256'])}));")
            out.append(f"INSERT INTO image(id,contributorId,cdn,env,publicId,contentHash,version,presentationMode) VALUES({quote(image_id)},'qJpgD5f5wBMvvvLFbUOPnFfSpRiUXdaM','cloudflareR2',{quote(args.stage)},{quote(key)},{quote(a['sha256'])},1,'contain') ON CONFLICT DO NOTHING;")
            for b in books:
                if b['coverKey'] != a['key']:
                    continue
                fid=quote(b['id'])
                # Existing canonical choices are deliberately retained, including unpublished choices.
                out.append(f"INSERT INTO _eln_image_guard SELECT count(*)=1 FROM feature WHERE id={fid} AND projectId='vGBvWfSZNELM';")
                out.append(f"INSERT INTO featureImage(featureId,imageId,intent,isPublished) SELECT {fid},{quote(image_id)},'canonical',1 WHERE NOT EXISTS(SELECT 1 FROM featureImage WHERE featureId={fid} AND intent='canonical') ON CONFLICT DO NOTHING;")
            print('Verified '+a['key'],flush=True)
    out.append('DROP TABLE _eln_image_guard;')
    args.output.parent.mkdir(parents=True,exist_ok=True)
    args.output.write_text('\n'.join(out)+'\n')
    print(f'Wrote {args.output}; database unchanged.',flush=True)


if __name__ == '__main__':
    main()
