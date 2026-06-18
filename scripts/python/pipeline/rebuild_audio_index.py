#!/usr/bin/env python3
"""
rebuild_audio_index.py — Full rebuild from scratch.

Scans ALL audio files under BASE_DIR (recursive, unlimited depth).
Preserves linked_page from existing entries by matching on file_path.
Determines book_name intelligently:
  - Files in Audio/ dir get the parent directory as book_name
  - Files in deep structure use the lowest unique subdirectory as book_name
Sets cd_num from filename/path (CD/Disk/Disc patterns).
Fixes CD0 → cd_num=1 (Arbeitsbuch files mislabeled as CD0).

Usage:
    python3 rebuild_audio_index.py       # rebuild (asks confirmation)
    python3 rebuild_audio_index.py --yes  # skip confirmation
"""

import argparse
import os
import re
import subprocess
import sys
from collections import defaultdict

BASE_DIR = "/home/f/deutsch-app/de"
DB_NAME = "deutsch"
AUDIO_EXTS = {".mp3", ".m4a", ".wav", ".ogg", ".flac", ".wma"}

RE_CD = re.compile(r"(?:CD|Disk|Disc)[ _-]?(\d+)", re.IGNORECASE)
RE_TRACK = re.compile(r"(?:Track|T)[ _-]?(\d+)", re.IGNORECASE)
RE_FLAT = re.compile(
    r"^(.+?)_(KB|AB|LB|CD|TB|UB)_CD(\d+)_T(\d+)_(.+)\.(mp3|m4a|wav)$", re.IGNORECASE
)


def psql(sql):
    r = subprocess.run(["psql", "-d", DB_NAME, "-Atq"], input=sql, text=True,
                       capture_output=True, timeout=120)
    if r.returncode:
        raise RuntimeError(f"psql: {r.stderr.strip()[:200]}")
    return r.stdout.strip()


def dq(val):
    tag = "DQTAG"
    while tag in val:
        tag = f"DQTAG{hash(val) & 0x7fffffff}"
    return f"${tag}${val}${tag}$"


def walk_all(base):
    files = []
    for dirpath, dirnames, filenames in os.walk(base):
        dirnames[:] = [d for d in dirnames if not d.startswith(".") and d != "__pycache__"]
        for fn in filenames:
            if os.path.splitext(fn)[1].lower() in AUDIO_EXTS:
                files.append(os.path.join(dirpath, fn))
    return files


def classify(path, base):
    """Return {book_name, is_audio_dir, cd_num, track_num}."""
    rel = os.path.relpath(path, base)
    parts = rel.replace("\\", "/").split("/")
    book_dir = parts[0]
    book_name = book_dir
    is_audio = len(parts) >= 2 and parts[1] == "Audio"

    fname = os.path.basename(path)

    # Book name for non-Audio files: use first directory component
    # (the top-level book dir, e.g. "Lagune_2", "Schritte Plus Neu A1.1")
    if not is_audio:
        book_name = parts[0]

    # Parse cd_num and track_num
    cd_num = None
    track_num = None

    m = RE_FLAT.match(fname)
    if m:
        cd_num = int(m.group(3))
        if cd_num == 0:
            cd_num = 1
        track_num = int(m.group(4))
    else:
        m = RE_CD.search(fname) or RE_CD.search(path)
        if m:
            cd_num = int(m.group(1))
            if cd_num == 0:
                cd_num = 1
        m = RE_TRACK.search(fname) or RE_TRACK.search(path)
        if m:
            track_num = int(m.group(1))

    return {
        "abspath": path,
        "relpath": rel,
        "fname": fname,
        "book_dir": book_dir,
        "book_name": book_name,
        "is_audio_dir": is_audio,
        "cd_num": cd_num,
        "track_num": track_num,
    }


