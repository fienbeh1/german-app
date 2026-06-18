#!/usr/bin/env python3
"""
ingest_delfin.py — Register Delfin materials into PostgreSQL.

Scans delfin/pdf/, delfin/txt/, delfin/ai/, and delfin/Audio/ directories,
then upserts into materials_registry and audio_index.

Idempotent: safe to run multiple times (uses ON CONFLICT / upsert logic).

Usage:
    python3 ingest_delfin.py [--dry-run]

Examples:
    python3 ingest_delfin.py
    python3 ingest_delfin.py --dry-run    # show what would be inserted
"""

import argparse
import hashlib
import os
import re
import subprocess
import sys
import time
from datetime import datetime
from pathlib import Path

# ── Configuration ────────────────────────────────────────────────────────────

DELFIN_DIR = "/home/f/deutsch-app/de/delfin"
PDF_DIR = os.path.join(DELFIN_DIR, "pdf")
TXT_DIR = os.path.join(DELFIN_DIR, "txt")
AI_DIR = os.path.join(DELFIN_DIR, "ai")
AUDIO_DIR = os.path.join(DELFIN_DIR, "Audio")
DB_NAME = "deutsch"
DB_USER = "f"

KNOWN_BOOKS = {
    "Delfin_Lehrbuch":   "delfin/Delfin_Lehrbuch",
    "Delfin_Arbeitsbuch": "delfin/Delfin_Arbeitsbuch",
    "Delfin_Glossar":    "delfin/Delfin_Glossar",
    "Delfin_Answers":    "delfin/Delfin_Answers",
}


# ── PostgreSQL helpers (same pattern as master_controller.py) ────────────────

def run_psql(sql: str, quiet: bool = True) -> str:
    cmd = ["psql", "-d", DB_NAME, "-U", DB_USER, "-v", "ON_ERROR_STOP=1", "-At"]
    if quiet:
        cmd.append("-q")
    result = subprocess.run(
        cmd,
        input=sql,
        text=True,
        capture_output=True,
        check=False,
    )
    if result.returncode != 0:
        raise RuntimeError(result.stderr.strip())
    return result.stdout.strip()


def dollar_quote(value: str) -> str:
    tag = "DQ"
    while tag in value:
        tag = f"DQ{int(time.time() * 1000)}"
        time.sleep(0.001)
    return f"${tag}${value}${tag}$"


# ── Helpers ──────────────────────────────────────────────────────────────────

def parse_page_num(filename: str) -> int:
    match = re.search(r"-(\d+)\.(pdf|txt)$", filename)
    if match:
        return int(match.group(1))
    match = re.search(r"(\d+)(?!.*\d)", filename.replace(".txt", "").replace(".pdf", ""))
    if match:
        return int(match.group(1))
    return 0


def file_md5(path: str) -> str:
    md5 = hashlib.md5()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            md5.update(chunk)
    return md5.hexdigest()


def detect_book_name(prefix: str) -> str:
    return KNOWN_BOOKS.get(prefix, f"delfin/{prefix}")


def strip_ai_prefix(filename: str) -> str:
    if filename.startswith("AI_"):
        return filename[3:]
    return filename


# ── Core logic ───────────────────────────────────────────────────────────────

