#!/usr/bin/env python3
"""Image half of a backup recovery set (ADR-016, review R1/R2).

backup_images.py seal <tar|-> <manifest.partial> <images.json.partial> <tar name> <ts>
    Verify that the archive holds a correct original and display derivative for every image the
    database snapshot references (manifest "image_refs"), then write the image sidecar and bind
    dump + archive + sidecar checksums into the manifest as "recovery_set". Exit 1 when anything
    referenced is missing or wrong: the backup is then never published as complete.
backup_images.py verify <tar> <refs.json>
    The same archive check for a restore (refs from the restored database).
backup_images.py safe <tar>
    Refuse archives with links, devices, absolute or parent paths, or unexpected names.

Originals are content-addressed: <2 hex>/<sha256 of the bytes>. Derivatives are <original>.display.webp.
"""
import hashlib
import json
import os
import re
import sys
import tarfile

NAME = re.compile(
    r"^[0-9a-f]{2}/[0-9a-f]{64}(\.display\.webp)?(\.[0-9a-f-]{36}\.tmp)?$"
)
DIRNAME = re.compile(r"^(\.|[0-9a-f]{2})$")


def sha_file(path):
    with open(path, "rb") as f:
        return hashlib.file_digest(f, "sha256").hexdigest()


def unsafe_members(t):
    bad = []
    for m in t.getmembers():
        name = m.name.removeprefix("./")
        if m.isdir() and DIRNAME.match(name or "."):
            continue
        if (
            not m.isfile()
            or not NAME.match(name)
            or name.startswith("/")
            or ".." in name.split("/")
        ):
            bad.append(m.name)
    return bad


def webp_ok(b):
    return (
        len(b) > 12
        and b[:4] == b"RIFF"
        and b[8:12] == b"WEBP"
        and int.from_bytes(b[4:8], "little") + 8 == len(b)
    )


def problems(tar_path, refs):
    """What is wrong with this archive for these references (empty list = complete)."""
    with tarfile.open(tar_path) as t:
        bad = unsafe_members(t)
        if bad:
            return [f"unsafe archive member(s): {', '.join(bad[:5])}"]
        files = {m.name.removeprefix("./"): m for m in t.getmembers() if m.isfile()}
        out = []
        for r in refs:
            rel, want = r["path"], r.get("checksum")
            if not re.fullmatch(r"[0-9a-f]{2}/[0-9a-f]{64}", rel or ""):
                out.append(f"invalid storage path {rel!r}")
                continue
            o, d = files.get(rel), files.get(f"{rel}.display.webp")
            if o is None:
                out.append(f"{rel}: original missing")
            else:
                got = hashlib.sha256(t.extractfile(o).read()).hexdigest()
                if got != rel.split("/")[1] or (want and got != want):
                    out.append(f"{rel}: original bytes do not match their checksum")
            if d is None:
                out.append(f"{rel}: display derivative missing")
            elif not webp_ok(t.extractfile(d).read()):
                out.append(f"{rel}: display derivative is not a complete WebP file")
        return out


def seal(tar_path, manifest_path, sidecar_path, tar_name, ts):
    m = json.load(open(manifest_path))
    refs = m.get("image_refs", [])
    set_ = {
        "dump": {"file": m["file"], "sha256": m["sha256"]},
        "images_tar": None,
        "images_manifest": None,
    }
    if tar_path == "-":
        if refs:
            sys.exit(
                f"BACKUP_FAIL: the snapshot references {len(refs)} image file(s) but no image volume was archived"
            )
    else:
        found = problems(tar_path, refs)
        if found:
            sys.exit(
                f"BACKUP_FAIL: image archive incomplete for this snapshot ({len(found)}): "
                + "; ".join(found[:5])
            )
        with tarfile.open(tar_path) as t:
            nfiles = sum(1 for x in t.getmembers() if x.isfile())
        sidecar = {
            "file": tar_name,
            "sha256": sha_file(tar_path),
            "bytes": os.path.getsize(tar_path),
            "files": nfiles,
            "referenced": len(refs),
            "verified": "every referenced original matches its checksum and has a complete WebP derivative",
            "created_utc": ts,
            "volume": "fraygrance_image_assets",
        }
        with open(sidecar_path, "w") as f:
            json.dump(sidecar, f, indent=2)
        set_["images_tar"] = {"file": tar_name, "sha256": sidecar["sha256"]}
        set_["images_manifest"] = {
            "file": tar_name.removesuffix(".tar") + ".json",
            "sha256": sha_file(sidecar_path),
        }
    m["recovery_set"] = set_
    with open(manifest_path, "w") as f:
        json.dump(m, f, indent=2)
    print(
        f"IMAGES_SEALED referenced={len(refs)} archive={'none' if tar_path == '-' else 'verified'}"
    )


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else ""
    if cmd == "seal":
        seal(*sys.argv[2:7])
    elif cmd == "verify":
        found = problems(sys.argv[2], json.load(open(sys.argv[3])))
        if found:
            sys.exit(
                f"RESTORE_TEST_FAIL: image archive incomplete ({len(found)}): "
                + "; ".join(found[:5])
            )
        print("IMAGES_ARCHIVE_PASS")
    elif cmd == "safe":
        with tarfile.open(sys.argv[2]) as t:
            bad = unsafe_members(t)
        if bad:
            sys.exit(
                f"RESTORE_TEST_FAIL: unsafe archive member(s): {', '.join(bad[:5])}"
            )
    else:
        sys.exit(__doc__)
