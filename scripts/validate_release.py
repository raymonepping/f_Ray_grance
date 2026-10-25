#!/usr/bin/env python3
"""Validate the frozen v0.1.6 documentation baseline.

Layout: authoritative spec documents live in spec/, agent prompts in prompts/,
ADRs in docs/adr/. spec/MANIFEST.json hash-locks only the frozen documentation
set; files that implementation phases legitimately evolve (Makefile, scripts,
.gitignore, README, infra, ansible) are deliberately not hash-locked.

  python3 scripts/validate_release.py            # verify
  python3 scripts/validate_release.py --rehash   # re-lock after an accepted doc change
"""
import hashlib
import json
import re
import sys
from pathlib import Path

r = Path(__file__).resolve().parents[1]
spec = r / "spec"
manifest_path = spec / "MANIFEST.json"
FROZEN_GLOBS = ["spec/*.md", "prompts/*.md", "prompts/*/*.md", "docs/adr/*.md"]


def sha(p: Path) -> str:
    return hashlib.sha256(p.read_bytes()).hexdigest()


def frozen_files():
    out = set()
    for g in FROZEN_GLOBS:
        out.update(p for p in r.glob(g) if p.is_file())
    return sorted(out)


if "--rehash" in sys.argv:
    m = json.loads(manifest_path.read_text())
    m["layout"] = {"spec_dir": "spec/", "frozen_globs": FROZEN_GLOBS}
    m["files"] = [
        {"path": str(p.relative_to(r)), "bytes": p.stat().st_size, "sha256": sha(p)}
        for p in frozen_files()
    ]
    manifest_path.write_text(json.dumps(m, indent=2) + "\n")
    print(f"REHASHED: {len(m['files'])} frozen documentation files")
    sys.exit(0)

manifest = json.loads(manifest_path.read_text())
assert manifest["version"] == "0.1.6"
for item in manifest["files"]:
    p = r / item["path"]
    assert p.is_file(), p
    assert sha(p) == item["sha256"], f"{p} changed since freeze; review, then --rehash"
listed = {item["path"] for item in manifest["files"]}
unlisted = [
    str(p.relative_to(r)) for p in frozen_files() if str(p.relative_to(r)) not in listed
]
assert not unlisted, f"frozen docs not in manifest: {unlisted}"

SKIP_DIRS = {
    "node_modules",
    ".git",
    ".nuxt",
    ".output",
    "test-results",
    "playwright-report",
    ".terraform",
}
n = 0
broken = []
for p in r.rglob("*.md"):
    if SKIP_DIRS.intersection(p.parts):
        continue
    s = p.read_text()
    assert (
        "v0.1.5" not in s or p.name in ("RELEASE_NOTES.md",) or "reports" in p.parts
    ), p
    for target in re.findall(r"(?<!!)\[[^\]]+\]\(([^)]+)\)", s):
        path = target.split("#")[0].split("?")[0].strip()
        if not path or path.startswith(("http://", "https://", "mailto:", "sandbox:")):
            continue
        if "<" in path or ">" in path:
            continue
        if not (p.parent / path).exists():
            broken.append((str(p.relative_to(r)), target))
        n += 1
for agent in ["Claude", "Codex", "IBM_Bob"]:
    prompts = list((r / "prompts" / agent).glob("*.md"))
    assert len(prompts) == 11
    for f in prompts:
        s = f.read_text()
        for q in [
            "PHASE_MANIFEST.md",
            "origin/main",
            "Tailscale Serve HTTPS",
            "Backups are manual only",
            "state/BUILD_STATE.json",
            "./scripts/commit_gh",
        ]:
            assert q in s, (f, q)
for f in (r / "prompts" / "launchers").glob("*.md"):
    s = f.read_text()
    assert all(
        q in s for q in ["PHASE_MANIFEST.md", "origin/main", "Backups are manual only"]
    )
for f in [
    "PRODUCT_SPEC.md",
    "ARCHITECTURE.md",
    "SECURITY.md",
    "OPERATIONS.md",
    "DESIGN.md",
    "QUALITY.md",
    "PHASE_00.md",
]:
    assert "Tailscale" in (spec / f).read_text(), f
for f in [
    "PRODUCT_SPEC.md",
    "ARCHITECTURE.md",
    "SECURITY.md",
    "DATA_PERSISTENCE.md",
    "OPERATIONS.md",
    "DESIGN.md",
    "QUALITY.md",
    "PHASE_00.md",
]:
    assert "manual" in (spec / f).read_text().lower(), f
assert not broken, broken
print(
    f"PASS: {len(manifest['files'])} frozen docs hash-verified, 36 prompts, required hardening references and {n} local Markdown links"
)