def upsert_material(book_name: str, page_num: int, pdf_path: str,
                    txt_path: str | None, ai_path: str | None,
                    dry_run: bool = False) -> int | None:
    """Upsert a single page into materials_registry. Returns the row id."""

    # Check existing
    try:
        existing = run_psql(
            f"SELECT id FROM materials_registry "
            f"WHERE book_name = {dollar_quote(book_name)} AND page_num = {page_num} "
            f"LIMIT 1;"
        )
    except RuntimeError:
        existing = ""

    if existing and existing.strip():
        reg_id = int(existing.strip())
        if dry_run:
            print(f"  [DRY-RUN] WOULD UPDATE: {book_name} p{page_num} (id={reg_id})")
            return reg_id
        # Update existing row
        txt_id = "NULL"
        ai_id = "NULL"
        has_txt = "FALSE"
        has_ai = "FALSE"

        if txt_path and os.path.exists(txt_path):
            txt_id = _upsert_raw_data("txt", txt_path, book_name, page_num, dry_run)
            has_txt = "TRUE"
        if ai_path and os.path.exists(ai_path):
            ai_id = _upsert_raw_data("ai", ai_path, book_name, page_num, dry_run,
                                     parent_txt_id=txt_id if txt_id != "NULL" else None)
            has_ai = "TRUE"

        sql = f"""
            UPDATE materials_registry SET
                pdf_path = {dollar_quote(pdf_path)},
                txt_path = {dollar_quote(txt_path or '')},
                ai_path = {dollar_quote(ai_path or '')},
                raw_data_txt_id = {txt_id},
                raw_data_ai_id = {ai_id},
                has_txt = {has_txt},
                has_ai = {has_ai}
            WHERE id = {reg_id};
        """
        if dry_run:
            print(f"  [DRY-RUN] SQL: {sql[:120]}...")
        else:
            run_psql(sql)
        return reg_id

    # New insert
    txt_id = "NULL"
    ai_id = "NULL"
    has_txt = "FALSE"
    has_ai = "FALSE"

    if txt_path and os.path.exists(txt_path):
        txt_id = _upsert_raw_data("txt", txt_path, book_name, page_num, dry_run)
        has_txt = "TRUE"
    if ai_path and os.path.exists(ai_path):
        ai_id = _upsert_raw_data("ai", ai_path, book_name, page_num, dry_run,
                                 parent_txt_id=txt_id if txt_id != "NULL" else None)
        has_ai = "TRUE"

    sql = f"""
        INSERT INTO materials_registry (
            book_name, page_num, directory, pdf_path, txt_path, ai_path,
            raw_data_txt_id, raw_data_ai_id, has_txt, has_ai, has_pdf
        ) VALUES (
            {dollar_quote(book_name)},
            {page_num},
            {dollar_quote(DELFIN_DIR)},
            {dollar_quote(pdf_path)},
            {dollar_quote(txt_path or '')},
            {dollar_quote(ai_path or '')},
            {txt_id},
            {ai_id},
            {has_txt},
            {has_ai},
            TRUE
        )
        ON CONFLICT (book_name, page_num) DO UPDATE SET
            txt_path = EXCLUDED.txt_path,
            ai_path = EXCLUDED.ai_path,
            directory = EXCLUDED.directory,
            raw_data_txt_id = COALESCE(EXCLUDED.raw_data_txt_id, materials_registry.raw_data_txt_id),
            raw_data_ai_id = COALESCE(EXCLUDED.raw_data_ai_id, materials_registry.raw_data_ai_id),
            has_txt = EXCLUDED.has_txt,
            has_ai = EXCLUDED.has_ai
        RETURNING id;
    """
    if dry_run:
        print(f"  [DRY-RUN] WOULD INSERT: {book_name} p{page_num}")
        return None
    result = run_psql(sql)
    reg_id = int(result.strip())
    return reg_id


def _upsert_raw_data(content_type: str, file_path: str, book_name: str,
                     page_num: int, dry_run: bool = False,
                     parent_txt_id: int | str | None = None) -> str:
    """Upsert a file's content into raw_data. Returns the id string or 'NULL'."""
    if not os.path.exists(file_path):
        return "NULL"

    file_name = os.path.basename(file_path)
    fsize = os.path.getsize(file_path)
    md5_hash = file_md5(file_path)
    directory = os.path.dirname(file_path)

    try:
        with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
            content = f.read()
    except Exception:
        content = ""

    parent = "NULL"
    if parent_txt_id is not None:
        parent = str(parent_txt_id) if isinstance(parent_txt_id, int) else parent_txt_id

    # Check if raw_data entry already exists
    try:
        existing = run_psql(
            f"SELECT id FROM raw_data "
            f"WHERE file_path = {dollar_quote(file_path)} AND content_type = {dollar_quote(content_type)} "
            f"ORDER BY id DESC LIMIT 1;"
        )
    except RuntimeError:
        existing = ""

    if existing and existing.strip():
        eid = existing.strip()
        if not dry_run:
            sql = f"""
                UPDATE raw_data SET
                    content_txt = {dollar_quote(content)},
                    file_name = {dollar_quote(file_name)},
                    book_name = {dollar_quote(book_name)},
                    page_num = {page_num},
                    directory = {dollar_quote(directory)},
                    file_size = {fsize},
                    md5_hash = {dollar_quote(md5_hash)},
                    parent_txt_id = {parent}
                WHERE id = {eid};
            """
            run_psql(sql)
        return eid

    if dry_run:
        return "NULL"

    sql = f"""
        INSERT INTO raw_data (content_txt, content_type, file_name, file_path,
                              book_name, page_num, directory, file_size, md5_hash, parent_txt_id)
        VALUES (
            {dollar_quote(content)},
            {dollar_quote(content_type)},
            {dollar_quote(file_name)},
            {dollar_quote(file_path)},
            {dollar_quote(book_name)},
            {page_num},
            {dollar_quote(directory)},
            {fsize},
            {dollar_quote(md5_hash)},
            {parent}
        )
        RETURNING id;
    """
    result = run_psql(sql)
    return result.strip()


