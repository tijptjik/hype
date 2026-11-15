#!/usr/bin/env python3
"""Collect logo candidates from retained MTR research; never approve or publish them."""
import concurrent.futures
import hashlib
import html.parser
import json
from pathlib import Path
import urllib.parse
import urllib.request

ROOT = Path(".research/mtr-shops/2026-11-14")
OUT = ROOT / "logo-candidates"
OUT.mkdir(exist_ok=True)

class Logos(html.parser.HTMLParser):
    """Extract explicitly labelled logo images rather than favicons or social previews."""
    def __init__(self):
        super().__init__()
        self.urls = []
    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag not in ("img", "source"):
            return
        src = attrs.get("src") or attrs.get("data-src") or ""
        description = " ".join([src, attrs.get("alt") or "", attrs.get("class") or ""]).lower()
        if "logo" in description and not any(word in description for word in
            ("facebook", "instagram", "visa", "paypal", "mastercard", "whatsapp")):
            self.urls.append(src)

def collect(item):
    """Retain bounded original image bytes and their unverified source association."""
    identity, rows = item
    report = {"id": identity, "name": rows[0]["canonicalName"], "status": "needs-source", "candidates": []}
    urls = {}
    for row in rows:
        source = corporate.get(row["businessKey"], {})
        if source.get("directoryStatus") == "candidate-rejected-wrong-company":
            continue
        for evidence in source.get("evidence", []):
            path = Path(evidence.get("rawPath", "/nonexistent"))
            if not path.is_file():
                continue
            parser = Logos()
            parser.feed(path.read_text(errors="replace"))
            base = evidence.get("finalUrl") or evidence.get("requestedUrl", "")
            for candidate in parser.urls:
                url = urllib.parse.urljoin(base, candidate)
                if url.startswith(("https://", "http://")):
                    urls[url] = base
    for url in sorted(urls, key=lambda value: (".svg" not in value.lower(), value))[:6]:
        entry = {"url": url, "pageUrl": urls[url]}
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req, timeout=12) as response:
                data = response.read(4 * 1024 * 1024 + 1)
                mime = response.headers.get("Content-Type", "")
                entry["finalUrl"] = response.geturl()
            if len(data) > 4 * 1024 * 1024 or not ("image/" in mime or b"<svg" in data[:1000]):
                raise ValueError("Not a bounded image")
            digest = hashlib.sha256(data).hexdigest()
            ext = "svg" if b"<svg" in data[:1000] else "png" if data.startswith(b"\x89PNG") else "jpg" if data.startswith(b"\xff\xd8") else "image"
            path = OUT / f"{digest}.{ext}"
            path.write_bytes(data)
            entry.update(file=str(path), sha256=digest, format=ext, status="unreviewed")
            report["status"] = "needs-visual-review"
        except Exception as error:
            entry["error"] = str(error)
        report["candidates"].append(entry)
    return report

if __name__ == "__main__":
    corporate = {row["businessKey"]: row for row in json.loads((ROOT / "corporate/catalogue.json").read_text())}
    groups = {}
    for row in json.loads(Path("scripts/catalogue/mtr-network-reconciliation.json").read_text())["decisions"]:
        if row["action"] == "create":
            groups.setdefault(row["targetId"], []).append(row)
    with concurrent.futures.ThreadPoolExecutor(max_workers=10) as pool:
        reports = list(pool.map(collect, groups.items()))
    (OUT / "manifest.json").write_text(json.dumps(reports, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"brands": len(reports), "withCandidates": sum(row["status"] == "needs-visual-review" for row in reports)}))
