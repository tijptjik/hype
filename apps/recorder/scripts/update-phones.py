"""Distribute one Recorder APK to the field phones on the local Wi-Fi network."""

import argparse
import hashlib
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import re
import secrets
import shutil
import subprocess
import sys
from tempfile import TemporaryDirectory


PACKAGE = "hk.hype.recorder"
DEFAULT_APK = (
    Path(__file__).resolve().parents[1]
    / "src-tauri/gen/android/app/build/outputs/apk/universal/debug/app-universal-debug.apk"
)


def run(*args, timeout=20):
    result = subprocess.run(args, capture_output=True, text=True, timeout=timeout)
    if result.returncode:
        raise ValueError(
            (result.stderr or result.stdout).strip() or f"{args[0]} failed"
        )
    return result.stdout.strip()


def phone_identity(target):
    """Connect by the main Wireless debugging port, or use an existing mDNS transport."""
    if re.fullmatch(r"(?:[\w.-]+|\[[\da-fA-F:%.-]+\]):\d{1,5}", target):
        run("adb", "connect", target)
    elif not re.fullmatch(r"[\w.-]+\._adb-tls-connect\._tcp\.?", target):
        raise ValueError(
            f"Expected a wireless connection address or mDNS device ID: {target}"
        )
    if run("adb", "-s", target, "get-state") != "device":
        raise ValueError(f"{target} is not connected and authorized")
    serial = run("adb", "-s", target, "shell", "getprop", "ro.serialno")
    if serial.lower() in {"", "unknown", "null"}:
        raise ValueError(f"Could not identify the physical phone at {target}")
    return serial


def installed_hash(target):
    """Read the bytes of the base APK Android currently has installed."""
    packages = run("adb", "-s", target, "shell", "pm", "list", "packages", PACKAGE)
    if f"package:{PACKAGE}" not in packages.splitlines():
        return None
    paths = run("adb", "-s", target, "shell", "pm", "path", PACKAGE)
    for line in paths.splitlines():
        if re.fullmatch(r"package:/[\w./=+~-]+/base\.apk", line):
            output = run(
                "adb",
                "-s",
                target,
                "shell",
                "sha256sum",
                line.removeprefix("package:"),
                timeout=60,
            )
            return output.split()[0]
    raise ValueError("Could not locate the installed Recorder base APK")


def push(args, apk, digest):
    if len({phone_identity(target) for target in args.phones}) != 2:
        raise ValueError(
            "Both addresses identify the same phone. Select two distinct phones."
        )

    failed = False
    for target in args.phones:
        try:
            if installed_hash(target) == digest:
                print(f"{target}: already verified {digest[:12]}")
            elif args.check:
                print(f"{target}: ready for update to {digest[:12]}")
            else:
                run("adb", "-s", target, "install", "-r", str(apk), timeout=180)
                if installed_hash(target) != digest:
                    raise ValueError(
                        "installed base APK did not match the selected build"
                    )
                print(f"{target}: installed and verified {digest[:12]}")
        except (OSError, ValueError, subprocess.TimeoutExpired) as error:
            print(f"{target}: {error}", file=sys.stderr)
            failed = True
    return int(failed)


def wifi_address():
    """Find the active Wi-Fi IPv4 address each time Li changes networks."""
    interfaces = json.loads(run("ip", "-j", "-4", "addr", "show", "up"))
    addresses = [
        addr["local"]
        for interface in interfaces
        if (Path("/sys/class/net") / interface["ifname"] / "wireless").is_dir()
        for addr in interface["addr_info"]
        if addr["scope"] == "global"
    ]
    if len(addresses) != 1:
        raise ValueError(
            "Connect Li to the phone hotspot so it has one active Wi-Fi address."
        )
    return addresses[0]


def share(apk, digest):
    """Serve only this build on Li's Wi-Fi address until interrupted."""
    address = wifi_address()
    route = f"/{secrets.token_urlsafe(12)}/Recorder.apk"

    class Download(BaseHTTPRequestHandler):
        def do_HEAD(self):
            if self.path != route:
                self.send_error(404)
                return
            self.send_response(200)
            self.send_header("Content-Type", "application/vnd.android.package-archive")
            self.send_header(
                "Content-Disposition", 'attachment; filename="Recorder.apk"'
            )
            self.send_header("Content-Length", str(apk.stat().st_size))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()

        def do_GET(self):
            self.do_HEAD()
            if self.path == route:
                with apk.open("rb") as source:
                    shutil.copyfileobj(source, self.wfile)

        def log_message(self, *args):
            pass

    with ThreadingHTTPServer((address, 8765), Download) as server:
        url = f"http://{address}:8765{route}"
        print(f"Open on both phones: {url}", flush=True)
        print(f"SHA-256: {digest}\nPress Ctrl-C after both downloads.", flush=True)
        if sys.stdout.isatty() and shutil.which("bun"):
            subprocess.run(
                [
                    "bun",
                    "-e",
                    "import {renderANSI} from 'uqr'; console.log(renderANSI(process.argv[1]))",
                    url,
                ],
                cwd=Path(__file__).resolve().parents[3],
            )
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass
    return 0


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    modes = parser.add_subparsers(dest="mode", required=True)
    hotspot = modes.add_parser(
        "share", help="display the hotspot download URL and QR code"
    )
    adb = modes.add_parser("push", help="update two paired phones over wireless ADB")
    adb.add_argument(
        "phones",
        nargs=2,
        metavar="PHONE",
        help="connection IP:port or ADB Wi-Fi device ID",
    )
    adb.add_argument(
        "--check",
        action="store_true",
        help="verify connections and report update status",
    )
    for mode in (hotspot, adb):
        mode.add_argument(
            "--apk", type=Path, default=DEFAULT_APK, help="signed Recorder APK"
        )
    args = parser.parse_args()

    # Use one immutable copy throughout both updates even if another build finishes.
    with TemporaryDirectory(prefix="recorder-apk-") as directory:
        apk = Path(directory) / "Recorder.apk"
        shutil.copyfile(args.apk, apk)
        sdk = Path(
            os.environ.get("ANDROID_HOME") or Path.home() / ".local/share/android-sdk"
        )
        aapt = shutil.which("aapt") or sdk / "build-tools/37.0.0/aapt"
        if not run(aapt, "dump", "badging", apk).startswith(
            f"package: name='{PACKAGE}' "
        ):
            raise ValueError(f"Expected an APK for {PACKAGE}")
        with apk.open("rb") as source:
            digest = hashlib.file_digest(source, "sha256").hexdigest()
        return share(apk, digest) if args.mode == "share" else push(args, apk, digest)


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (OSError, ValueError, subprocess.TimeoutExpired) as error:
        sys.exit(str(error))