def ingest_materials(dry_run: bool = False) -> int:
    """Scan pdf/, txt/, ai/ dirs and upsert into materials_registry."""
    total = 0

    if not os.path.isdir(PDF_DIR):
        print(f"ERROR: PDF directory not found: {PDF_DIR}")
        return 0

    for pdf_file in sorted(os.listdir(PDF_DIR)):
        if not pdf_file.endswith(".pdf"):
            continue

        page_num = parse_page_num(pdf_file)
        if page_num == 0:
            print(f"  WARNING: Could not parse page number from {pdf_file}")
            continue

        # Determine book name from prefix
        prefix = pdf_file.rsplit("-", 1)[0] if "-" in pdf_file else pdf_file.replace(".pdf", "")
        book_name = detect_book_name(prefix)

        pdf_path = os.path.join(PDF_DIR, pdf_file)
        txt_file = pdf_file.replace(".pdf", ".txt")
        txt_path = os.path.join(TXT_DIR, txt_file) if os.path.exists(os.path.join(TXT_DIR, txt_file)) else None

        # AI files: try with and without AI_ prefix
        ai_path = None
        ai_candidate = os.path.join(AI_DIR, f"AI_{txt_file}")
        if os.path.exists(ai_candidate):
            ai_path = ai_candidate
        else:
            ai_candidate2 = os.path.join(AI_DIR, txt_file)
            if os.path.exists(ai_candidate2):
                ai_path = ai_candidate2

        upsert_material(book_name, page_num, pdf_path, txt_path, ai_path, dry_run)
        total += 1

        if total % 50 == 0 and not dry_run:
            print(f"  ... {total} pages processed")

    return total


def ingest_audio(dry_run: bool = False) -> int:
    """Scan Audio/ dir and upsert into audio_index."""
    total = 0

    if not os.path.isdir(AUDIO_DIR):
        print(f"WARNING: Audio directory not found: {AUDIO_DIR}")
        return 0

    for audio_file in sorted(os.listdir(AUDIO_DIR)):
        if not audio_file.lower().endswith((".mp3", ".wav", ".ogg", ".m4a", ".flac")):
            continue

        audio_path = os.path.join(AUDIO_DIR, audio_file)
        fsize = os.path.getsize(audio_path)
        md5_hash = file_md5(audio_path)

        # Extract track number from filename
        track_num = 0
        m = re.search(r"Track\s*(\d+)", audio_file, re.IGNORECASE)
        if m:
            track_num = int(m.group(1))
        m = re.search(r"_T(\d+)", audio_file)
        if m:
            track_num = int(m.group(1))

        # Extract CD number
        cd_num = 0
        m = re.search(r"CD(\d+)", audio_file, re.IGNORECASE)
        if m:
            cd_num = int(m.group(1))

        # Check existing
        try:
            existing = run_psql(
                f"SELECT id FROM audio_index "
                f"WHERE file_path = {dollar_quote(audio_path)} "
                f"LIMIT 1;"
            )
        except RuntimeError:
            existing = ""

        if existing and existing.strip():
            continue

        if dry_run:
            print(f"  [DRY-RUN] WOULD INSERT: {audio_file} (track {track_num}, CD {cd_num})")
            total += 1
            continue

        sql = f"""
            INSERT INTO audio_index (file_name, file_path, directory, book_name,
                                     track_num, cd_num, file_size, md5_hash)
            VALUES (
                {dollar_quote(audio_file)},
                {dollar_quote(audio_path)},
                {dollar_quote(AUDIO_DIR)},
                'delfin',
                {track_num},
                {cd_num},
                {fsize},
                {dollar_quote(md5_hash)}
            )
            ON CONFLICT DO NOTHING;
        """
        run_psql(sql)
        total += 1

    return total


