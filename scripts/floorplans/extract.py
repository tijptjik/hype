#!/usr/bin/env python3
"""Render a bounded PDF/image and run the local subscription Codex geometry pass."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess


def extract(source: Path, output: Path, codex: str, selected_pages=None):
    """Retain source hash, page images and raw structured extraction for review."""
    output.mkdir(parents=True, exist_ok=True)
    source = source.resolve()
    if source.stat().st_size > 30 * 1024 * 1024:
        raise ValueError('Source exceeds 30 MiB')
    images = []
    if source.suffix.lower() == '.pdf':
        info = subprocess.run(['pdfinfo', str(source)], check=True, capture_output=True, text=True).stdout
        pages = int(next(line.split(':')[1] for line in info.splitlines() if line.startswith('Pages:')))
        selected_pages = selected_pages or list(range(1, pages + 1))
        if len(selected_pages) > 12 or any(page < 1 or page > pages for page in selected_pages):
            raise ValueError('Choose up to 12 existing PDF pages')
        for index, page in enumerate(selected_pages, 1):
            target = output / f'page-{index}'
            subprocess.run(['pdftoppm', '-f', str(page), '-l', str(page), '-singlefile', '-scale-to', '2400', '-png', str(source), str(target)], check=True, timeout=180)
            images.append(target.with_suffix('.png'))
    else:
        if selected_pages and selected_pages != [1]:
            raise ValueError('Images have only one page')
        from PIL import Image
        Image.MAX_IMAGE_PIXELS = 50000000
        with Image.open(source) as image:
            image.thumbnail((2400, 2400))
            target = output / 'page-1.png'
            image.convert('RGB').save(target)
            images = [target]
    from PIL import Image
    sizes = [Image.open(image).size for image in images]
    # Preserve lossless page evidence; bounded JPEG copies only reduce inference transport size.
    transport = []
    for image in images:
        target = image.with_name(image.stem + '-inference.jpg')
        with Image.open(image) as original:
            original.convert('RGB').save(target, quality=85, optimize=True)
        transport.append(target)
    if sum(image.stat().st_size for image in transport) > 8 * 1024 * 1024:
        raise ValueError('Rendered request is too large; submit fewer pages')
    root = Path(__file__).parent
    prompt = (root / 'prompt.txt').read_text() + '\n' + '\n'.join(
        f'Page {i + 1}: width {size[0]}, height {size[1]} pixels.' for i, size in enumerate(sizes))
    args = [codex, 'exec', '--skip-git-repo-check', '--sandbox', 'read-only',
            '--output-schema', str(root / 'extraction.schema.json'),
            '--output-last-message', str(output / 'extraction.json')]
    for image in transport:
        args += ['--image', str(image)]
    args += ['-']
    with (output / 'codex.log').open('w') as log:
        subprocess.run(args, input=prompt, text=True, stdout=log, stderr=log, check=True, timeout=1200, cwd=output)
    result = json.loads((output / 'extraction.json').read_text())
    (output / 'receipt.json').write_text(json.dumps({
        'sourceName': source.name, 'sourceSha256': hashlib.sha256(source.read_bytes()).hexdigest(),
        'sourcePages': selected_pages or [1],
        'promptSha256': hashlib.sha256(prompt.encode()).hexdigest(), 'pages': sizes,
        'status': 'needs-review', 'floorCount': len(result['floors']),
    }, indent=2))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('source', type=Path)
    parser.add_argument('output', type=Path)
    parser.add_argument('--codex', default=os.environ.get('FLOORPLAN_CODEX', 'codex'))
    args = parser.parse_args()
    extract(args.source, args.output.resolve(), args.codex)