def bulk_insert(rows):
    """Insert rows in batches of 500."""
    batch_size = 500
    total = len(rows)
    for start in range(0, total, batch_size):
        batch = rows[start:start + batch_size]
        values = []
        for r in batch:
            name = dq(r["fname"])
            path = dq(r["abspath"])
            book = dq(r["book_name"])
            cd = "NULL" if r["cd_num"] is None else str(r["cd_num"])
            tr = "NULL" if r["track_num"] is None else str(r["track_num"])
            dir_name = dq(r["book_dir"])
            values.append(
                f"({name}, {path}, {book}, {cd}, {tr}, {dir_name})"
            )
        sql = (
            "INSERT INTO audio_index (file_name, file_path, book_name, cd_num, track_num, directory)\n"
            "VALUES\n" + ",\n".join(values) + ";\n"
        )
        psql(sql)
        done = min(start + batch_size, total)
        print(f"   Inserted {done}/{total}", flush=True)


def run(args):
    print("🔍 Scanning all files (unlimited depth)...")
    all_files = walk_all(BASE_DIR)
    print(f"   Found {len(all_files)} audio files")

    # Load existing linked_page data keyed by file_path
    print("📦 Saving existing linked_page data...")
    existing = psql("""
        SELECT file_path, linked_page FROM audio_index
        WHERE linked_page IS NOT NULL
    """)
    link_map = {}
    for line in existing.strip().split("\n") if existing.strip() else []:
        parts = line.split("\t", 1)
        if len(parts) == 2 and parts[1]:
            link_map[parts[0]] = parts[1]
    print(f"   Saved {len(link_map)} linked_page entries")

    # Classify all files
    print("🏷️  Classifying files...")
    classified = [classify(f, BASE_DIR) for f in all_files]

    # Stats
    audio_dir_count = sum(1 for c in classified if c["is_audio_dir"])
    original_count = len(classified) - audio_dir_count
    print(f"   Audio/ dir files: {audio_dir_count}")
    print(f"   Original structure files: {original_count}")

    cd0_count = sum(1 for c in classified if c["cd_num"] == 0)
    if cd0_count:
        print(f"   ⚠️  Files with CD0 mislabel: {cd0_count} (will be set to cd_num=1)")

    if not args.yes:
        ans = input(f"\nRebuild audio_index with {len(classified)} rows? (y/N): ").strip().lower()
        if ans != "y":
            print("Aborted.")
            return

    # Delete all existing rows
    print("🗑️  Clearing audio_index...")
    psql("DELETE FROM audio_index;")
    print("   Cleared")

    # Insert new rows
    print("➕ Inserting entries...")
    bulk_insert(classified)

    # Restore linked_page where possible
    print("🔗 Restoring linked_page...")
    restored = 0
    for r in classified:
        if r["abspath"] in link_map:
            page = link_map[r["abspath"]]
            safe_path = r["abspath"].replace("'", "''")
            psql(f"UPDATE audio_index SET linked_page = {page} WHERE file_path = '{safe_path}';\n")
            restored += 1
    print(f"   Restored {restored} linked_page entries")

    # Final stats
    total = psql("SELECT COUNT(*) FROM audio_index;")
    with_cd = psql("SELECT COUNT(*) FROM audio_index WHERE cd_num IS NOT NULL;")
    null_cd = psql("SELECT COUNT(*) FROM audio_index WHERE cd_num IS NULL;")
    with_link = psql("SELECT COUNT(*) FROM audio_index WHERE linked_page IS NOT NULL;")
    with_cd0 = psql("SELECT COUNT(*) FROM audio_index WHERE cd_num = 0;")

    print(f"\n{'='*50}")
    print(f"  Final State")
    print(f"{'='*50}")
    print(f"  Total rows            : {total}")
    print(f"  With cd_num           : {with_cd}")
    print(f"  NULL cd_num           : {null_cd}")
    print(f"  cd_num=0 (bad)        : {with_cd0}")
    print(f"  With linked_page      : {with_link}")
    print(f"{'='*50}")


def main():
    parser = argparse.ArgumentParser(description="Rebuild audio_index from scratch")
    parser.add_argument("--yes", action="store_true", help="Skip confirmation")
    args = parser.parse_args()
    try:
        run(args)
    except RuntimeError as e:
        print(f"ERROR: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