def print_summary() -> None:
    """Print a summary of current Delfin DB state."""
    try:
        pages = run_psql(
            "SELECT COUNT(*) FROM materials_registry WHERE book_name LIKE 'delfin/%';"
        ) or "0"
        pdfs = run_psql(
            "SELECT COUNT(*) FROM materials_registry WHERE book_name LIKE 'delfin/%' AND has_pdf = TRUE;"
        ) or "0"
        txts = run_psql(
            "SELECT COUNT(*) FROM materials_registry WHERE book_name LIKE 'delfin/%' AND has_txt = TRUE;"
        ) or "0"
        ais = run_psql(
            "SELECT COUNT(*) FROM materials_registry WHERE book_name LIKE 'delfin/%' AND has_ai = TRUE;"
        ) or "0"
        audio = run_psql(
            "SELECT COUNT(*) FROM audio_index WHERE book_name = 'delfin';"
        ) or "0"
        books = run_psql(
            "SELECT DISTINCT book_name FROM materials_registry WHERE book_name LIKE 'delfin/%' ORDER BY book_name;"
        ) or ""

        print(f"\n{'='*60}")
        print(f"Delfin DB Summary")
        print(f"{'='*60}")
        print(f"  Registered books:")
        for b in books.strip().split("\n"):
            if b:
                cnt = run_psql(
                    f"SELECT COUNT(*) FROM materials_registry WHERE book_name = {dollar_quote(b)};"
                ) or "0"
                print(f"    {b}: {cnt} pages")
        print(f"  Total pages:       {pages.strip()}")
        print(f"  With PDFs:         {pdfs.strip()}")
        print(f"  With OCR text:     {txts.strip()}")
        print(f"  With AI analysis:  {ais.strip()}")
        print(f"  Audio tracks:      {audio.strip()}")
        print(f"{'='*60}")
    except RuntimeError as e:
        print(f"  Could not query DB: {e}")


# ── Main ─────────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Ingest Delfin materials into PostgreSQL database"
    )
    parser.add_argument("--dry-run", action="store_true",
                        help="Show what would be done without making changes")
    parser.add_argument("--materials-only", action="store_true",
                        help="Only process materials_registry (skip audio)")
    parser.add_argument("--audio-only", action="store_true",
                        help="Only process audio_index (skip materials)")
    parser.add_argument("--summary", action="store_true",
                        help="Print DB summary and exit")
    args = parser.parse_args()

    if args.summary:
        print_summary()
        return

    if args.dry_run:
        print(f"{'='*60}")
        print(f"DRY RUN — No changes will be made")
        print(f"{'='*60}")

    print(f"Delfin ingest starting at {datetime.now().isoformat()}")
    print(f"  Dry run: {args.dry_run}")

    if not args.audio_only:
        print(f"\n{'─'*60}")
        print("Step 1: Ingest materials (pages / PDF / txt / ai)")
        print(f"{'─'*60}")
        total = ingest_materials(dry_run=args.dry_run)
        print(f"  Processed {total} page entries")

    if not args.materials_only:
        print(f"\n{'─'*60}")
        print("Step 2: Ingest audio files")
        print(f"{'─'*60}")
        total_audio = ingest_audio(dry_run=args.dry_run)
        print(f"  Processed {total_audio} audio files")

    print(f"\n{'─'*60}")
    print_summary()
    print(f"\nDone at {datetime.now().isoformat()}")


if __name__ == "__main__":
    main()
