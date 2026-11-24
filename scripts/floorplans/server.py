#!/usr/bin/env python3
"""Private local/Si Codex extraction adapter. Never publishes generated geometry."""
from concurrent.futures import ThreadPoolExecutor
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import hashlib
import hmac
import json
import os
from pathlib import Path
import shutil
import threading
import socketserver
import uuid
from extract import extract

ROOT = Path(os.environ.get('FLOORPLAN_STATE', '/tmp/hype-floorplan-jobs'))
TOKEN = os.environ.get('FLOORPLAN_TOKEN', '')
EXECUTOR = ThreadPoolExecutor(max_workers=1)
SLOTS = threading.BoundedSemaphore(8)
RETRY_LOCK = threading.Lock()


def write(path, value):
    """Atomically replace a status receipt."""
    temporary = path.with_suffix('.tmp')
    temporary.write_text(json.dumps(value))
    temporary.replace(path)


def work(directory, source):
    """Process one bounded extraction; expose no subprocess logs to API clients."""
    try:
        write(directory / 'status.json', {'status': 'running'})
        selection = directory / 'selection.json'
        extract(source, directory, os.environ.get('FLOORPLAN_CODEX', 'codex'), json.loads(selection.read_text()) if selection.exists() else None)
        write(directory / 'status.json', {'status': 'needs-review'})
    except Exception:
        write(directory / 'status.json', {'status': 'failed', 'message': 'Extraction failed; inspect the private worker log.'})
    finally:
        SLOTS.release()


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *_args):
        """Avoid retaining request paths or source names in HTTP logs."""

    def reply(self, status, value):
        body = json.dumps(value).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def authorized(self):
        return bool(TOKEN) and hmac.compare_digest(self.headers.get('Authorization', ''), 'Bearer ' + TOKEN)

    def do_POST(self):
        if not self.authorized():
            return self.reply(403, {'error': 'Forbidden'})
        parts = self.path.strip('/').split('/')
        if len(parts) == 3 and parts[0] == 'jobs' and parts[2] == 'retry':
            with RETRY_LOCK:
                try:
                    directory = ROOT / str(uuid.UUID(parts[1]))
                    status = json.loads((directory / 'status.json').read_text())
                except (ValueError, FileNotFoundError):
                    return self.reply(404, {'error': 'Not found'})
                if status.get('status') != 'failed':
                    return self.reply(409, {'error': 'Only failed jobs can be retried'})
                if not SLOTS.acquire(blocking=False):
                    return self.reply(429, {'error': 'Worker queue is full'})
                sources = list(directory.glob('source.*'))
                if len(sources) != 1:
                    SLOTS.release()
                    return self.reply(409, {'error': 'Source is unavailable'})
                write(directory / 'status.json', {'status': 'queued'})
                EXECUTOR.submit(work, directory, sources[0])
                return self.reply(202, {'id': directory.name})
        if self.path != '/jobs':

            return self.reply(404, {'error': 'Not found'})
        try:
            selection = self.headers.get('X-Floorplan-Pages', '')
            selected = [int(page.strip()) for page in selection.split(',')] if selection else None
            if selected and (len(selected) > 12 or len(set(selected)) != len(selected) or any(page < 1 or page > 1000 for page in selected)):
                raise ValueError('Invalid page selection')
        except ValueError:
            return self.reply(400, {'error': 'Select up to 12 distinct page numbers'})
        try:
            size = int(self.headers.get('Content-Length', '0'))
        except ValueError:
            return self.reply(400, {'error': 'Invalid content length'})
        if not 0 < size <= 30 * 1024 * 1024:
            return self.reply(413, {'error': 'Maximum source size is 30 MiB'})
        if not SLOTS.acquire(blocking=False):
            return self.reply(429, {'error': 'Worker queue is full'})
        body = self.rfile.read(size)
        suffix = '.pdf' if body.startswith(b'%PDF-') else '.png' if body.startswith(b'\x89PNG') else '.jpg' if body.startswith(b'\xff\xd8') else None
        if not suffix:
            SLOTS.release()
            return self.reply(400, {'error': 'Use PDF, PNG or JPEG'})
        job = str(uuid.uuid4())
        directory = ROOT / job
        directory.mkdir(parents=True, mode=0o700)
        source = directory / ('source' + suffix)
        source.write_bytes(body)
        write(directory / 'selection.json', selected)
        write(directory / 'status.json', {'status': 'queued'})
        EXECUTOR.submit(work, directory, source)
        self.reply(202, {'id': job, 'sha256': hashlib.sha256(body).hexdigest()})

    def do_GET(self):
        if not self.authorized():
            return self.reply(403, {'error': 'Forbidden'})
        parts = self.path.strip('/').split('/')
        if len(parts) not in (2, 3) or parts[0] != 'jobs':
            return self.reply(404, {'error': 'Not found'})
        try:
            job = str(uuid.UUID(parts[1]))
        except ValueError:
            return self.reply(404, {'error': 'Not found'})
        directory = ROOT / job
        status = directory / 'status.json'
        if not status.exists():
            return self.reply(404, {'error': 'Not found'})
        if len(parts) == 3:
            filename = parts[2]
            if not filename.startswith('page-') or not filename.endswith('.png') or not filename[5:-4].isdigit():
                return self.reply(404, {'error': 'Not found'})
            page = directory / filename
            if not page.exists():
                return self.reply(404, {'error': 'Not found'})
            self.send_response(200)
            self.send_header('Content-Type', 'image/png')
            self.send_header('Content-Length', str(page.stat().st_size))
            self.end_headers()
            with page.open('rb') as source:
                shutil.copyfileobj(source, self.wfile)
            return
        value = json.loads(status.read_text())
        if value['status'] == 'needs-review':
            value['extraction'] = json.loads((directory / 'extraction.json').read_text())
            value['receipt'] = json.loads((directory / 'receipt.json').read_text())
            value['pages'] = [page.name for page in sorted(directory.glob('page-*.png'), key=lambda page: int(page.stem.split('-')[1]))]
        self.reply(200, value)


if __name__ == '__main__':
    if not TOKEN:
        raise SystemExit('Set FLOORPLAN_TOKEN in the private service environment')
    os.umask(0o077)
    ROOT.mkdir(parents=True, exist_ok=True)
    socket = os.environ.get('FLOORPLAN_SOCKET')
    if socket:
        class UnixServer(socketserver.ThreadingMixIn, socketserver.UnixStreamServer):
            daemon_threads = True
        path = Path(socket)
        path.unlink(missing_ok=True)
        server = UnixServer(socket, Handler)
        path.chmod(0o660)
    else:
        server = ThreadingHTTPServer((os.environ.get('FLOORPLAN_BIND', '127.0.0.1'), int(os.environ.get('FLOORPLAN_PORT', '8791'))), Handler)
    # Interrupted jobs are recoverable failures, never permanently running receipts.
    for status in ROOT.glob('*/status.json'):
        value = json.loads(status.read_text())
        if value.get('status') in ('queued', 'running'):
            write(status, {'status': 'failed', 'message': 'Worker restarted; retry this source.'})
    server.serve_forever()
