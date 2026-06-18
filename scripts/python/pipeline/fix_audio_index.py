#!/usr/bin/env python3
"""
fix_audio_index.py — Comprehensive audio_index reconciliation.

Unifies audio_index with the actual filesystem in one pass:
  - Scans ALL audio files under /home/f/deutsch-app/de/
  - Adds new entries for files not in audio_index
  - Removes entries pointing to non-existent files
  - Infers cd_num, track_num, book_name, directory from filepath/filename
  - Maps book_name to materials_registry book_name for transcription linking
  - Sets linked_page where audio tracks map to a known transcription page

Usage:
    python3 fix_audio_index.py                   # full run (asks for confirmation)
    python3 fix_audio_index.py --yes             # skip confirmation
    python3 fix_audio_index.py --dry-run         # report only, no changes
    python3 fix_audio_index.py --scan-only       # re-scan filesystem + report, no DB writes
"""

import argparse
import csv
import os
import re
import subprocess
import sys
from collections import defaultdict

BASE_DIR = "/home/f/deutsch-app/de"
DB_NAME = "deutsch"
AUDIO_EXTS = {".mp3", ".m4a", ".wav", ".ogg", ".flac", ".wma"}


# ── helpers ──────────────────────────────────────────────────────

def psql(sql: str) -> str:
    cmd = ["psql", "-d", DB_NAME, "-Atq"]
    r = subprocess.run(cmd, input=sql, text=True, capture_output=True, timeout=60)
    if r.returncode:
        raise RuntimeError(f"psql error: {r.stderr.strip()[:300]}")
    return r.stdout.strip()


def psql_rows(sql: str) -> list[list[str]]:
    cmd = ["psql", "-d", DB_NAME, "-At", "-F", "\t"]
    r = subprocess.run(cmd, input=sql, text=True, capture_output=True, timeout=60)
    if r.returncode:
        raise RuntimeError(f"psql error: {r.stderr.strip()[:300]}")
    out = r.stdout.strip()
    if not out:
        return []
    return [row.split("\t") for row in out.split("\n")]


def psql_execute(sql: str):
    proc = subprocess.Popen(["psql", "-d", DB_NAME, "-v", "ON_ERROR_STOP=1"],
                            stdin=subprocess.PIPE, text=True)
    proc.stdin.write(sql)
    proc.stdin.close()
    r = proc.wait()
    if r != 0:
        raise RuntimeError(f"psql execute error (exit {r})")


def quote_literal(val: str) -> str:
    escaped = val.replace("'", "''")
    return f"E'{escaped}'"


def dq(val: str) -> str:
    tag = "DQTAG"
    while tag in val:
        tag = f"DQTAG{hash(val) & 0x7fffffff}"
    return f"${tag}${val}${tag}$"


# ── filesystem scan ──────────────────────────────────────────────

def walk_audio(base: str) -> list[dict]:
    """Return list of {abspath, relpath, book_dir, filename} for every audio file found."""
    files = []
    for dirpath, dirnames, filenames in os.walk(base):
        dirnames[:] = [d for d in dirnames if not d.startswith(".") and d != "__pycache__"]
        for fname in filenames:
            ext = os.path.splitext(fname)[1].lower()
            if ext in AUDIO_EXTS:
                abspath = os.path.join(dirpath, fname)
                relpath = os.path.relpath(abspath, base)
                # top-level book directory (first component of relpath)
                book_dir = relpath.split(os.sep)[0]
                files.append({
                    "abspath": abspath,
                    "relpath": relpath,
                    "book_dir": book_dir,
                    "filename": fname,
                })
    return files


# ── filename parsing ─────────────────────────────────────────────

# Pattern 1: flattened naming — {Book}_{Source}_CD{N}_T{NN}_{Desc}.mp3
#   e.g. B2_KB_CD1_T01_B2_EM_neu_-_01.mp3
#   e.g. Lagune3_AB_CD1_T01_Lagune_3_Arbeitsbuch_01.mp3
RE_FLAT = re.compile(
    r"^(.+?)_(KB|AB|LB|CD|TB|UB)_CD(\d+)_T(\d+)_(.+)\.(mp3|m4a|wav)$", re.IGNORECASE
)

# Pattern 2: Delfin naming — Delfin_DelphinX_Y_CDN_TNN.mp3
RE_DELFIN = re.compile(
    r"^Delfin_Delphin\d+_\d+_CD(\d+)_T(\d+)", re.IGNORECASE
)

