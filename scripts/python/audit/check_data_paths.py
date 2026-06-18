#!/usr/bin/env python3
"""Check DB paths vs filesystem for known issues."""

import argparse
import os
import subprocess
from datetime import datetime


def query(sql):
    return subprocess.check_output(
        ['psql', '-d', 'deutsch', '-At', '-F', '\t', '-c', sql],
        text=True
    )


def check_paths(rows, base_dir):
    total = 0
    missing = []
    outside = []
    empty = 0
    for row in rows:
        if not row:
            continue
        parts = row.split('\t')
        path = parts[0] if parts else ''
        meta = parts[1] if len(parts) > 1 else ''
        if not path:
            empty += 1
            continue
        total += 1
        if not os.path.isabs(path):
            outside.append((path, meta, 'not-absolute'))
            continue
        if not path.startswith(base_dir + os.sep):
            outside.append((path, meta, 'outside-base'))
        if not os.path.exists(path):
            missing.append((path, meta))
    return total, empty, missing, outside


def print_section(title, total, empty, missing, outside, sample=5):
    print(f"\n{title}")
    print(f"  total non-empty: {total}, empty: {empty}")
    print(f"  missing files: {len(missing)}")
    print(f"  outside base: {len(outside)}")
    if missing:
        print("  sample missing:")
        for path, meta in missing[:sample]:
            print(f"    {path} :: {meta}")
    if outside:
        print("  sample outside:")
        for path, meta, tag in outside[:sample]:
            print(f"    {path} :: {meta} ({tag})")


def main():
    parser = argparse.ArgumentParser(description='Check data path integrity')
    parser.add_argument('--base', default='/home/f/deutsch-app/de', help='Courses base dir')
    parser.add_argument('--sample', type=int, default=5, help='Sample size for output')
    args = parser.parse_args()

    base_dir = os.path.abspath(args.base)

    print(f"Data path audit @ {datetime.now().isoformat(timespec='seconds')}")
    print(f"Base dir: {base_dir}")

    # materials_registry
    pdf_rows = query(
        "SELECT pdf_path || '\t' || book_name || ':' || page_num "
        "FROM materials_registry WHERE pdf_path IS NOT NULL;"
    ).strip().split('\n')
    total, empty, missing, outside = check_paths(pdf_rows, base_dir)
    print_section('materials_registry.pdf_path', total, empty, missing, outside, args.sample)

    for col in ['txt_path', 'ai_path']:
        rows = query(
            f"SELECT COALESCE({col}, '') || '\t' || book_name || ':' || page_num "
            "FROM materials_registry;"
        ).strip().split('\n')
        total, empty, missing, outside = check_paths(rows, base_dir)
        print_section(f"materials_registry.{col}", total, empty, missing, outside, args.sample)

    # audio_index
    audio_rows = query(
        "SELECT file_path || '\t' || file_name FROM audio_index WHERE file_path IS NOT NULL;"
    ).strip().split('\n')
    total, empty, missing, outside = check_paths(audio_rows, base_dir)
    print_section('audio_index.file_path', total, empty, missing, outside, args.sample)

    # ejercicios audio_path
    ex_rows = query(
        "SELECT COALESCE(audio_path, '') || '\t' || id FROM ejercicios;"
    ).strip().split('\n')
    total, empty, missing, outside = check_paths(ex_rows, base_dir)
    print_section('ejercicios.audio_path', total, empty, missing, outside, args.sample)


if __name__ == '__main__':
    main()
