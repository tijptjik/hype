"""Version-preserving, two-way R2 sync of Hype's ignored research directory."""
import hashlib
import json
import pathlib
import subprocess
import datetime
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2] / '.research'
REMOTE = 'r2-tijpdata:hype-research'
STATE = ROOT / '.sync/state.json'


def action(local, remote, previous):
    """Choose a transfer only when one side changed; never propagate deletion."""
    if local == remote:
        return 'equal'
    if local is None:
        return 'pull'
    if remote is None:
        return 'push'
    if previous is not None and remote == previous:
        return 'push'
    if previous is not None and local == previous:
        return 'pull'
    return 'conflict'


def run(*args):
    """Run rclone without shell interpolation or exposing its credentials."""
    return subprocess.run(['rclone', *map(str, args)], check=True, capture_output=True, text=True).stdout


def local_files():
    """Hash only regular research files; never follow symlinks outside the archive."""
    result = {}
    for path in ROOT.rglob('*'):
        if path.is_symlink():
            raise RuntimeError(f'Research symlinks are not supported: {path}')
        rel = path.relative_to(ROOT).as_posix()
        if path.is_file() and not rel.startswith('.sync/'):
            result[rel] = hashlib.md5(path.read_bytes()).hexdigest()
    return result


def remote_files():
    """Read R2 hashes and reject unsafe paths before any local transfer."""
    rows = json.loads(run('lsjson', REMOTE, '--recursive', '--files-only', '--hash-type', 'md5', '--no-modtime', '--no-mimetype', '--exclude', '.sync/**'))
    result = {}
    for row in rows:
        name = row['Path']
        if name.startswith('/') or '..' in pathlib.PurePosixPath(name).parts:
            raise RuntimeError('Unsafe remote research path')
        digest = row.get('Hashes', {}).get('md5')
        if not digest:
            raise RuntimeError(f'Missing R2 checksum for {name}; manual verification required')
        result[name] = digest
    return result


def main():
    """Synchronise changed files with retained prior versions and an atomic baseline."""
    ROOT.mkdir(parents=True, exist_ok=True)
    previous = json.loads(STATE.read_text()) if STATE.exists() else {}
    local, remote = local_files(), remote_files()
    baseline = dict(previous)
    version = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S.%fZ')
    conflicts = []
    for name in sorted(local.keys() | remote.keys()):
        choice = action(local.get(name), remote.get(name), previous.get(name))
        src, dst = ROOT / name, f'{REMOTE}/{name}'
        if choice == 'conflict':
            conflicts.append(name)
            continue
        if choice == 'push':
            if name in remote:
                run('copyto', dst, f'{REMOTE}/.sync/versions/{version}/{name}', '--immutable')
            run('copyto', src, dst, '--checksum')
            remote[name] = local[name]
            print('Uploaded:', name, flush=True)
        elif choice == 'pull':
            if name in local:
                saved = ROOT / '.sync/versions' / version / name
                saved.parent.mkdir(parents=True, exist_ok=True)
                saved.write_bytes(src.read_bytes())
            src.parent.mkdir(parents=True, exist_ok=True)
            temporary = ROOT / '.sync/incoming'
            temporary.parent.mkdir(parents=True, exist_ok=True)
            run('copyto', dst, temporary)
            if hashlib.md5(temporary.read_bytes()).hexdigest() != remote[name]:
                raise RuntimeError(f'Download checksum mismatch: {name}')
            temporary.replace(src)
            local[name] = remote[name]
            print('Downloaded:', name, flush=True)
        baseline[name] = local[name]
    # Do not mark transfers as synchronised until remote hashes agree.
    verified = remote_files()
    for name, digest in local.items():
        if name not in conflicts and verified.get(name) != digest:
            raise RuntimeError(f'Post-sync checksum mismatch: {name}')
    STATE.parent.mkdir(parents=True, exist_ok=True)
    temporary = STATE.with_suffix('.tmp')
    temporary.write_text(json.dumps(baseline, sort_keys=True, indent=2) + '\n')
    temporary.replace(STATE)
    print(f'Verified {len(local) - len(conflicts)} research files; {len(conflicts)} conflicts')
    for name in conflicts:
        print('CONFLICT (both copies preserved):', name, file=sys.stderr)
    return 1 if conflicts else 0


if __name__ == '__main__':
    sys.exit(main())