# Pattern 3: old structure with "CD N" or "Track NN" in name
RE_OLD_CD = re.compile(r"(?:CD|Disk|Disc)[ _-]?(\d+)", re.IGNORECASE)
RE_OLD_TRACK = re.compile(r"(?:Track|T)[ _-]?(\d+)", re.IGNORECASE)


def parse_filename(fname: str, abspath: str) -> dict:
    """Return {cd_num, track_num, source_type} or None-filled dict."""
    info = {"cd_num": None, "track_num": None, "source_type": None}

    m = RE_FLAT.match(fname)
    if m:
        info["source_type"] = m.group(2).upper()
        info["cd_num"] = int(m.group(3))
        info["track_num"] = int(m.group(4))
        return info

    m = RE_DELFIN.match(fname)
    if m:
        info["cd_num"] = int(m.group(1))
        info["track_num"] = int(m.group(2))
        return info

    # fallback: extract CD/Disk/Disc + Track from filename or path
    m = RE_OLD_CD.search(fname) or RE_OLD_CD.search(abspath)
    if m:
        info["cd_num"] = int(m.group(1))

    m = RE_OLD_TRACK.search(fname) or RE_OLD_TRACK.search(abspath)
    if m:
        info["track_num"] = int(m.group(1))

    return info


def infer_book_name_from_path(abspath: str, relpath: str, book_dir: str, fname: str) -> str:
    """Best-effort book_name inference from the file path."""
    parts = relpath.replace("\\", "/").split("/")

    # Flattened Audio/ directory — the parent dir often names the book
    if len(parts) >= 2 and parts[1] == "Audio":
        return parts[0]  # e.g. "B2", "Lagune_3"

    # Original structure: try to find a recognizable pattern
    # e.g. "Lagune_1/Lagune 1/Kursbuch + CD/Kursbuch-CD1/..."
    for p in parts:
        low = p.lower()
        if "kursbuch" in low or "arbeitsbuch" in low or "lehrerhandbuch" in low:
            return p

    # Fallback: first directory component
    return book_dir


def map_book_name_to_materials_registry(ai_book: str, materials_books: set) -> str | None:
    """Try to match an audio_index book_name to a materials_registry book_name."""
    low = ai_book.lower().replace(" ", "").replace("_", "").replace("-", "")
    for mb in materials_books:
        mb_low = mb.lower().replace(" ", "").replace("_", "").replace("-", "")
        # Check if one contains the other (after normalization)
        if low in mb_low or mb_low in low:
            return mb
        # Check last path component
        mb_last = mb.split("/")[-1].lower().replace(" ", "").replace("_", "").replace("-", "")
        if low == mb_last:
            return mb
    return None


# ── main reconciliation ──────────────────────────────────────────

def build_report(fs_files: list[dict], db_rows: dict[str, dict],
                 matched: set, unmatched_fs: list, unmatched_db: list,
                 book_map: dict, materials_books: set):
    """Print a concise report."""
    print(f"{'='*60}")
    print(f"  Audio Index Reconciliation Report")
    print(f"{'='*60}")
    print(f"  Filesystem audio files     : {len(fs_files)}")
    print(f"  DB audio_index rows         : {len(db_rows)}")
    print(f"  Matched (path exists)       : {len(matched)}")
    print(f"  New (in FS, not in DB)      : {len(unmatched_fs)}")
    print(f"  Dead (in DB, not on FS)     : {len(unmatched_db)}")
    print(f"  After cleanup, DB would have: {len(matched) + len(unmatched_fs)}")
    print()

    if unmatched_db:
        print(f"  Dead entries by book:")
        dead_counts = defaultdict(int)
        for row in unmatched_db:
            dead_counts[row.get("book_name", "?")] += 1
        for bk, cnt in sorted(dead_counts.items(), key=lambda x: -x[1])[:10]:
            print(f"    {bk}: {cnt}")
        print()

    if unmatched_fs:
        print(f"  New files by book_dir:")
        new_counts = defaultdict(int)
        for f in unmatched_fs:
            new_counts[f["book_dir"]] += 1
        for bk, cnt in sorted(new_counts.items(), key=lambda x: -x[1])[:10]:
            print(f"    {bk}: {cnt}")
        print()

    if book_map:
        print(f"  Book name mappings (audio_index → materials_registry):")
        for ai_bk, mr_bk in sorted(book_map.items())[:15]:
            print(f"    {ai_bk:<30s} → {mr_bk}")
        if len(book_map) > 15:
            print(f"    ... and {len(book_map) - 15} more")
        print()

    unlinked = sum(1 for row in db_rows.values() if row.get("linked_page") in (None, ""))
    print(f"  Audio tracks without linked_page: {unlinked} / {len(db_rows)}")


