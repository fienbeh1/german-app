#!/usr/bin/env python3
"""
update_delfin_db.py — Update Delfin materials_registry and raw_data with re-OCR'd text and re-run AI analysis.

Usage:
    python3 update_delfin_db.py [--dry-run]
"""

import argparse
import hashlib
import os
import subprocess
import sys
from datetime import datetime

DELFIN_DIR = "/home/f/deutsch-app/de/delfin"
PDF_DIR = os.path.join(DELFIN_DIR, "pdf")
TXT_DIR = os.path.join(DELFIN_DIR, "txt")
AI_DIR = os.path.join(DELFIN_DIR, "ai")
DB_NAME = "deutsch"
DB_USER = "f"

def run_psql(sql: str) -> str:
    cmd = ["psql", "-d", DB_NAME, "-U", DB_USER, "-v", "ON_ERROR_STOP=1", "-At", "-q"]
    result = subprocess.run(cmd, input=sql, text=True, capture_output=True, check=False)
    if result.returncode != 0:
        err = result.stderr.strip()
        if err:
            raise RuntimeError(err[:500])
    return result.stdout.strip()

def dq(value: str) -> str:
    tag = "DQ"
    while tag in value:
        tag = f"DQ{hash(value) & 0x7fffffff}"
    return f"${tag}${value}${tag}$"

def file_md5(path: str) -> str:
    h = hashlib.md5()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            h.update(chunk)
    return h.hexdigest()

def upsert_raw_data(content_type: str, file_path: str, book_name: str,
                     page_num: int, parent_txt_id=None, dry_run=False):
    if not os.path.exists(file_path) or os.path.getsize(file_path) < 2:
        return None

    file_name = os.path.basename(file_path)
    fsize = os.path.getsize(file_path)
    md5 = file_md5(file_path)
    directory = os.path.dirname(file_path)

    try:
        with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
            content = f.read()
    except Exception:
        content = ""

    # Check if raw_data entry already exists for this file_path + content_type
    existing = run_psql(f"SELECT id FROM raw_data WHERE file_path = {dq(file_path)} AND content_type = {dq(content_type)} LIMIT 1;")
    
    parent = "NULL"
    if parent_txt_id is not None:
        parent = str(parent_txt_id)

    if existing and existing.strip():
        eid = existing.strip()
        if not dry_run:
            run_psql(f"""
                UPDATE raw_data SET
                    content_txt = {dq(content)},
                    file_name = {dq(file_name)},
                    book_name = {dq(book_name)},
                    page_num = {page_num},
                    directory = {dq(directory)},
                    file_size = {fsize},
                    md5_hash = {dq(md5)},
                    parent_txt_id = {parent}
                WHERE id = {eid};
            """)
        return int(eid)

    if dry_run:
        print(f"    [DRY-RUN] WOULD INSERT raw_data: {file_name} ({content_type}, {fsize} bytes)")
        return None

    result = run_psql(f"""
        INSERT INTO raw_data (content_txt, content_type, file_name, file_path,
                              book_name, page_num, directory, file_size, md5_hash, parent_txt_id)
        VALUES (
            {dq(content)},
            {dq(content_type)},
            {dq(file_name)},
            {dq(file_path)},
            {dq(book_name)},
            {page_num},
            {dq(directory)},
            {fsize},
            {dq(md5)},
            {parent}
        )
        RETURNING id;
    """)
    return int(result.strip())

def process_book(prefix: str, book_name: str, dry_run: bool):
    print(f"\n=== Processing {book_name} ===")
    total = 0

    for pdf_file in sorted(os.listdir(PDF_DIR)):
        if not pdf_file.endswith(".pdf") or not pdf_file.startswith(prefix):
            continue

        base = pdf_file.replace(".pdf", "")
        page_num_str = base.split("-")[-1]
        try:
            page_num = int(page_num_str)
        except ValueError:
            continue

        pdf_path = os.path.join(PDF_DIR, pdf_file)
        txt_path = os.path.join(TXT_DIR, f"{base}.txt")
        ai_file = os.path.join(AI_DIR, f"AI_{base}.txt")

        txt_id = None
        ai_id = None

        # Upsert txt
        if os.path.exists(txt_path) and os.path.getsize(txt_path) > 10:
            txt_id = upsert_raw_data("txt", txt_path, book_name, page_num, dry_run=dry_run)

        # Upsert ai (depends on txt_id if available)
        if os.path.exists(ai_file) and os.path.getsize(ai_file) > 20:
            ai_id = upsert_raw_data("ai", ai_file, book_name, page_num,
                                     parent_txt_id=txt_id, dry_run=dry_run)

        has_txt = "TRUE" if txt_id else "FALSE"
        has_ai = "TRUE" if ai_id else "FALSE"
        txt_id_s = str(txt_id) if txt_id else "NULL"
        ai_id_s = str(ai_id) if ai_id else "NULL"

        # Update materials_registry
        existing = run_psql(f"SELECT id FROM materials_registry WHERE book_name = {dq(book_name)} AND page_num = {page_num} LIMIT 1;")

        if existing and existing.strip():
            rid = existing.strip()
            if not dry_run:
                run_psql(f"""
                    UPDATE materials_registry SET
                        txt_path = {dq(txt_path)},
                        ai_path = {dq(ai_file)},
                        raw_data_txt_id = {txt_id_s},
                        raw_data_ai_id = {ai_id_s},
                        has_txt = {has_txt},
                        has_ai = {has_ai}
                    WHERE id = {rid};
                """)
                print(f"  Updated: {book_name} p{page_num} (txt={txt_id}, ai={ai_id})")
        else:
            if dry_run:
                print(f"  [DRY-RUN] WOULD INSERT: {book_name} p{page_num}")
            else:
                run_psql(f"""
                    INSERT INTO materials_registry (book_name, page_num, directory, pdf_path, txt_path, ai_path,
                                                     raw_data_txt_id, raw_data_ai_id, has_txt, has_ai, has_pdf)
                    VALUES (
                        {dq(book_name)}, {page_num}, {dq(DELFIN_DIR)},
                        {dq(pdf_path)}, {dq(txt_path)}, {dq(ai_file)},
                        {txt_id_s}, {ai_id_s},
                        {has_txt}, {has_ai}, TRUE
                    );
                """)
                print(f"  Inserted: {book_name} p{page_num}")

        total += 1

    print(f"  Total: {total} pages for {book_name}")
    return total

def main():
    parser = argparse.ArgumentParser(description="Update Delfin DB with re-OCR'd data")
    parser.add_argument("--dry-run", action="store_true", help="Preview only")
    args = parser.parse_args()

    if args.dry_run:
        print("=" * 60)
        print("DRY RUN — No changes will be made")
        print("=" * 60)

    print(f"Starting at {datetime.now().isoformat()}")
    print(f"  Dry run: {args.dry_run}")

    t1 = process_book("Delfin_Lehrbuch", "delfin/Delfin_Lehrbuch", args.dry_run)
    t2 = process_book("Delfin_Arbeitsbuch", "delfin/Delfin_Arbeitsbuch", args.dry_run)

    print(f"\n{'=' * 60}")
    print(f"Done at {datetime.now().isoformat()}")
    print(f"  Lehrbuch: {t1} pages")
    print(f"  Arbeitsbuch: {t2} pages")
    print(f"{'=' * 60}")

if __name__ == "__main__":
    main()