def run(args):
    dry_run = args.dry_run
    yes = args.yes

    print("🔍 Scanning filesystem for audio files...")
    fs_files = walk_audio(BASE_DIR)
    fs_by_path = {f["abspath"]: f for f in fs_files}

    print(f"   Found {len(fs_files)} audio files under {BASE_DIR}")

    # Load existing audio_index
    print("📦 Loading audio_index from DB...")
    rows_raw = psql_rows("""
        SELECT id, file_name, file_path, directory, book_name,
               COALESCE(cd_num::text, ''), COALESCE(track_num::text, ''),
               COALESCE(linked_page::text, '')
        FROM audio_index
    """)
    db_rows = {}
    for r in rows_raw:
        if len(r) >= 8:
            row_id, fname, fpath, directory, book_name, cd_num, track_num, linked_page = r[:8]
            db_rows[fpath] = {
                "id": row_id, "file_name": fname, "file_path": fpath,
                "directory": directory, "book_name": book_name,
                "cd_num": cd_num, "track_num": track_num, "linked_page": linked_page,
            }

    # Load materials_registry book_names for mapping
    mr_raw = psql_rows("SELECT DISTINCT book_name FROM materials_registry")
    materials_books = set(r[0] for r in mr_raw if r)

    # Classify
    matched_paths = set()
    unmatched_fs = []   # files on disk not in DB
    unmatched_db = []   # DB entries not on disk

    for f in fs_files:
        if f["abspath"] in db_rows:
            matched_paths.add(f["abspath"])
        else:
            unmatched_fs.append(f)

    for path, row in db_rows.items():
        if path not in fs_by_path:
            unmatched_db.append(row)

    # Try to match unmatched FS files to DB entries by filename (in case path changed)
    filename_to_db = defaultdict(list)
    for path, row in db_rows.items():
        filename_to_db[row["file_name"].lower()].append(row)

    fs_matched_by_name = 0
    still_unmatched_fs = []
    for f in unmatched_fs:
        low_name = f["filename"].lower()
        if low_name in filename_to_db:
            candidates = filename_to_db[low_name]
            # Update path to new location
            for row in candidates:
                if row["file_path"] != f["abspath"]:
                    pass  # we'll handle this in the fix phase
            fs_matched_by_name += 1
            matched_paths.add(f["abspath"])
        else:
            still_unmatched_fs.append(f)

    # Build book name mapping
    all_ai_books = set(row["book_name"] for row in db_rows.values() if row["book_name"])
    book_map = {}
    for ab in sorted(all_ai_books):
        m = map_book_name_to_materials_registry(ab, materials_books)
        if m:
            book_map[ab] = m

    # Report
    build_report(fs_files, db_rows, matched_paths, still_unmatched_fs,
                 unmatched_db, book_map, materials_books)

    if args.scan_only:
        print("🔍 Scan-only mode. No changes made.")
        return

    if not yes and not dry_run:
        answer = input("\nApply changes? (y/N): ").strip().lower()
        if answer != "y":
            print("Aborted.")
            return

    # ── PHASE 1: Remove dead entries ──
    if unmatched_db and not dry_run:
        dead_ids = [row["id"] for row in unmatched_db]
        print(f"\n🗑️  Removing {len(dead_ids)} dead entries (files no longer exist)...")
        # Batch in groups of 100
        for i in range(0, len(dead_ids), 100):
            batch = dead_ids[i:i + 100]
            ids_str = ",".join(batch)
            psql_execute(f"DELETE FROM audio_index WHERE id IN ({ids_str});\n")
        print(f"   Removed {len(dead_ids)} entries")

    # ── PHASE 2: Insert new entries ──
    if still_unmatched_fs and not dry_run:
        print(f"\n➕ Inserting {len(still_unmatched_fs)} new entries...")
        sql_parts = []
        for f in still_unmatched_fs:
            info = parse_filename(f["filename"], f["abspath"])
            book_name = infer_book_name_from_path(f["abspath"], f["relpath"], f["book_dir"], f["filename"])

            cd_val = "NULL" if info["cd_num"] is None else str(info["cd_num"])
            track_val = "NULL" if info["track_num"] is None else str(info["track_num"])
            dir_val = quote_literal(f["book_dir"])
            path_val = quote_literal(f["abspath"])
            name_val = quote_literal(f["filename"])
            book_val = quote_literal(book_name)

            sql_parts.append(
                f"({name_val}, {path_val}, {dir_val}, {book_val}, {cd_val}, {track_val})"
            )

        if sql_parts:
            insert_sql = (
                "INSERT INTO audio_index (file_name, file_path, directory, book_name, cd_num, track_num)\n"
                "VALUES\n" + ",\n".join(sql_parts) + ";\n"
            )
            psql_execute(insert_sql)
            print(f"   Inserted {len(sql_parts)} entries")

    # ── PHASE 3: Fix file_path for DB entries whose file moved ──
    if not dry_run:
        print("\n🔄 Fixing moved file paths...")
        updates = 0
        for f in fs_files:
            low_name = f["filename"].lower()
            if low_name in filename_to_db and f["abspath"] not in db_rows:
                for row in filename_to_db[low_name]:
                    if row["file_path"] != f["abspath"]:
                        safe_path = f["abspath"].replace("'", "''")
                        psql_execute(
                            f"UPDATE audio_index SET file_path = '{safe_path}' WHERE id = {row['id']};\n"
                        )
                        updates += 1
        print(f"   Fixed {updates} paths")

    # ── PHASE 4: Set linked_page where we can map track→page ──
    if not dry_run:
        print("\n🔗 Setting linked_page from materials_registry...")
        linked = 0
        for ai_path, row in db_rows.items():
            if row["linked_page"]:
                continue
            # Try to find a matching materials_registry entry
            # Strategy: match by book_name (via mapping) + track_num as page
            mr_book = book_map.get(row["book_name"])
            if mr_book and row["track_num"]:
                # Check if track_num corresponds to a page in this book
                result = psql(f"""
                    SELECT page_num FROM materials_registry
                    WHERE book_name = {dq(mr_book)} AND page_num = {row['track_num']}
                    LIMIT 1
                """)
                if result:
                    psql_execute(
                        f"UPDATE audio_index SET linked_page = {result} WHERE id = {row['id']};\n"
                    )
                    linked += 1
        print(f"   Linked {linked} tracks to transcription pages")

    # ── PHASE 5: Update book_name metadata if inferrable ──
    if not dry_run:
        print("\n🏷️  Updating book_name from path inference...")
        updates = 0
        for path, row in db_rows.items():
            if row["book_name"] and row["book_name"] not in ("", "CD1", "CD2", "CD3", "CD Kursbuch 1-4", "CD Kursbuch 5-8"):
                continue
            # Try to infer a better book_name from the path
            if path in fs_by_path:
                f = fs_by_path[path]
                inferred = infer_book_name_from_path(f["abspath"], f["relpath"], f["book_dir"], f["filename"])
                if inferred and inferred != row["book_name"]:
                    safe = inferred.replace("'", "''")
                    psql_execute(
                        f"UPDATE audio_index SET book_name = '{safe}' WHERE id = {row['id']};\n"
                    )
                    updates += 1
        print(f"   Updated {updates} book_names")

    # Final state
    final_count = psql("SELECT COUNT(*) FROM audio_index;")
    linked_count = psql("SELECT COUNT(*) FROM audio_index WHERE linked_page IS NOT NULL;")
    null_cd = psql("SELECT COUNT(*) FROM audio_index WHERE cd_num IS NULL;")
    null_book = psql("SELECT COUNT(*) FROM audio_index WHERE book_name IS NULL OR book_name = '';")

    print(f"\n{'='*60}")
    print(f"  Final State")
    print(f"{'='*60}")
    print(f"  Total audio_index rows     : {final_count}")
    print(f"  With linked_page            : {linked_count}")
    print(f"  NULL cd_num                 : {null_cd}")
    print(f"  Empty book_name             : {null_book}")
    print(f"{'='*60}")


def main():
    parser = argparse.ArgumentParser(description="Unify and fix audio_index with filesystem")
    parser.add_argument("--dry-run", action="store_true", help="Report only, no changes")
    parser.add_argument("--scan-only", action="store_true", help="Just scan filesystem + report")
    parser.add_argument("--yes", action="store_true", help="Skip confirmation prompt")
    args = parser.parse_args()
    try:
        run(args)
    except RuntimeError as e:
        print(f"ERROR: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
